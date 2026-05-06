// App.jsx — main shell
import React from 'react';
// Fusionne le statut basé sur les réservations avec la télémétrie réelle du bridge
function mergePrinterStatus(resStatus, tel) {
  if (!tel) return resStatus;
  if (Date.now() - new Date(tel.updated_at).getTime() > 120_000) return resStatus; // trop vieux
  if (tel.state === 'printing') return {
    state: 'printing',
    progress: Math.min(1, (tel.progress || 0) / 100),
    etaMin: tel.remaining_min ?? resStatus.etaMin,
    fromTelemetry: true,
  };
  if (tel.state === 'paused')  return { state: 'paused',  fromTelemetry: true };
  if (tel.state === 'error')   return { state: 'error',   fromTelemetry: true };
  if (tel.state === 'offline') return { state: 'offline', fromTelemetry: true };
  return resStatus; // idle → on garde le planning
}

function normalizeRemainingMinutes(tel) {
  const raw = Number(tel?.remaining_min);
  if (!Number.isFinite(raw)) return 30;  // donnée absente → fallback
  if (raw <= 0) return 0;               // quasi-fini → 0 affiché "maintenant"
  return Math.max(1, Math.round(raw));
}

const kioskChipStyle = {
  fontSize: 10, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
  padding: '2px 6px', borderRadius: 5,
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.55)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  display: 'inline-flex', alignItems: 'center',
};

