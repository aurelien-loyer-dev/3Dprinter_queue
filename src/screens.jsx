// screens.jsx — Auth + panels
import React from 'react';
import { loginUser, registerUser, verifyOtp } from './supabase.js';
import {
  computePrinterStatus,
  printerById, printerColor,
  fmtTime, fmtDuration, fmtDayLabel, fmtRelativeFuture,
  loadPct,
} from './data.js';
import { Icon, Avatar, Btn, StatePill } from './ui.jsx';

// ── Shared auth card shell ─────────────────────────────────────────────────

function AuthCard({ dark, children }) {
  const bg = dark ? '#000' : '#fafafa';
  const card = dark ? '#1c1c1e' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  return (
    <div style={{
      minHeight: '100vh', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", system-ui, sans-serif',
    }}>
      <div style={{
        width: 'min(420px, 100%)',
        background: card, border: `0.5px solid ${border}`,
        borderRadius: 20, padding: 36,
        boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
      }}>
        {children}
      </div>
    </div>
  );
}

function AuthBrand({ sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="printer" size={18} color="#fff" />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.005em' }}>Tek3D</div>
        <div style={{ fontSize: 11, color: sub }}>Epitech · Imprimantes 3D</div>
      </div>
    </div>
  );
}

function AuthField({ label, type = 'text', value, onChange, placeholder, error, autoFocus, dark }) {
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        autoFocus={autoFocus}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', height: 42, padding: '0 14px',
          borderRadius: 10, border: `0.5px solid ${error ? 'oklch(0.6 0.18 25)' : border}`,
          background: fieldBg, color: fg,
          fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

// ── LoginScreen ────────────────────────────────────────────────────────────

export function LoginScreen({ onLogin, onShowRegister, dark }) {
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await loginUser(login, password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onLogin(result.user);
  };

  return (
    <AuthCard dark={dark}>
      <AuthBrand sub={sub} />
      <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px', color: fg }}>
        Connexion
      </h1>
      <p style={{ fontSize: 13.5, color: sub, margin: '0 0 24px', lineHeight: 1.5 }}>
        Connecte-toi avec ton compte Epitech pour réserver un créneau.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthField label="Login Epitech" value={login} onChange={e => { setLogin(e.target.value); setError(''); }}
          placeholder="prenom.nom@epitech.eu" error={!!error} autoFocus dark={dark} />
        <AuthField label="Mot de passe" type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="••••••••" error={!!error} dark={dark} />
        {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', marginTop: -6 }}>{error}</div>}
        <Btn variant="primary" size="lg" full iconRight="arrow-right" disabled={loading}>
          {loading ? 'Vérification…' : 'Se connecter'}
        </Btn>
      </form>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: `0.5px solid ${border}`, textAlign: 'center', fontSize: 13, color: sub }}>
        Pas encore de compte ?{' '}
        <button onClick={onShowRegister} style={{ background: 'none', border: 'none', color: fg, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}>
          S'inscrire
        </button>
      </div>
    </AuthCard>
  );
}

// ── RegisterScreen ─────────────────────────────────────────────────────────

export function RegisterScreen({ onRegister, onShowLogin, dark }) {
  const [step, setStep] = React.useState('form'); // 'form' | 'verify'
  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true);
    const result = await registerUser(login, password);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    if (result.pendingVerification) { setStep('verify'); return; }
    onRegister(result.user);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Le code doit faire 6 chiffres'); return; }
    setLoading(true);
    const result = await verifyOtp(login, otp);
    setLoading(false);
    if (result.error) { setError(result.error); return; }
    onRegister(result.user);
  };

  if (step === 'verify') {
    return (
      <AuthCard dark={dark}>
        <AuthBrand sub={sub} />
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px', color: fg }}>
          Vérifie ton mail
        </h1>
        <p style={{ fontSize: 13.5, color: sub, margin: '0 0 24px', lineHeight: 1.5 }}>
          Un code à 6 chiffres a été envoyé à <strong style={{ color: fg }}>{login}</strong>. Saisis-le ci-dessous.
        </p>

        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, display: 'block', marginBottom: 10 }}>
              Code de vérification
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
              placeholder="000000"
              style={{
                width: '100%', height: 56, padding: '0 14px',
                borderRadius: 12, border: `0.5px solid ${error ? 'oklch(0.6 0.18 25)' : border}`,
                background: fieldBg, color: fg,
                fontSize: 28, fontWeight: 700, letterSpacing: '0.3em',
                outline: 'none', boxSizing: 'border-box', textAlign: 'center',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', marginTop: 8 }}>{error}</div>}
          </div>
          <Btn variant="primary" size="lg" full iconRight="check" disabled={loading || otp.length !== 6}>
            {loading ? 'Vérification…' : 'Confirmer'}
          </Btn>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `0.5px solid ${border}`, textAlign: 'center', fontSize: 13, color: sub }}>
          Mauvaise adresse ?{' '}
          <button onClick={() => { setStep('form'); setOtp(''); setError(''); }}
            style={{ background: 'none', border: 'none', color: fg, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}>
            Recommencer
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard dark={dark}>
      <AuthBrand sub={sub} />
      <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 6px', color: fg }}>
        Inscription
      </h1>
      <p style={{ fontSize: 13.5, color: sub, margin: '0 0 24px', lineHeight: 1.5 }}>
        Choisis ton adresse Epitech et un mot de passe. Un code sera envoyé pour vérifier ton mail.
      </p>

      <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AuthField label="Login Epitech" value={login} onChange={e => { setLogin(e.target.value); setError(''); }}
          placeholder="prenom.nom@epitech.eu" error={!!error} autoFocus dark={dark} />
        <AuthField label="Mot de passe (tu le choisiras)" type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="6 caractères minimum" error={!!error} dark={dark} />
        <AuthField label="Confirmer le mot de passe" type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
          placeholder="••••••••" error={!!error} dark={dark} />
        {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', marginTop: -6 }}>{error}</div>}
        <Btn variant="primary" size="lg" full iconRight="arrow-right" disabled={loading}>
          {loading ? 'Envoi du code de vérification…' : 'Créer mon compte'}
        </Btn>
      </form>

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: `0.5px solid ${border}`, textAlign: 'center', fontSize: 13, color: sub }}>
        Déjà un compte ?{' '}
        <button onClick={onShowLogin} style={{ background: 'none', border: 'none', color: fg, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}>
          Se connecter
        </button>
      </div>
    </AuthCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function MyReservationsPanel({ open, onClose, reservations, me, onCancel, dark }) {
  if (!open) return null;

  const mine = reservations.filter(r => r.login === me.login);
  const upcoming = mine.filter(r => r.startMin + r.durationMin > 0).sort((a, b) => a.startMin - b.startMin);
  const past = mine.filter(r => r.startMin + r.durationMin <= 0).sort((a, b) => b.startMin - a.startMin);

  const dialogBg = dark ? '#1c1c1e' : '#ffffff';
  const overlayBg = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: overlayBg,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'flex-end',
        animation: 'qp-overlay-fade 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)', height: '100vh', overflow: 'auto',
          background: dialogBg, color: fg,
          borderLeft: `0.5px solid ${border}`,
          boxShadow: '-30px 0 80px rgba(0,0,0,0.15)',
          animation: 'qp-modal-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: dialogBg, zIndex: 1 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Mes réservations</h2>
            <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>
              {upcoming.length} à venir · {past.length} dans l'historique
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: fg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Section title="À venir" sub={sub} count={upcoming.length}>
            {upcoming.length === 0 ? (
              <EmptyState icon="clock" text="Aucune réservation à venir" sub={sub} dark={dark} />
            ) : (
              upcoming.map(r => <ReservationRow key={r.id} r={r} me={me} dark={dark} onCancel={onCancel} />)
            )}
          </Section>

          <Section title="Historique" sub={sub} count={past.length}>
            {past.length === 0 ? (
              <EmptyState icon="history" text="Pas encore d'impression terminée" sub={sub} dark={dark} />
            ) : (
              past.map(r => <ReservationRow key={r.id} r={r} me={me} dark={dark} historic />)
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, sub, count, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span>{title}</span>
        <span style={{ fontWeight: 500, opacity: 0.6 }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon, text, sub, dark }) {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center',
      borderRadius: 12, border: `0.5px dashed ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
      color: sub, fontSize: 13,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <Icon name={icon} size={20} />
      {text}
    </div>
  );
}

function ReservationRow({ r, me, dark, historic, onCancel }) {
  const printer = printerById(r.printerId);
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#fafafa';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  const isLive = r.startMin <= 0 && r.startMin + r.durationMin > 0;

  return (
    <div style={{
      padding: 14, borderRadius: 12,
      border: `0.5px solid ${border}`,
      background: cardBg,
      display: 'flex', flexDirection: 'column', gap: 8,
      opacity: historic ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: printerColor(printer.hue), flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: '0.005em' }}>{printer.name}</span>
          <span style={{ fontSize: 11, color: sub }}>· {printer.model}</span>
        </div>
        {isLive && (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'oklch(0.55 0.18 25)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            ● en cours
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: fg }}>
        {r.project}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 11.5, color: sub, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="clock" size={12} />
          {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)} · {fmtDayLabel(r.startMin)} · {fmtDuration(r.durationMin)}
        </div>
        {!historic && onCancel && (
          <Btn variant="danger" size="sm" icon="trash" onClick={() => onCancel(r.id)}>Annuler</Btn>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function PrinterDetailPanel({ open, printerId, onClose, reservations, me, onReserve, onCancel, dark }) {
  if (!open || !printerId) return null;

  const printer = printerById(printerId);
  const status = computePrinterStatus(reservations, printerId);
  const isPrinting = status.state === 'printing' || status.state === 'soon_available';

  const items = reservations
    .filter(r => r.printerId === printerId && r.startMin + r.durationMin > -60 * 24)
    .sort((a, b) => a.startMin - b.startMin);

  const upcoming = items.filter(r => r.startMin + r.durationMin > 0);
  const recent = items.filter(r => r.startMin + r.durationMin <= 0).reverse().slice(0, 5);
  const load = loadPct(reservations, printerId);

  const dialogBg = dark ? '#1c1c1e' : '#ffffff';
  const overlayBg = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';

  const currentJob = upcoming.find(r => r.startMin <= 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: overlayBg, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', justifyContent: 'flex-end',
        animation: 'qp-overlay-fade 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', height: '100vh', overflow: 'auto',
          background: dialogBg, color: fg,
          borderLeft: `0.5px solid ${border}`,
          boxShadow: '-30px 0 80px rgba(0,0,0,0.15)',
          animation: 'qp-modal-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        {/* Hero */}
        <div style={{
          padding: '24px 24px 20px',
          background: `linear-gradient(135deg, color-mix(in oklch, ${printerColor(printer.hue)} 14%, ${dialogBg}), ${dialogBg})`,
          borderBottom: `0.5px solid ${border}`,
          position: 'relative',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 16, right: 16,
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: dark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.6)', color: fg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Icon name="close" size={14} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: printerColor(printer.hue),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="printer" size={22} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>{printer.name}</h2>
              <div style={{ fontSize: 12.5, color: sub }}>{printer.model}</div>
            </div>
          </div>

          <StatePill state={status.state} />

          {isPrinting && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(status.progress * 100)}% imprimé</span>
                <span style={{ color: sub, fontVariantNumeric: 'tabular-nums' }}>fin {fmtRelativeFuture(status.etaMin)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <div style={{ width: `${status.progress * 100}%`, height: '100%', background: printerColor(printer.hue), borderRadius: 999 }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <Stat icon="sparkle" label="Charge 24h"   value={`${Math.round(load * 100)}%`}               sub={sub} fg={fg} bg={fieldBg} border={border} />
            <Stat icon="clock"   label="Réservations" value={upcoming.filter(r => r.startMin > 0).length} sub={sub} fg={fg} bg={fieldBg} border={border} />
          </div>

          {currentJob && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 10 }}>
                Impression en cours
              </div>
              <div style={{
                padding: 14, borderRadius: 12,
                border: `0.5px solid ${printerColor(printer.hue)}`,
                background: `color-mix(in oklch, ${printerColor(printer.hue)} 8%, ${dialogBg})`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <Avatar first={currentJob.firstName} last={currentJob.lastName} hue={printer.hue} size={28} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{currentJob.firstName} {currentJob.lastName}</div>
                    <div style={{ fontSize: 11.5, color: sub }}>{currentJob.project}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub }}>
                File d'attente · {upcoming.filter(r => r.startMin > 0).length}
              </span>
              <Btn variant="primary" size="sm" icon="plus" onClick={() => onReserve(printerId)}>Réserver</Btn>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcoming.filter(r => r.startMin > 0).length === 0 ? (
                <EmptyState icon="clock" text="Aucun créneau réservé après l'impression actuelle" sub={sub} dark={dark} />
              ) : (
                upcoming.filter(r => r.startMin > 0).map((r, i) => (
                  <QueueItem key={r.id} r={r} index={i + 1} me={me} dark={dark} hue={printer.hue} onCancel={onCancel} />
                ))
              )}
            </div>
          </div>

          {recent.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 10 }}>
                Historique récent
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recent.map(r => (
                  <QueueItem key={r.id} r={r} me={me} dark={dark} hue={printer.hue} historic />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, fg, bg, border }) {
  return (
    <div style={{
      padding: 12, borderRadius: 10,
      border: `0.5px solid ${border}`, background: bg,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontSize: 10.5, color: sub, display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        <Icon name={icon} size={11} />
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, color: fg, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {value}
      </div>
    </div>
  );
}

function QueueItem({ r, index, me, dark, hue, historic, onCancel }) {
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#fafafa';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const isMine = r.login === me.login;

  return (
    <div style={{
      padding: 12, borderRadius: 10,
      border: `0.5px solid ${isMine ? printerColor(hue) : border}`,
      background: isMine ? `color-mix(in oklch, ${printerColor(hue)} 6%, ${cardBg})` : cardBg,
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: historic ? 0.55 : 1,
    }}>
      {index !== undefined && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: sub, fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}>{index}</div>
      )}
      <Avatar first={r.firstName} last={r.lastName} hue={hue} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.firstName} {r.lastName}
          {isMine && <span style={{ fontSize: 10, fontWeight: 600, color: printerColor(hue, 0.5, 0.16), letterSpacing: '0.04em', textTransform: 'uppercase' }}>· toi</span>}
        </div>
        <div style={{ fontSize: 11.5, color: sub, fontVariantNumeric: 'tabular-nums' }}>
          {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)} · {fmtDuration(r.durationMin)} · {r.project}
        </div>
      </div>
      {isMine && !historic && onCancel && (
        <button
          onClick={() => onCancel(r.id)}
          style={{
            width: 26, height: 26, borderRadius: 7, border: 'none',
            background: 'transparent', color: sub, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Annuler"
          onMouseEnter={e => { e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'; e.currentTarget.style.color = 'oklch(0.55 0.18 25)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = sub; }}
        >
          <Icon name="trash" size={13} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function NotificationToast({ notif, onClose, dark }) {
  React.useEffect(() => {
    if (!notif) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [notif, onClose]);

  if (!notif) return null;

  const bg = dark ? '#1c1c1e' : '#ffffff';
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  return (
    <div style={{
      position: 'fixed', top: 76, right: 24, zIndex: 200,
      width: 'min(360px, calc(100vw - 32px))',
      background: bg, color: fg,
      border: `0.5px solid ${border}`,
      borderRadius: 14,
      padding: '14px 16px',
      boxShadow: '0 14px 40px rgba(0,0,0,0.15)',
      animation: 'qp-toast-in 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: notif.tone === 'success' ? 'oklch(0.95 0.05 145)' : 'oklch(0.95 0.05 50)',
        color: notif.tone === 'success' ? 'oklch(0.45 0.16 145)' : 'oklch(0.5 0.16 50)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={notif.icon || 'bell'} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{notif.title}</div>
        <div style={{ fontSize: 12, color: sub, lineHeight: 1.45 }}>{notif.message}</div>
      </div>
      <button
        onClick={onClose}
        style={{
          width: 22, height: 22, borderRadius: 6, border: 'none',
          background: 'transparent', color: sub, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
