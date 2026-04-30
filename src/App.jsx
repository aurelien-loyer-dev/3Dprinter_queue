// App.jsx — main shell
import React from 'react';
import {
  PRINTERS, NOW_FIXED,
  computePrinterStatus,
  printerById, printerColor, loadPct,
  fmtTime, fmtDuration, fmtRelativeFuture,
} from './data.js';
import {
  getSessionUser, onAuthChange, logoutUser,
  loadReservations, addReservation, deleteReservation, subscribeToReservations,
  loadMaintenance, subscribeToMaintenance,
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

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
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

  // Session Supabase — persiste automatiquement entre les refreshs
  React.useEffect(() => {
    getSessionUser().then(user => { setMe(user); setAuthLoading(false); });
    return onAuthChange(user => { setMe(user); setAuthLoading(false); });
  }, []);

  // Chargement réservations + realtime
  React.useEffect(() => {
    loadReservations().then(data => { setReservations(data); setLoadingReservations(false); });
    const channel = subscribeToReservations(() => { loadReservations().then(setReservations); });
    return () => channel.unsubscribe();
  }, []);

  // Maintenance — chargement + realtime
  React.useEffect(() => {
    const refresh = () => loadMaintenance().then(rows =>
      setMaintenanceMap(Object.fromEntries(rows.map(r => [r.printer_id, r])))
    );
    refresh();
    const channel = subscribeToMaintenance(refresh);
    return () => channel.unsubscribe();
  }, []);

  // Re-render toutes les 30s pour mettre à jour les progress bars en temps réel
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render — computePrinterStatus recalcule avec Date.now()
      setReservations(r => [...r]);
    }, 30_000);
    return () => clearInterval(interval);
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
    const newRes = {
      id: `res-${Date.now()}`,
      printerId, login: me.login,
      firstName: me.firstName, lastName: me.lastName,
      startMin, durationMin, project,
    };
    setReserveModalOpen(false);
    // Optimistic update — le realtime confirmera (ou rechargera)
    setReservations(prev => [...prev, newRes]);
    await addReservation(newRes);
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

  const openReserve = (printerId) => {
    setReserveDefaultPrinter(printerId);
    setReserveModalOpen(true);
  };

  if (isKiosk) {
    return (
      <>
        <GlobalAnims />
        <KioskView reservations={reservations} loading={loadingReservations} maintenanceMap={maintenanceMap} />
      </>
    );
  }

  if (authLoading) {
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

  if (!me) {
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
    PRINTERS.map(p => [p.id, computePrinterStatus(reservations, p.id)])
  );

  const myUpcomingCount = reservations.filter(r => r.login === me.login && r.startMin + r.durationMin > 0).length;
  const todayCount = reservations.filter(r => r.startMin + r.durationMin > 0 && r.startMin < 24 * 60).length;
  const printingCount = PRINTERS.filter(p => ['printing', 'soon_available'].includes(printerStatus[p.id].state)).length;
  const availableCount = PRINTERS.filter(p => ['available', 'soon_unavailable'].includes(printerStatus[p.id].state)).length;

  return (
    <div data-screen-label="Dashboard" style={{
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
      </header>

      {/* Main content */}
      <main style={{ padding: '24px 24px 80px' }}>
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
              Files d'attente
            </h1>
            <div style={{ fontSize: 13, color: sub, marginTop: 4 }}>
              5 imprimantes · cliquez sur un créneau libre pour réserver, ou sur l'en-tête d'une imprimante pour voir le détail
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: sub, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.65 0.22 25)' }} />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {NOW_FIXED.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        {t.view === 'dashboard' ? (
          <DashboardView
            t={t}
            printerStatus={printerStatus}
            reservations={reservations}
            me={me}
            maintenanceMap={maintenanceMap}
            onSlotClick={(printerId) => openReserve(printerId)}
            onPrinterClick={(id) => setDetailPrinterId(id)}
            onReserveClick={openReserve}
            onCancel={handleCancel}
            searchQuery={searchQuery}
          />
        ) : (
          <ListView
            t={t}
            printerStatus={printerStatus}
            reservations={reservations}
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
          options={['dashboard', 'list']}
          onChange={(v) => setTweak('view', v)} />
        <TweakSlider label="Heures visibles" value={t.hourSpan} min={6} max={48} step={6} unit="h"
          onChange={(v) => setTweak('hourSpan', v)} />

        <TweakSection label="Réservation" />
        <TweakRadio label="Créneau" value={String(t.slotSize)}
          options={['15', '30', '60']}
          onChange={(v) => setTweak('slotSize', parseInt(v))} />
      </TweaksPanel>

      <ReserveModal
        open={reserveModalOpen}
        onClose={() => setReserveModalOpen(false)}
        onConfirm={handleReserve}
        defaultPrinterId={reserveDefaultPrinter}
        reservations={reservations}
        slotSize={t.slotSize}
        dark={t.dark}
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
        reservations={reservations}
        me={me}
        onReserve={(id) => { setDetailPrinterId(null); openReserve(id); }}
        onCancel={handleCancel}
        dark={t.dark}
      />

      {me.isAdmin && adminPanelOpen && (
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
              onReservationDeleted={(id) => setReservations(prev => prev.filter(r => r.id !== id))}
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

function DashboardView({ t, printerStatus, reservations, me, maintenanceMap, onSlotClick, onPrinterClick, onReserveClick, onCancel, searchQuery }) {
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

function KioskView({ reservations, loading, maintenanceMap = {} }) {
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
      {/* Refresh bar */}
      <div style={{ height: 3, background: '#161616', flexShrink: 0 }}>
        <div key={tick} style={{
          height: '100%',
          background: 'linear-gradient(90deg, oklch(0.6 0.2 220), oklch(0.7 0.2 280))',
          animation: 'kiosk-bar 30s linear forwards',
        }} />
      </div>

      {/* Header */}
      <header style={{
        padding: '10px 24px', flexShrink: 0,
        background: '#0f0f0f', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="printer" size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>Tek3D</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Epitech · Atelier 3D</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginLeft: 20, paddingLeft: 18, borderLeft: '0.5px solid rgba(255,255,255,0.07)' }}>
          <KioskChip color="oklch(0.65 0.18 50)"  label="En impression" value={printingCount} />
          <KioskChip color="oklch(0.65 0.18 145)" label="Disponibles"   value={availableCount} />
          {maintenanceCount > 0 && <KioskChip color="oklch(0.65 0.18 25)" label="Maintenance" value={maintenanceCount} />}
        </div>

        {/* Live clock — centré */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, fontWeight: 200, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3, textTransform: 'capitalize' }}>
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right', fontSize: 10.5, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
            Prochaine mise à jour<br />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>dans {countdown}s</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.65 0.18 145)', animation: 'kiosk-pulse 2s ease-in-out infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em' }}>EN DIRECT</span>
          </div>
        </div>
      </header>

      {/* Cards */}
      <div style={{ flex: 1, padding: '14px 18px 14px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, minHeight: 0 }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 16 }}>
            Chargement…
          </div>
        ) : PRINTERS.map(p => (
          <KioskPrinterCard key={p.id} printer={p} status={printerStatus[p.id]} reservations={reservations} maintenance={maintenanceMap[p.id] || null} />
        ))}
      </div>
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
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={printerColor(hue, 0.65, 0.17)} strokeWidth={sw}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 2s ease' }} />
    </svg>
  );
}

function KioskPrinterCard({ printer, status, reservations, maintenance }) {
  const { NOW_FIXED: _nf } = React.useMemo(() => ({ NOW_FIXED: null }), []);
  const elapsedMin = (Date.now() - (reservations._nowFixed || 0)) / 60_000;

  const allItems = reservations
    .filter(r => r.printerId === printer.id && r.startMin + r.durationMin > 0 && r.startMin < 24 * 60)
    .sort((a, b) => a.startMin - b.startMin);

  const currentJob = allItems.find(r => r.startMin <= 0 && r.startMin + r.durationMin > 0);
  const queue = allItems.filter(r => r.startMin > 0).slice(0, 4);
  const load = loadPct(reservations, printer.id);

  const effectiveState = maintenance ? 'maintenance' : status.state;
  const isPrinting = effectiveState === 'printing' || effectiveState === 'soon_available';
  const isAvailable = effectiveState === 'available';
  const isSoon = effectiveState === 'soon_unavailable';
  const isMaint = effectiveState === 'maintenance';

  const accent = isMaint    ? 'oklch(0.5 0.18 25)'
    : isAvailable || isSoon ? 'oklch(0.6 0.16 145)'
    : printerColor(printer.hue, 0.58, 0.16);

  const border = 'rgba(255,255,255,0.06)';
  const sub    = 'rgba(255,255,255,0.4)';

  return (
    <div style={{
      background: '#141414', borderRadius: 14, overflow: 'hidden',
      border: `0.5px solid ${border}`, borderTop: `3px solid ${accent}`,
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `0.5px solid ${border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: printerColor(printer.hue), flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '0.01em' }}>{printer.name}</span>
          </div>
          <StatePill state={effectiveState} />
        </div>
        <div style={{ fontSize: 11, color: sub, paddingLeft: 18 }}>{printer.model}</div>
      </div>

      {/* Status */}
      <div style={{ padding: '14px', borderBottom: `0.5px solid ${border}`, flexShrink: 0 }}>
        {isMaint ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(160,40,20,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="wrench" size={22} color="oklch(0.68 0.18 25)" stroke={1.8} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'oklch(0.72 0.18 25)' }}>En maintenance</div>
                {maintenance.return_at && (
                  <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>
                    Retour {new Date(maintenance.return_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'oklch(0.62 0.12 25)', background: 'rgba(160,40,20,0.12)', padding: '7px 10px', borderRadius: 8, lineHeight: 1.4 }}>
              {maintenance.message}
            </div>
          </div>
        ) : isPrinting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <ArcProgress progress={status.progress} hue={printer.hue} size={88} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round(status.progress * 100)}%
                </span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {fmtRelativeFuture(status.etaMin)}
              </div>
              <div style={{ fontSize: 11, color: sub, marginBottom: 8 }}>restant</div>
              {currentJob && (
                <>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentJob.firstName} {currentJob.lastName}
                  </div>
                  {currentJob.project && currentJob.project !== 'Impression' && (
                    <div style={{ fontSize: 11, color: sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentJob.project}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: sub, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                    {fmtTime(currentJob.startMin)} – {fmtTime(currentJob.startMin + currentJob.durationMin)}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : isSoon ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(200,150,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={24} color="oklch(0.72 0.18 80)" stroke={1.6} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.78 0.18 80)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtRelativeFuture(status.nextStartMin)}
              </div>
              <div style={{ fontSize: 11, color: sub }}>avant la prochaine impression</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,180,80,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="check" size={24} color="oklch(0.72 0.18 145)" stroke={2} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'oklch(0.78 0.18 145)' }}>Disponible</div>
              {queue.length > 0
                ? <div style={{ fontSize: 11, color: sub }}>Prochain à {fmtTime(queue[0].startMin)}</div>
                : <div style={{ fontSize: 11, color: sub }}>Aucune réservation à venir</div>
              }
            </div>
          </div>
        )}

        {/* Load bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <div style={{ width: `${load * 100}%`, height: '100%', background: accent, borderRadius: 999, transition: 'width 1s ease' }} />
          </div>
          <span style={{ fontSize: 10.5, color: sub, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {Math.round(load * 100)}%
          </span>
        </div>
      </div>

      {/* Queue */}
      <div style={{ flex: 1, padding: '10px 12px', overflowY: 'auto', minHeight: 0 }}>
        {queue.length === 0 ? (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', textAlign: 'center', paddingTop: 10 }}>
            {isMaint ? '' : 'Aucune réservation à venir'}
          </div>
        ) : queue.map((r, i) => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 10px', borderRadius: 8, marginBottom: 4,
            background: i === 0
              ? `color-mix(in oklch, ${printerColor(printer.hue)} 9%, rgba(255,255,255,0.02))`
              : 'rgba(255,255,255,0.025)',
            border: `0.5px solid ${i === 0 ? `color-mix(in oklch, ${printerColor(printer.hue)} 22%, transparent)` : border}`,
          }}>
            <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 99, background: i === 0 ? printerColor(printer.hue) : 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.firstName} {r.lastName}
              </div>
              <div style={{ fontSize: 10.5, color: sub, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                {fmtTime(r.startMin)} – {fmtTime(r.startMin + r.durationMin)}
              </div>
            </div>
          </div>
        ))}
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
  const load = loadPct(reservations, printer.id);

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
            <div style={{ fontSize: 11.5, color: sub, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(status.progress * 100)}% · fin {fmtRelativeFuture(status.etaMin)}
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
          <div style={{ fontSize: 11, color: sub, textAlign: 'right' }}>
            <div>charge 24h</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: fg, fontVariantNumeric: 'tabular-nums' }}>{Math.round(load * 100)}%</div>
          </div>
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