// Garantit qu'une couleur hex est lisible sur fond sombre (#131313).
// Les couleurs trop sombres (noir, bleu nuit, vert foncé…) sont remontées à L=62%.
function safeFilamentColor(hex) {
  if (!hex || hex.length < 7) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l > 0.38) return hex;
  if (max === min) return 'rgba(255,255,255,0.75)'; // noir/gris très foncé → gris clair
  const d = max - min;
  const s = d / (l < 0.5 ? max + min : 2 - max - min);
  let h = 0;
  if (max === r)      h = ((g - b) / d % 6) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else                h = ((r - g) / d + 4) * 60;
  if (h < 0) h += 360;
  return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, 62%)`;
}

function swatchBorder(hex) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? '2px solid rgba(0,0,0,0.35)' : '2px solid rgba(255,255,255,0.18)';
}
import {
  PRINTERS, NOW_FIXED,
  computePrinterStatus,
  printerById, printerColor,
  fmtTime, fmtTimeRound, fmtDuration, fmtRelativeFuture,
} from './data.js';
import {
  getSessionUser, onAuthChange, logoutUser,
  loadReservations, addReservation, deleteReservation, subscribeToReservations,
  loadMaintenance, subscribeToMaintenance,
  loadFilamentColors, subscribeToFilamentColors,
  loadPrinterTelemetry, loadPrinterCameraTelemetry, subscribeToPrinterTelemetry,
  getCameraUrl,
} from './supabase.js';
import { Icon, Avatar, Btn, GlobalAnims, StatePill } from './ui.jsx';
import {
  useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakSlider,
} from './TweaksPanel.jsx';
import { PrinterCard } from './PrinterCard.jsx';
import { ReserveModal } from './ReserveModal.jsx';
import { AdminPanel } from './AdminPanel.jsx';
import { StatsPanel } from './StatsPanel.jsx';
import {
  LoginScreen, RegisterScreen, MyReservationsPanel, PrinterDetailPanel, NotificationToast,
} from './screens.jsx';

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "density": "regular",
  "slotSize": 30,
  "view": "dashboard",
  "hourSpan": 24
}/*EDITMODE-END*/;

const isKiosk = new URLSearchParams(window.location.search).get('kiosk') === '1';
const RESERVATION_LIMIT_24H = 5;
const CAMERA_PATH = '/camera';
const HOME_PATH = '/';

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [pathname, setPathname] = React.useState(window.location.pathname || HOME_PATH);
  const [me, setMe] = React.useState(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authScreen, setAuthScreen] = React.useState('login');
  const [reservations, setReservations] = React.useState([]);
  const [loadingReservations, setLoadingReservations] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [reserveModalOpen, setReserveModalOpen] = React.useState(false);
  const [reserveDefaultPrinter, setReserveDefaultPrinter] = React.useState(null);
  const [myResOpen, setMyResOpen] = React.useState(false);
  const [detailPrinterId, setDetailPrinterId] = React.useState(null);
  const [notif, setNotif] = React.useState(null);
  const [adminPanelOpen, setAdminPanelOpen] = React.useState(false);
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [maintenanceMap, setMaintenanceMap] = React.useState({});
  const [filamentColors, setFilamentColors] = React.useState([]);
  const [wsStatus, setWsStatus] = React.useState('connecting');
  const [telemetryMap, setTelemetryMap] = React.useState({});
  const [cameraTelemetryMap, setCameraTelemetryMap] = React.useState({});
  const [cameraFocusId, setCameraFocusId] = React.useState(null);

  const isPublicCameraRoute = !isKiosk && pathname === CAMERA_PATH;
  const activeView = !isKiosk && pathname === CAMERA_PATH ? 'camera' : t.view;
  const elapsedMin = (Date.now() - NOW_FIXED.getTime()) / 60_000;

  React.useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || HOME_PATH);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = React.useCallback((path, nextView = null) => {
    if (nextView !== null && t.view !== nextView) {
      setTweak('view', nextView);
    }
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
      setPathname(path);
    }
  }, [setTweak, t.view]);

  const setAppView = React.useCallback((view) => {
    if (view === 'camera') {
      navigateTo(CAMERA_PATH, 'camera');
      return;
    }
    navigateTo(HOME_PATH, view);
  }, [navigateTo]);

  // If a printer is actively printing without an active reservation, inject a
  // synthetic timeline slot so users can see real occupancy on the planning.
  const autoPrintReservations = React.useMemo(() => {
    const list = [];
    for (const p of PRINTERS) {
      const tel = telemetryMap[p.id];
      if (!tel) continue;
      if (!['printing', 'paused'].includes(tel.state)) continue;
      const updatedAt = tel.updated_at ? new Date(tel.updated_at).getTime() : 0;
      if (!updatedAt || Date.now() - updatedAt > 120_000) continue;

      const hasActiveSlot = reservations.some(r =>
        r.printerId === p.id &&
        r.startMin <= elapsedMin &&
        r.startMin + r.durationMin > elapsedMin
      );
      if (hasActiveSlot) continue;

      const remaining = normalizeRemainingMinutes(tel);
      const durationMin = Math.max(5, Math.ceil(remaining));
      const startMin = Math.floor(elapsedMin);

      list.push({
        id: `auto-live-${p.id}`,
        printerId: p.id,
        login: '',
        firstName: 'Impression',
        lastName: 'non assignée',
        project: tel.current_file || 'Impression en cours',
        startMin,
        durationMin,
      });
    }
    return list;
  }, [telemetryMap, reservations, elapsedMin]);

  const reservationsForDisplay = React.useMemo(() => {
    if (autoPrintReservations.length === 0) return reservations;
    return [...reservations, ...autoPrintReservations].sort((a, b) => a.startMin - b.startMin);
  }, [reservations, autoPrintReservations]);

  // Session Supabase — persiste automatiquement entre les refreshs
  React.useEffect(() => {
    getSessionUser().then(user => { setMe(user); setAuthLoading(false); });
    return onAuthChange(user => { setMe(user); setAuthLoading(false); });
  }, []);

  // Chargement réservations + realtime WebSocket
  React.useEffect(() => {
    loadReservations().then(data => { setReservations(data); setLoadingReservations(false); });
    const channel = subscribeToReservations(
      () => { loadReservations().then(setReservations); },
      (status) => {
        if (status === 'SUBSCRIBED') {
          setWsStatus('connected');
          loadReservations().then(setReservations);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setWsStatus('error');
        } else {
          setWsStatus('connecting');
        }
      }
    );
    return () => channel.unsubscribe();
  }, []);

  // Maintenance — chargement + realtime + polling fallback
  const refreshMaintenance = React.useCallback(() =>
    loadMaintenance().then(rows =>
      setMaintenanceMap(Object.fromEntries(rows.map(r => [r.printer_id, r])))
    ), []);

  React.useEffect(() => {
    refreshMaintenance();
    const channel = subscribeToMaintenance(refreshMaintenance);
    const poll = setInterval(refreshMaintenance, 10_000);
    return () => { channel.unsubscribe(); clearInterval(poll); };
  }, [refreshMaintenance]);

  // Filament colors — chargement + realtime
  React.useEffect(() => {
    loadFilamentColors().then(setFilamentColors);
    const channel = subscribeToFilamentColors(() => loadFilamentColors().then(setFilamentColors));
    return () => channel.unsubscribe();
  }, []);

  // Télémétrie Bambu Lab — poussée par le bridge Python
  React.useEffect(() => {
    const refresh = () => loadPrinterTelemetry().then(setTelemetryMap);
    refresh();
    const channel = subscribeToPrinterTelemetry(refresh);
    return () => channel.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (activeView !== 'camera') {
      setCameraTelemetryMap({});
      return;
    }
    const refresh = () => loadPrinterCameraTelemetry().then(setCameraTelemetryMap);
    refresh();
    const channel = subscribeToPrinterTelemetry(refresh);
    return () => channel.unsubscribe();
  }, [activeView]);

  // Progress bars : re-render 30s. Kiosque : vrai rechargement depuis la DB toutes les 15s
  React.useEffect(() => {
    const interval = setInterval(() => setReservations(r => [...r]), 30_000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!isKiosk) return;
    const poll = setInterval(() => loadReservations().then(setReservations), 15_000);
    return () => clearInterval(poll);
  }, []);

  // Notifications push — alerte 10 min avant chaque créneau
  React.useEffect(() => {
    if (!me || !('Notification' in window)) return;

    if (Notification.permission === 'default') Notification.requestPermission();

    const now = Date.now();
    const timers = reservations
      .filter(r => r.login === me.login && r.startMin * 60_000 > now - NOW_FIXED.getTime())
      .map(r => {
        const msUntilStart = NOW_FIXED.getTime() + r.startMin * 60_000 - now;
        const msUntilNotif = msUntilStart - 10 * 60_000;
        if (msUntilNotif <= 0) return null;
        return setTimeout(() => {
          if (Notification.permission === 'granted') {
            const printer = printerById(r.printerId);
            new Notification('TEK3D — Créneau dans 10 min 🖨', {
              body: `${printer.name} · ${r.project} · ${fmtTime(r.startMin)}`,
              icon: '/favicon.ico',
            });
          }
        }, msUntilNotif);
      })
      .filter(Boolean);

    return () => timers.forEach(clearTimeout);
  }, [me, reservations]);

  const handleLogin = (user) => setMe(user);

  const handleLogout = async () => {
    await logoutUser();
    setMe(null);
    setAdminPanelOpen(false);
  };

  React.useEffect(() => {
    if (!me) return;
    const upcoming = reservations
      .filter(r => r.login === me.login && r.startMin > 0 && r.startMin <= 30)
      .sort((a, b) => a.startMin - b.startMin)[0];
    if (upcoming) {
      const printer = printerById(upcoming.printerId);
      const timer = setTimeout(() => {
        setNotif({
          title: `Ton créneau sur ${printer.name} commence ${fmtRelativeFuture(upcoming.startMin)}`,
          message: `${upcoming.project} · ${fmtTime(upcoming.startMin)}–${fmtTime(upcoming.startMin + upcoming.durationMin)}. Pense à préparer ton fichier.`,
          icon: 'bell', tone: 'warn',
        });
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [me]);

  const handleReserve = async ({ printerId, startMin, durationMin, project }) => {
    if (myReservationCount24h >= RESERVATION_LIMIT_24H) {
      setReserveModalOpen(false);
      setNotif({
        title: 'Limite atteinte',
        message: `Tu as déjà ${RESERVATION_LIMIT_24H} réservations sur 24h, toutes imprimantes confondues.`,
        icon: 'clock', tone: 'warn',
      });
      return;
    }

    const newRes = {
      id: `res-${Date.now()}`,
      printerId, login: me.login,
      firstName: me.firstName, lastName: me.lastName,
      startMin, durationMin, project,
    };
    setReserveModalOpen(false);
    setReservations(prev => [...prev, newRes]);
    const ok = await addReservation(newRes);
    if (!ok) {
      setReservations(prev => prev.filter(r => r.id !== newRes.id));
      setNotif({ title: 'Erreur de réservation', message: 'Impossible d\'enregistrer la réservation, réessaie.', icon: 'close', tone: 'warn' });
      return;
    }
    const printer = printerById(printerId);
    setNotif({
      title: 'Réservation confirmée',
      message: `${printer.name} · ${fmtTime(startMin)}–${fmtTime(startMin + durationMin)} (${fmtDuration(durationMin)})`,
      icon: 'check', tone: 'success',
    });
  };

  const handleCancel = async (id) => {
    setReservations(prev => prev.filter(r => r.id !== id));
    await deleteReservation(id);
    setNotif({
      title: 'Réservation annulée',
      message: 'Le créneau est de nouveau disponible pour les autres étudiants.',
      icon: 'trash', tone: 'success',
    });
  };

  const handleClaimRunningPrint = async (printerId) => {
    if (!me) return;
    if (myReservationCount24h >= RESERVATION_LIMIT_24H) {
      setNotif({
        title: 'Limite atteinte',
        message: `Tu as déjà ${RESERVATION_LIMIT_24H} réservations sur 24h, toutes imprimantes confondues.`,
        icon: 'clock', tone: 'warn',
      });
      return;
    }

    const tel = telemetryMap[printerId];
    if (!tel || !['printing', 'paused'].includes(tel.state)) {
      setNotif({
        title: 'Aucune impression active',
        message: 'Cette imprimante n\'est pas en impression en ce moment.',
        icon: 'clock', tone: 'warn',
      });
      return;
    }

    const current = reservations.find(r =>
      r.printerId === printerId &&
      r.startMin <= elapsedMin &&
      r.startMin + r.durationMin > elapsedMin
    );

    if (current) {
      if (current.login === me.login) {
        setNotif({
          title: 'Impression déjà affectée',
          message: 'Cette impression est déjà affectée à ton compte.',
          icon: 'check', tone: 'success',
        });
      } else {
        setNotif({
          title: 'Impression déjà affectée',
          message: `Cette impression est déjà affectée à ${current.firstName} ${current.lastName}.`,
          icon: 'clock', tone: 'warn',
        });
      }
      return;
    }

    const remaining = normalizeRemainingMinutes(tel);
    const durationMin = Math.max(5, Math.ceil(remaining));
    const startMin = Math.floor(elapsedMin);
    const newRes = {
      id: `res-live-${Date.now()}`,
      printerId,
      login: me.login,
      firstName: me.firstName,
      lastName: me.lastName,
      startMin,
      durationMin,
      project: tel.current_file || 'Impression en cours',
    };

    setReservations(prev => [...prev, newRes]);
    const ok = await addReservation(newRes);
    if (!ok) {
      setReservations(prev => prev.filter(r => r.id !== newRes.id));
      setNotif({
        title: 'Affectation impossible',
        message: 'Impossible d\'enregistrer cette affectation pour le moment.',
        icon: 'close', tone: 'warn',
      });
      return;
    }

    const printer = printerById(printerId);
    setNotif({
      title: 'Impression affectée',
      message: `${printer.name} · ${fmtTime(startMin)}–${fmtTime(startMin + durationMin)} (${fmtDuration(durationMin)})`,
      icon: 'check', tone: 'success',
    });
  };

  const openReserve = (printerId) => {
    setReserveDefaultPrinter(printerId);
    setReserveModalOpen(true);
  };

  const handleDeleteAllReservations = async () => {
    const allReservations = reservations;
    if (allReservations.length === 0) return;
    if (!window.confirm(`Supprimer toutes les réservations (${allReservations.length}) ?`)) return;

    await Promise.all(allReservations.map(r => deleteReservation(r.id)));
    const refreshed = await loadReservations();
    setReservations(refreshed);
    setNotif({
      title: 'Réservations supprimées',
      message: 'Toutes les réservations ont été effacées.',
      icon: 'trash', tone: 'success',
    });
  };

  if (isKiosk) {
    return (
      <>
        <GlobalAnims />
        <KioskView reservations={reservationsForDisplay} loading={loadingReservations} maintenanceMap={maintenanceMap} wsStatus={wsStatus} telemetryMap={telemetryMap} />
      </>
    );
  }

  if (authLoading && !isPublicCameraRoute) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.dark ? '#000' : '#fafafa', color: t.dark ? '#f5f5f7' : '#1d1d1f',
        fontSize: 13, opacity: 0.5,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
      }}>
        Chargement…
      </div>
    );
  }

  if (!me && !isPublicCameraRoute) {
    return (
      <>
        <GlobalAnims />
        {authScreen === 'register' ? (
          <RegisterScreen
            dark={t.dark}
            onRegister={(user) => { handleLogin(user); setAuthScreen('login'); }}
            onShowLogin={() => setAuthScreen('login')}
          />
        ) : (
          <LoginScreen
            dark={t.dark}
            onLogin={handleLogin}
            onShowRegister={() => setAuthScreen('register')}
          />
        )}
      </>
    );
  }

  const bg = t.dark ? '#0a0a0a' : '#fafafa';
  const fg = t.dark ? '#f5f5f7' : '#1d1d1f';
  const sub = t.dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const headerBg = t.dark ? 'rgba(10,10,10,0.75)' : 'rgba(250,250,250,0.78)';
  const fieldBg = t.dark ? 'rgba(255,255,255,0.04)' : '#ffffff';

  const printerStatus = Object.fromEntries(
    PRINTERS.map(p => [p.id, mergePrinterStatus(
      computePrinterStatus(reservationsForDisplay, p.id),
      telemetryMap[p.id]
    )])
  );
  const activeCameraPrinters = PRINTERS.filter(p => {
    const tel = telemetryMap[p.id];
    return !maintenanceMap[p.id] && ['printing', 'paused'].includes(printerStatus[p.id].state) && (tel?.state === 'printing' || tel?.state === 'paused');
  });

  const myUpcomingCount = me ? reservationsForDisplay.filter(r => r.login === me.login && r.startMin + r.durationMin > 0).length : 0;
  const todayCount = reservationsForDisplay.filter(r => r.startMin + r.durationMin > 0 && r.startMin < 24 * 60).length;
  const myReservationCount24h = me
    ? reservations.filter(r => r.login === me.login && r.startMin + r.durationMin > 0 && r.startMin < 24 * 60).length
    : 0;
  const printingCount = PRINTERS.filter(p => ['printing', 'soon_available'].includes(printerStatus[p.id].state)).length;
  const availableCount = PRINTERS.filter(p => ['available', 'soon_unavailable'].includes(printerStatus[p.id].state)).length;

  return (
    <div data-screen-label={activeView === 'camera' ? 'Camera' : 'Dashboard'} style={{
      minHeight: '100vh', background: bg, color: fg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif',
      letterSpacing: '-0.005em',
    }}>
      <GlobalAnims />

      {/* Top bar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: headerBg,
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        borderBottom: `0.5px solid ${border}`,
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: '#1d1d1f',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="printer" size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.005em' }}>Tek3D</div>
            <div style={{ fontSize: 10.5, color: sub, marginTop: -1 }}>Epitech · Planning imprimantes 3D</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginLeft: 16, paddingLeft: 16, borderLeft: `0.5px solid ${border}` }}>
          <InlineStat dot="oklch(0.72 0.16 50)" label="En impression" value={printingCount} fg={fg} sub={sub} />
          <InlineStat dot="oklch(0.72 0.16 145)" label="Disponibles" value={availableCount} fg={fg} sub={sub} />
          <InlineStat label="Réservations 24h" value={todayCount} fg={fg} sub={sub} />
        </div>

        <div style={{ flex: 1 }} />

        {me ? (
          <>
            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 12px', height: 34,
              borderRadius: 10, border: `0.5px solid ${border}`, background: fieldBg,
              width: 240, color: sub,
            }}>
              <Icon name="search" size={14} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un étudiant…"
                style={{
                  flex: 1, height: '100%', border: 'none', background: 'transparent',
                  outline: 'none', fontSize: 12.5, color: fg, minWidth: 0,
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: sub, padding: 0, display: 'flex' }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            <Btn variant="secondary" size="sm" icon="sparkle" onClick={() => setStatsOpen(true)}>
              Statistiques
            </Btn>

            <Btn variant="secondary" size="sm" icon="history" onClick={() => setMyResOpen(true)}>
              Mes réservations
              {myUpcomingCount > 0 && (
                <span style={{
                  marginLeft: 6, padding: '0 6px', height: 16, borderRadius: 999,
                  background: '#1d1d1f', color: '#fff', fontSize: 10.5, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums',
                }}>{myUpcomingCount}</span>
              )}
            </Btn>

            <Btn
              variant="secondary"
              size="sm"
              icon={activeView === 'camera' ? 'list' : 'grid'}
              onClick={() => setAppView(activeView === 'camera' ? 'dashboard' : 'camera')}
            >
              {activeView === 'camera' ? 'Planning' : 'Caméras'}
            </Btn>

            {me.isAdmin && (
              <Btn variant="secondary" size="sm" icon="settings" onClick={() => setAdminPanelOpen(true)}>
                Admin
              </Btn>
            )}

            <Btn variant="primary" size="sm" icon="plus" onClick={() => openReserve(null)}>Réserver</Btn>

            {/* User */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: `0.5px solid ${border}` }}>
              <Avatar first={me.firstName} last={me.lastName} size={30} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{me.firstName} {me.lastName}</div>
                <div style={{ fontSize: 10.5, color: sub }}>{me.login}</div>
              </div>
              <button
                onClick={handleLogout}
                title="Déconnexion"
                style={{
                  width: 28, height: 28, borderRadius: 7, border: 'none',
                  background: 'transparent', color: sub, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name="logout" size={14} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: sub }}>
            Vue publique caméras
          </div>
        )}
      </header>

      {/* Main content */}
      <main style={{ padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
              {activeView === 'camera' ? 'Caméras' : 'Files d\'attente'}
            </h1>
            <div style={{ fontSize: 13, color: sub, marginTop: 4 }}>
              {activeView === 'camera'
                ? 'Diffusion en direct des imprimantes en cours d\'impression'
                : '5 imprimantes · cliquez sur un créneau libre pour réserver, ou sur l\'en-tête d\'une imprimante pour voir le détail'}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: sub, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.65 0.22 25)' }} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {NOW_FIXED.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {activeView === 'dashboard' ? (
          <DashboardView
            t={t}
            printerStatus={printerStatus}
            reservations={reservationsForDisplay}
            me={me}
            maintenanceMap={maintenanceMap}
            telemetryMap={telemetryMap}
            onSlotClick={(printerId) => openReserve(printerId)}
            onPrinterClick={(id) => setDetailPrinterId(id)}
            onReserveClick={openReserve}
            onCancel={handleCancel}
            searchQuery={searchQuery}
          />
        ) : activeView === 'camera' ? (
          <CameraView
            printers={activeCameraPrinters}
            telemetryMap={cameraTelemetryMap}
            printerStatus={printerStatus}
            selectedPrinterId={cameraFocusId}
            onSelectPrinter={setCameraFocusId}
            onClearSelection={() => setCameraFocusId(null)}
            dark={t.dark}
          />
        ) : (
          <ListView
            t={t}
            printerStatus={printerStatus}
            reservations={reservationsForDisplay}
            me={me}
            onPrinterClick={(id) => setDetailPrinterId(id)}
            onReserveClick={openReserve}
            onCancel={handleCancel}
            searchQuery={searchQuery}
          />
        )}
      </main>

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Apparence" />
        <TweakToggle label="Mode sombre" value={t.dark} onChange={(v) => setTweak('dark', v)} />
        <TweakRadio label="Densité" value={t.density}
          options={['compact', 'regular', 'comfy']}
          onChange={(v) => setTweak('density', v)} />

        <TweakSection label="Vue" />
        <TweakRadio label="Affichage" value={t.view}
          options={['dashboard', 'list', 'camera']}
          onChange={(v) => setAppView(v)} />
        <TweakSlider label="Heures visibles" value={t.hourSpan} min={6} max={48} step={6} unit="h"
          onChange={(v) => setTweak('hourSpan', v)} />

        <TweakSection label="Réservation" />
        <TweakRadio label="Créneau" value={String(t.slotSize)}
          options={['15', '30', '60']}
          onChange={(v) => setTweak('slotSize', parseInt(v))} />
      </TweaksPanel>

      {me && (
        <>
          <ReserveModal
            open={reserveModalOpen}
            onClose={() => setReserveModalOpen(false)}
            onConfirm={handleReserve}
            defaultPrinterId={reserveDefaultPrinter}
            reservations={reservationsForDisplay}
            slotSize={t.slotSize}
            dark={t.dark}
            reservationCount24h={myReservationCount24h}
            reservationLimit={RESERVATION_LIMIT_24H}
          />

          <MyReservationsPanel
            open={myResOpen}
            onClose={() => setMyResOpen(false)}
            reservations={reservations}
            me={me}
            onCancel={handleCancel}
            dark={t.dark}
          />

          <PrinterDetailPanel
            open={!!detailPrinterId}
            printerId={detailPrinterId}
            onClose={() => setDetailPrinterId(null)}
            reservations={reservationsForDisplay}
            me={me}
            onReserve={(id) => { setDetailPrinterId(null); openReserve(id); }}
            onCancel={handleCancel}
            dark={t.dark}
            telemetry={detailPrinterId ? (telemetryMap[detailPrinterId] || null) : null}
            maintenance={detailPrinterId ? (maintenanceMap[detailPrinterId] || null) : null}
            onClaimRunningPrint={handleClaimRunningPrint}
          />
        </>
      )}

      {me?.isAdmin && adminPanelOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: t.dark ? '#0a0a0a' : '#fafafa',
          display: 'flex', flexDirection: 'column',
          animation: 'qp-overlay-fade 0.2s ease',
        }}>
          <div style={{
            padding: '12px 24px', borderBottom: `0.5px solid ${t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: t.dark ? 'rgba(10,10,10,0.75)' : 'rgba(250,250,250,0.78)',
            backdropFilter: 'blur(24px)',
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Admin Panel</div>
            <button
              onClick={() => setAdminPanelOpen(false)}
              style={{
                width: 28, height: 28, borderRadius: 8, border: 'none',
                background: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
                color: t.dark ? '#f5f5f7' : '#1d1d1f', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <AdminPanel
              key={me.login}
              dark={t.dark}
              reservations={reservations}
              me={me}
              maintenanceMap={maintenanceMap}
              telemetryMap={telemetryMap}
              onMaintenanceChange={refreshMaintenance}
              onReservationDeleted={(id) => setReservations(prev => prev.filter(r => r.id !== id))}
              onDeleteAllReservations={handleDeleteAllReservations}
              onPrinterCommand={(printerId, cmd) => {
                setTelemetryMap(prev => {
                  const cur = prev[printerId] || {};
                  if (cmd === 'stop') {
                    return { ...prev, [printerId]: {
                      ...cur, state: 'idle',
                      progress: null, remaining_min: null,
                      current_file: null, layer_current: null, layer_total: null,
                    }};
                  }
                  if (cmd === 'pause')  return { ...prev, [printerId]: { ...cur, state: 'paused' } };
                  if (cmd === 'resume') return { ...prev, [printerId]: { ...cur, state: 'printing' } };
                  return prev;
                });
              }}
            />
          </div>
        </div>
      )}

      <StatsPanel
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        reservations={reservations}
        dark={t.dark}
      />

      <NotificationToast notif={notif} onClose={() => setNotif(null)} dark={t.dark} />
    </div>
  );
}

