// StatsPanel.jsx — statistiques globales de l'atelier
import React from 'react';
import { PRINTERS, minToDate, fmtDuration, printerColor } from './data.js';
import { Icon } from './ui.jsx';

export function StatsPanel({ open, onClose, reservations, dark }) {
  if (!open) return null;

  const dialogBg  = dark ? '#1c1c1e' : '#ffffff';
  const overlayBg = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const fg        = dark ? '#f5f5f7' : '#1d1d1f';
  const sub       = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border    = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const cardBg    = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';

  // ── Calculs ─────────────────────────────────────────────────────────────

  const printerStats = PRINTERS.map(p => {
    const res = reservations.filter(r => r.printerId === p.id);
    const totalMin = res.reduce((s, r) => s + r.durationMin, 0);
    return { printer: p, count: res.length, totalMin };
  }).sort((a, b) => b.count - a.count);

  const maxCount = Math.max(1, ...printerStats.map(s => s.count));

  // Heures de pointe (par tranche de 2h)
  const slotCounts = Array(12).fill(0);
  reservations.forEach(r => {
    const h = minToDate(r.startMin).getHours();
    slotCounts[Math.floor(h / 2)]++;
  });
  const maxSlot = Math.max(1, ...slotCounts);

  // Top utilisateurs
  const userMap = {};
  reservations.forEach(r => {
    if (!userMap[r.login]) userMap[r.login] = { name: `${r.firstName} ${r.lastName}`, count: 0, totalMin: 0 };
    userMap[r.login].count++;
    userMap[r.login].totalMin += r.durationMin;
  });
  const topUsers = Object.values(userMap).sort((a, b) => b.count - a.count).slice(0, 5);

  const totalReservations = reservations.length;
  const totalPrintMin = reservations.reduce((s, r) => s + r.durationMin, 0);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: overlayBg, backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'flex-end',
      animation: 'qp-overlay-fade 0.2s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(520px, 100%)', height: '100vh', overflow: 'auto',
        background: dialogBg, color: fg,
        borderLeft: `0.5px solid ${border}`,
        boxShadow: '-30px 0 80px rgba(0,0,0,0.15)',
        animation: 'qp-modal-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `0.5px solid ${border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: dialogBg, zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Statistiques</h2>
            <div style={{ fontSize: 12, color: sub, marginTop: 2 }}>
              {totalReservations} réservations · {fmtDuration(totalPrintMin)} d'impression au total
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8, border: 'none',
            background: cardBg, color: fg, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Utilisation par imprimante */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 14 }}>
              Utilisation par imprimante
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {printerStats.map(({ printer, count, totalMin }) => (
                <div key={printer.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: printerColor(printer.hue), flexShrink: 0 }} />
                      {printer.name}
                    </span>
                    <span style={{ color: sub, fontVariantNumeric: 'tabular-nums' }}>
                      {count} créneau{count > 1 ? 'x' : ''} · {fmtDuration(totalMin)}
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(count / maxCount) * 100}%`, height: '100%',
                      background: printerColor(printer.hue),
                      borderRadius: 999, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Heures de pointe */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 14 }}>
              Heures de pointe
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
              {slotCounts.map((count, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', borderRadius: 4,
                    height: `${Math.max(4, (count / maxSlot) * 50)}px`,
                    background: count === maxSlot ? 'oklch(0.55 0.15 220)' : (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
                    transition: 'height 0.3s ease',
                  }} />
                  <span style={{ fontSize: 9, color: sub, fontVariantNumeric: 'tabular-nums' }}>
                    {String(i * 2).padStart(2, '0')}h
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Top utilisateurs */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: sub, marginBottom: 14 }}>
              Top utilisateurs
            </div>
            {topUsers.length === 0 ? (
              <div style={{ fontSize: 13, color: sub }}>Aucune réservation pour le moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topUsers.map((u, i) => (
                  <div key={u.name} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: cardBg, border: `0.5px solid ${border}`,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: i === 0 ? 'oklch(0.78 0.16 80)' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: i === 0 ? '#fff' : sub, flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: sub, fontVariantNumeric: 'tabular-nums' }}>
                        {u.count} réservation{u.count > 1 ? 's' : ''} · {fmtDuration(u.totalMin)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