function InlineStat({ dot, label, value, fg, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}
      <span style={{ fontSize: 11.5, color: sub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: fg, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function DashboardView({ t, printerStatus, reservations, me, maintenanceMap, telemetryMap, onSlotClick, onPrinterClick, onReserveClick, onCancel, searchQuery }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))',
      gap: 14,
    }}>
      {PRINTERS.map(p => (
        <div key={p.id} data-screen-label={`Printer ${p.name}`}>
          <PrinterCardWithHeader
            printer={p}
            status={printerStatus[p.id]}
            reservations={reservations}
            allReservations={reservations}
            me={me}
            maintenance={maintenanceMap[p.id] || null}
            telemetry={telemetryMap[p.id] || null}
            onSlotClick={(printerId, min) => onSlotClick(printerId)}
            onReserve={onReserveClick}
            onCancel={onCancel}
            onPrinterClick={onPrinterClick}
            slotSize={t.slotSize}
            density={t.density}
            dark={t.dark}
            searchQuery={searchQuery}
            hourSpan={t.hourSpan}
          />
        </div>
      ))}
    </div>
  );
}

function PrinterCardWithHeader(props) {
  return (
    <div style={{ cursor: 'default' }}>
      <div onClick={() => props.onPrinterClick(props.printer.id)} style={{ cursor: 'pointer' }}>
        <PrinterCard {...props} onReserve={(id) => { props.onReserve(id); }} />
      </div>
    </div>
  );
}

function ListView({ t, printerStatus, reservations, me, onPrinterClick, onReserveClick, onCancel, searchQuery }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {PRINTERS.map(p => (
        <ListRow
          key={p.id}
          printer={p}
          status={printerStatus[p.id]}
          reservations={reservations}
          me={me}
          onPrinterClick={onPrinterClick}
          onReserveClick={onReserveClick}
          onCancel={onCancel}
          dark={t.dark}
          density={t.density}
          slotSize={t.slotSize}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}

function CameraView({ printers, telemetryMap, printerStatus, selectedPrinterId, onSelectPrinter, onClearSelection, dark }) {
  const bg = dark ? '#0a0a0a' : '#f4f4f5';
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const selected = printers.find(p => p.id === selectedPrinterId) || (printers.length === 1 ? printers[0] : null);
  const activeTelem = selected ? telemetryMap[selected.id] : null;

  if (printers.length === 0) {
    return (
      <div data-screen-label="Camera" style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, color: fg, padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', border: `0.5px solid ${border}`, borderRadius: 20, padding: 28, background: dark ? '#111' : '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Aucune caméra active</div>
          <div style={{ fontSize: 13, color: sub, lineHeight: 1.5 }}>
            Aucune imprimante n’envoie de snapshot caméra pour le moment. Dès qu’une impression démarre, les caméras actives apparaissent ici.
          </div>
        </div>
      </div>
    );
  }

  const FeedCard = ({ printer, fullscreen = false }) => {
    const tel = telemetryMap[printer.id];
    const src = getCameraUrl(printer.id, tel?.camera_version) ?? '';
    return (
      <div
        onClick={() => printers.length > 1 && !fullscreen && onSelectPrinter(printer.id)}
        style={{
          width: '100%',
          border: `0.5px solid ${border}`,
          borderRadius: fullscreen ? 24 : 18,
          overflow: 'hidden',
          background: dark ? '#121212' : '#fff',
          color: fg,
          padding: 0,
          cursor: printers.length > 1 && !fullscreen ? 'pointer' : 'default',
          boxShadow: fullscreen ? '0 24px 80px rgba(0,0,0,0.3)' : 'none',
          position: 'relative',
          textAlign: 'left',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.55))', pointerEvents: 'none', zIndex: 1 }} />
        {src ? (
          <img
            src={src}
            alt={`Caméra ${printer.name}`}
            style={{ width: '100%', height: fullscreen ? 'min(72vh, 920px)' : '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ aspectRatio: fullscreen ? '16 / 9' : '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: sub, padding: 24 }}>
            Image indisponible
          </div>
        )}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2, padding: fullscreen ? '18px 20px' : '14px 16px', display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: fullscreen ? 26 : 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{printer.name}</div>
            <div style={{ fontSize: fullscreen ? 13 : 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 2 }}>
              {printerStatus[printer.id]?.state === 'paused' ? 'En pause' : 'En impression'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: 6 }}>
            <StatePill state={printerStatus[printer.id]?.state || 'available'} compact />
            {fullscreen && printers.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); onClearSelection(); }}
                style={{
                  border: `0.5px solid ${border}`,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.14)',
                  color: '#fff',
                  padding: '6px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  backdropFilter: 'blur(10px)',
                }}
              >
                Retour à la mosaïque
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (selected || printers.length === 1) {
    return (
      <div data-screen-label="Camera" style={{ minHeight: '100%', background: bg, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Mosaïque</div>
            <div style={{ fontSize: 12.5, color: sub, marginTop: 3 }}>{printers.length} caméra{printers.length > 1 ? 's' : ''} active{printers.length > 1 ? 's' : ''}</div>
          </div>
          {printers.length > 1 && (
            <button
              onClick={onClearSelection}
              style={{
                border: `0.5px solid ${border}`,
                borderRadius: 999,
                background: dark ? '#111' : '#fff',
                color: fg,
                padding: '8px 12px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Voir la mosaïque
            </button>
          )}
        </div>
        <FeedCard printer={selected || printers[0]} fullscreen />
        {activeTelem?.updated_at && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: sub }}>
            Snapshot mis à jour {new Date(activeTelem.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div data-screen-label="Camera" style={{ minHeight: '100%', background: bg, color: fg, padding: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Mosaïque</div>
        <div style={{ fontSize: 12.5, color: sub, marginTop: 3 }}>{printers.length} caméras actives</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, printers.length)}, minmax(0, 1fr))`, gap: 14 }}>
        {printers.map(printer => (
          <FeedCard key={printer.id} printer={printer} />
        ))}
      </div>
    </div>
  );
}

function KioskView({ reservations, loading, maintenanceMap = {}, wsStatus = 'connecting', telemetryMap = {} }) {
  const [now, setNow] = React.useState(new Date());
  const [tick, setTick] = React.useState(0);
  const [lastTickMs, setLastTickMs] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      setLastTickMs(Date.now());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const printerStatus = Object.fromEntries(
    PRINTERS.map(p => [p.id, computePrinterStatus(reservations, p.id)])
  );
  const printingCount  = PRINTERS.filter(p => !maintenanceMap[p.id] && ['printing', 'soon_available'].includes(printerStatus[p.id].state)).length;
  const availableCount = PRINTERS.filter(p => !maintenanceMap[p.id] && ['available', 'soon_unavailable'].includes(printerStatus[p.id].state)).length;
  const maintenanceCount = PRINTERS.filter(p => maintenanceMap[p.id]).length;
  const countdown = Math.max(0, 30 - Math.round((Date.now() - lastTickMs) / 1_000));

  return (
    <div style={{
      height: '100vh', background: '#090909', color: '#f5f5f7', overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '8px 28px', flexShrink: 0,
        background: '#0f0f0f', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center',
      }}>
        {/* WS status — gauche */}
        <WsIndicator status={wsStatus} />

        {/* Heure — centre */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: 52, fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Date — droite */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize', textAlign: 'right' }}>
          {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </header>

      {/* Cards */}
      <div style={{ flex: 1, padding: '14px 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, minHeight: 0 }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>
            Chargement…
          </div>
        ) : PRINTERS.map(p => (
          <KioskPrinterCard key={p.id} printer={p}
            status={mergePrinterStatus(printerStatus[p.id], telemetryMap[p.id])}
            reservations={reservations}
            maintenance={maintenanceMap[p.id] || null}
            telemetry={telemetryMap[p.id] || null}
          />
        ))}
      </div>
    </div>
  );
}

function WsIndicator({ status }) {
  const [flash, setFlash] = React.useState(false);
  const prevStatus = React.useRef(status);

  React.useEffect(() => {
    if (prevStatus.current !== 'connected' && status === 'connected') {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 800);
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
  }, [status]);

  const dot =
    status === 'connected'   ? '#44c76a' :
    status === 'error'       ? '#e05a3a' :
    '#d4a030';

  const label =
    status === 'connected'   ? 'Connecté' :
    status === 'error'       ? 'Déconnecté' :
    'Connexion…';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 12px', borderRadius: 8,
      background: flash ? `${dot}22` : 'rgba(255,255,255,0.04)',
      border: `0.5px solid ${flash ? dot : 'rgba(255,255,255,0.08)'}`,
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dot,
        boxShadow: status === 'connected' ? `0 0 6px ${dot}` : 'none',
        animation: status === 'connecting' ? 'kiosk-pulse 1.4s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

function KioskChip({ color, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function ArcProgress({ progress, hue, size = 90 }) {
  const sw = 9;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(1, Math.max(0, progress));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`hsl(${hue}, 62%, 62%)`} strokeWidth={sw}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 2s ease' }} />
    </svg>
  );
}

function RingProgress({ progress, hue, size = 72, strokeWidth = 8, label, textColor = '#f5f5f7', color }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const safeProgress = Math.min(1, Math.max(0, progress || 0));
  const strokeColor = color ?? `hsl(${hue}, 62%, 62%)`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${circ * safeProgress} ${circ}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 2s ease' }}
      />
      <text
        x="50%" y="50%"
        textAnchor="middle" dominantBaseline="middle"
        fill={textColor}
        fontSize={Math.max(10, Math.round(size * 0.2))}
        fontWeight="700"
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"
      >
        {label ?? `${Math.round(safeProgress * 100)}%`}
      </text>
    </svg>
  );
}

function KioskPrinterCard({ printer, status, reservations, maintenance, telemetry }) {
  const [dbColors, setDbColors] = React.useState([]);
  React.useEffect(() => {
    loadFilamentColors().then(cs => setDbColors(cs.filter(c => c.printer_id === printer.id)));
  }, [printer.id]);

  // Parse ams_colors — nouveau format {"colors":[...], "active":N} ou ancien format array
  const amsData = React.useMemo(() => {
    if (!telemetry?.ams_colors) return null;
    try {
      const parsed = JSON.parse(telemetry.ams_colors);
      if (Array.isArray(parsed)) return { colors: parsed, active: null };
      if (parsed && Array.isArray(parsed.colors)) return { colors: parsed.colors, active: parsed.active ?? null };
    } catch { /* fall through */ }
    return null;
  }, [telemetry?.ams_colors]);

  const printerFilaments = React.useMemo(() => {
    if (amsData) return amsData.colors.map((hex, i) => ({ id: `ams-${i}`, hex_color: hex }));
    return dbColors;
  }, [amsData, dbColors]);

  // Couleur du filament actif — brute puis corrigée pour fond sombre
  const activeFilamentColor = React.useMemo(() => {
    if (!amsData) return null;
    const { colors, active } = amsData;
    if (!colors.length) return null;
    const idx = (active != null && active >= 0 && active < colors.length) ? active : 0;
    return safeFilamentColor(colors[idx]);
  }, [amsData]);

  const elapsedMin = (Date.now() - NOW_FIXED.getTime()) / 60_000;
  const WINDOW_H = 10;
  const windowMin = WINDOW_H * 60;
  const PIXELS_PER_HOUR = 64; // fixed px height per hour for kiosk displays
  const TOTAL_HEIGHT_PX = WINDOW_H * PIXELS_PER_HOUR;

  const windowItems = reservations
    .filter(r => r.printerId === printer.id)
    .filter(r => r.startMin + r.durationMin > elapsedMin && r.startMin < elapsedMin + windowMin)
    .sort((a, b) => a.startMin - b.startMin);

  const currentJob = windowItems.find(r => r.startMin <= elapsedMin);

  // Heure‑marks alignées sur l'horloge murale
  const nowMs = NOW_FIXED.getTime() + elapsedMin * 60_000;
  const hourMarkers = [];
  const firstHourMs = Math.ceil(nowMs / 3_600_000) * 3_600_000;
  for (let ms = firstHourMs; ms < nowMs + windowMin * 60_000; ms += 3_600_000) {
    const pct = ((ms - NOW_FIXED.getTime()) / 60_000 - elapsedMin) / windowMin * 100;
    hourMarkers.push({ pct, label: `${String(new Date(ms).getHours()).padStart(2, '0')}:00` });
  }

  const effectiveState = maintenance ? 'maintenance' : status.state;
  const isPrinting  = effectiveState === 'printing' || effectiveState === 'soon_available';
  const isPaused    = effectiveState === 'paused';
  const isReserved  = effectiveState === 'reserved';
  const isAvailable = effectiveState === 'available';
  const isSoon      = effectiveState === 'soon_unavailable';
  const isMaint     = effectiveState === 'maintenance';
  const isError     = effectiveState === 'error';
  const isOffline   = effectiveState === 'offline';

  const ph = (h, l = 48, s = 55) => `hsl(${h}, ${s}%, ${l}%)`;
  const printingAccent = (isPrinting || isPaused) && activeFilamentColor ? activeFilamentColor : ph(printer.hue);
  const accent = isMaint              ? 'hsl(15, 65%, 44%)'
    : isError                         ? 'hsl(0, 65%, 48%)'
    : isOffline                       ? '#555'
    : isPaused                        ? (activeFilamentColor ?? 'hsl(210, 55%, 48%)')
    : isAvailable || isSoon           ? 'hsl(145, 52%, 46%)'
    : isPrinting                      ? printingAccent
    : ph(printer.hue);

  const border = 'rgba(255,255,255,0.06)';
  const sub    = 'rgba(255,255,255,0.4)';

  return (
    <div style={{
      background: '#131313', borderRadius: 14, overflow: 'hidden',
      border: `0.5px solid ${border}`, borderTop: `3px solid ${accent}`,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Nom */}
      <div style={{ padding: '10px 14px 8px', borderBottom: `0.5px solid ${border}`, flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '0.01em' }}>{printer.name}</span>
        <div style={{ fontSize: 10.5, color: sub, marginTop: 1 }}>{printer.model}</div>
      </div>

      {/* Statut courant */}
      <div style={{ padding: '10px 14px', borderBottom: `0.5px solid ${border}`, flexShrink: 0 }}>
        {isMaint ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <Icon name="wrench" size={16} color="hsl(15, 68%, 58%)" stroke={1.8} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'hsl(15, 68%, 62%)' }}>En maintenance</div>
              <div style={{ fontSize: 11, color: 'hsl(15, 48%, 54%)', lineHeight: 1.4, marginTop: 2 }}>{maintenance.message}</div>
              {maintenance.return_at && (
                <div style={{ fontSize: 10, color: sub, marginTop: 3 }}>
                  Retour {new Date(maintenance.return_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          </div>
        ) : isError ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <Icon name="wrench" size={16} color="hsl(0, 68%, 58%)" stroke={1.8} style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'hsl(0, 68%, 62%)' }}>Erreur imprimante</div>
              {telemetry?.error_code && (
                <div style={{ fontSize: 11, color: 'hsl(0, 48%, 54%)', marginTop: 2 }}>Code {telemetry.error_code}</div>
              )}
              {telemetry?.current_stage != null && (
                <div style={{ fontSize: 10, color: sub, marginTop: 2 }}>Étape {telemetry.current_stage}</div>
              )}
            </div>
          </div>
        ) : isOffline ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#666' }}>Hors ligne</div>
          </div>
        ) : isPaused ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RingProgress progress={status.progress || 0} hue={210} size={72} strokeWidth={8} color={activeFilamentColor ?? undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: activeFilamentColor ?? 'hsl(210, 65%, 62%)', lineHeight: 1 }}>En pause</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 12, color: activeFilamentColor ?? sub }}>Fin dans {fmtRelativeFuture(status.etaMin)}</div>
              </div>
              {telemetry?.nozzle_temp != null && (
                <div style={{ fontSize: 10, color: sub, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  🌡 {telemetry.nozzle_temp}°{telemetry.bed_temp != null ? ` · lit ${telemetry.bed_temp}°` : ''}
                </div>
              )}
            </div>
          </div>
        ) : isPrinting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RingProgress progress={status.progress} hue={printer.hue} size={72} strokeWidth={8} color={activeFilamentColor} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.05, color: activeFilamentColor ?? undefined }}>
                {isPrinting ? 'En impression' : 'Impression'}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontSize: 12, color: activeFilamentColor ?? sub }}>Fin dans {fmtRelativeFuture(status.etaMin)}</div>
              </div>
              {/* Telemetry row */}
              {telemetry && (telemetry.nozzle_temp != null || telemetry.layer_current != null) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                  {telemetry.nozzle_temp != null && (
                    <span style={kioskChipStyle}>
                      🌡 {telemetry.nozzle_temp}°{telemetry.bed_temp != null ? `·${telemetry.bed_temp}°` : ''}
                    </span>
                  )}
                  {telemetry.layer_current != null && telemetry.layer_total != null && (
                    <span style={kioskChipStyle}>
                      {telemetry.layer_current}/{telemetry.layer_total}
                    </span>
                  )}
                  {telemetry.speed_level && (
                    <span style={kioskChipStyle}>{telemetry.speed_level}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : isReserved ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="clock" size={20} color="hsl(260, 62%, 56%)" stroke={1.8} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'hsl(260, 62%, 56%)' }}>Réservé</div>
              {currentJob && (
                <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4 }}>{currentJob.firstName} {currentJob.lastName}</div>
              )}
            </div>
          </div>
        ) : isSoon ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="clock" size={20} color="hsl(42, 82%, 58%)" stroke={1.8} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'hsl(42, 88%, 62%)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtRelativeFuture(status.nextStartMin)}
              </div>
              <div style={{ fontSize: 10, color: sub }}>avant la prochaine impression</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="check" size={20} color="hsl(145, 62%, 56%)" stroke={2.5} />
            <div style={{ fontSize: 20, fontWeight: 800, color: 'hsl(145, 68%, 60%)' }}>Disponible</div>
          </div>
        )}
        {/* Filaments — pastilles colorées sans nom */}
        {printerFilaments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {printerFilaments.map(c => (
              <div key={c.id} title={c.color_name} style={{
                width: 24, height: 24, borderRadius: 6,
                background: c.hex_color,
                border: swatchBorder(c.hex_color),
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Timeline verticale proportionnelle */}
      <div style={{ position: 'relative', margin: '6px 8px 8px', height: `${WINDOW_H * PIXELS_PER_HOUR}px`, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.02)', borderRadius: 8, overflow: 'hidden' }}>

          {/* Ligne NOW (haut = maintenant) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#e05a3a', zIndex: 4 }} />

          {/* Repères horaires alignés sur l'horloge murale */}
          {hourMarkers.map(({ pct, label }) => {
            const topPx = Math.round(pct / 100 * TOTAL_HEIGHT_PX);
            return (
              <div key={label} style={{ position: 'absolute', top: `${topPx}px`, left: 0, right: 0, zIndex: 2 }}>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.14)' }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.36)', padding: '3px 6px', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                  {label}
                </div>
              </div>
            );
          })}

          {/* Blocs de réservation — hauteur proportionnelle à la durée */}
            {windowItems.map(r => {
            const visStart  = Math.max(r.startMin, elapsedMin);
            const visEnd    = Math.min(r.startMin + r.durationMin, elapsedMin + windowMin);
            const topPx     = Math.round((visStart - elapsedMin) / windowMin * TOTAL_HEIGHT_PX);
            const heightPx  = Math.round((visEnd - visStart) / windowMin * TOTAL_HEIGHT_PX);
            const minHeight = 20;
            const finalHeight = Math.max(heightPx, minHeight);
            const isLive    = r.startMin <= elapsedMin;
            const isTiny    = finalHeight < 28;
            const isCompact = finalHeight < 40;
            const nameFont  = isTiny ? 7.5 : isCompact ? 8.5 : 9;
            const timeFont  = isTiny ? 10 : isCompact ? 12 : 16;
            // Créneau actuel → couleur filament ; suivants → blanc lisible
            const blockColor  = isLive && activeFilamentColor ? activeFilamentColor : 'rgba(255,255,255,0.75)';
            const borderColor = isLive && activeFilamentColor ? activeFilamentColor : 'rgba(255,255,255,0.30)';
            const bgColor     = isLive && activeFilamentColor
              ? `color-mix(in srgb, ${activeFilamentColor} 22%, transparent)`
              : 'rgba(255,255,255,0.05)';
            return (
              <div key={r.id} style={{
                position: 'absolute',
                top: `${topPx}px`, height: `${finalHeight}px`,
                left: 34, right: 4,
                background: bgColor,
                borderLeft: `3px solid ${borderColor}`,
                borderRadius: 5, overflow: 'hidden',
                padding: isTiny ? '1px 5px' : '3px 7px', zIndex: 2,
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                gap: isTiny ? 0 : 3,
              }}>
                {!isTiny && (
                  <div style={{ fontSize: nameFont, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
                    {r.firstName} {r.lastName}
                  </div>
                )}
                <div style={{ fontSize: timeFont, fontWeight: 800, color: blockColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap' }}>
                  {isTiny
                    ? `${fmtTimeRound(r.startMin)}–${fmtTimeRound(r.startMin + r.durationMin)}`
                    : `${fmtTime(r.startMin)}–${fmtTime(r.startMin + r.durationMin)}`}
                </div>
                {isLive && <div style={{ fontSize: 9, color: blockColor, fontWeight: 700 }}>● EN COURS</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


function ListRow({ printer, status, reservations, me, onPrinterClick, onReserveClick, onCancel, dark, density, slotSize, searchQuery }) {
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const upcoming = reservations
    .filter(r => r.printerId === printer.id && r.startMin + r.durationMin > 0 && r.startMin < 24 * 60)
    .sort((a, b) => a.startMin - b.startMin);

  return (
    <div style={{
      background: cardBg, border: `0.5px solid ${border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div
        onClick={() => onPrinterClick(printer.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          cursor: 'pointer',
          borderBottom: `0.5px solid ${border}`,
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          background: printerColor(printer.hue),
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="printer" size={18} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15 }}>{printer.name}</span>
            <span style={{ fontSize: 11.5, color: sub }}>· {printer.model}</span>
            <StatePill state={status.state} compact />
          </div>
          {(status.state === 'printing' || status.state === 'soon_available') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
                <svg viewBox="0 0 30 30" width="30" height="30" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="15" cy="15" r="11" fill="none" stroke={dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'} strokeWidth="3.5" />
                  <circle
                    cx="15" cy="15" r="11" fill="none"
                    stroke={printerColor(printer.hue)} strokeWidth="3.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 11 * Math.max(0, Math.min(1, status.progress || 0))} ${2 * Math.PI * 11}`}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((status.progress || 0) * 100)}%
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: sub, fontVariantNumeric: 'tabular-nums' }}>
                fin {fmtRelativeFuture(status.etaMin)}
              </div>
            </div>
          )}
          {status.state === 'available' && (
            <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.13 145)' }}>Prête maintenant</div>
          )}
          {status.state === 'soon_unavailable' && (
            <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.14 80)', fontVariantNumeric: 'tabular-nums' }}>
              Impression {fmtRelativeFuture(status.nextStartMin)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Btn variant="primary" size="sm" icon="plus" onClick={(e) => { e.stopPropagation(); onReserveClick(printer.id); }}>
            Réserver
          </Btn>
        </div>
      </div>
      <div style={{ padding: '10px 18px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {upcoming.length === 0 ? (
          <div style={{ fontSize: 12, color: sub, padding: '8px 0' }}>Aucune réservation à venir aujourd'hui.</div>
        ) : upcoming.map(r => {
          const isMine = r.login === me.login;
          const matches = searchQuery && (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchQuery.toLowerCase());
          return (
            <div key={r.id} style={{
              flexShrink: 0, padding: '8px 12px',
              borderRadius: 8,
              border: `0.5px solid ${matches ? 'oklch(0.6 0.2 50)' : isMine ? printerColor(printer.hue) : border}`,
              background: isMine ? `color-mix(in oklch, ${printerColor(printer.hue)} 10%, transparent)` : 'transparent',
              fontSize: 11.5, opacity: searchQuery && !matches ? 0.3 : 1,
            }}>
              <div style={{ fontWeight: 600, color: fg, fontSize: 12 }}>{r.firstName} {r.lastName}</div>
              <div style={{ color: sub, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
