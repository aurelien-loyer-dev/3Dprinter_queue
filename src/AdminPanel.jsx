// AdminPanel.jsx — Admin dashboard
import React from 'react';
import {
  PRINTERS,
  printerColor, fmtTime, fmtDuration,
} from './data.js';
import {
  loadFilamentColors, addFilamentColor, deleteFilamentColor, deleteReservationAdmin,
  setMaintenance, clearMaintenance, sendPrinterCommand,
} from './supabase.js';
import { Icon, Btn } from './ui.jsx';

export function AdminPanel({ dark, reservations, onReservationDeleted, onDeleteAllReservations, me, maintenanceMap = {}, telemetryMap = {} }) {
  const [filamentColors, setFilamentColors] = React.useState([]);
  const [newColor, setNewColor] = React.useState({ printerId: PRINTERS[0].id, name: '', hex: '#FF0000' });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    loadFilamentColors().then(setFilamentColors);
  }, []);

  const handleAddColor = async () => {
    if (!newColor.name.trim()) return;
    setLoading(true);
    const success = await addFilamentColor(newColor.printerId, newColor.name, newColor.hex);
    if (success) {
      const colors = await loadFilamentColors();
      setFilamentColors(colors);
      setNewColor({ printerId: newColor.printerId, name: '', hex: '#FF0000' });
    }
    setLoading(false);
  };

  const handleDeleteColor = async (id) => {
    setLoading(true);
    const success = await deleteFilamentColor(id);
    if (success) {
      const colors = await loadFilamentColors();
      setFilamentColors(colors);
    }
    setLoading(false);
  };

  const handleDeleteReservation = async (id) => {
    if (confirm('Supprimer cette réservation ?')) {
      setLoading(true);
      const success = await deleteReservationAdmin(id);
      if (success) {
        onReservationDeleted(id);
      }
      setLoading(false);
    }
  };

  const handleDeleteAllReservations = async () => {
    if (!onDeleteAllReservations) return;
    setLoading(true);
    await onDeleteAllReservations();
    setLoading(false);
  };

  const bg = dark ? '#0a0a0a' : '#fafafa';
  const cardBg = dark ? '#1c1c1e' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const fg = dark ? '#f5f5f7' : '#1d1d1f';
  const sub = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';

  const colorsByPrinter = Object.fromEntries(
    PRINTERS.map(p => [p.id, filamentColors.filter(c => c.printer_id === p.id)])
  );

  return (
    <div style={{
      minHeight: '100vh', background: bg, color: fg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      letterSpacing: '-0.005em',
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: dark ? 'rgba(10,10,10,0.75)' : 'rgba(250,250,250,0.78)',
        backdropFilter: 'blur(24px)',
        borderBottom: `0.5px solid ${border}`,
        padding: '16px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="settings" size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Admin Panel</div>
            <div style={{ fontSize: 10.5, color: sub }}>Gestion imprimantes & filaments</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => window.open(window.location.origin + '?kiosk=1', '_blank')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0 14px', height: 34, borderRadius: 9,
            border: `0.5px solid ${border}`,
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: fg, fontSize: 12.5, fontWeight: 500,
            cursor: 'pointer', letterSpacing: '0.005em',
          }}
        >
          <Icon name="grid" size={13} />
          Ouvrir le mode kiosque
        </button>
      </header>

      {/* Content */}
      <main style={{ padding: '24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Printer Control Section */}
          <div style={{ gridColumn: '1/-1' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Contrôle des impressions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {PRINTERS.map(printer => (
                <PrinterControlCard
                  key={printer.id}
                  printer={printer}
                  telemetry={telemetryMap[printer.id] || null}
                  dark={dark}
                  border={border}
                  fg={fg}
                  sub={sub}
                  cardBg={cardBg}
                />
              ))}
            </div>
          </div>

          {/* Maintenance Section */}
          <div style={{ gridColumn: '1/-1' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Mise en maintenance</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              {PRINTERS.map(printer => (
                <MaintenanceCard
                  key={printer.id}
                  printer={printer}
                  maintenance={maintenanceMap[printer.id] || null}
                  me={me}
                  dark={dark}
                  border={border}
                  fg={fg}
                  sub={sub}
                  fieldBg={fieldBg}
                  cardBg={cardBg}
                />
              ))}
            </div>
          </div>

          {/* Filament Colors Section */}
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Couleurs de filament</h2>

            {/* Add Color Form */}
            <div style={{
              background: cardBg, border: `0.5px solid ${border}`,
              borderRadius: 14, padding: 16, marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: sub, textTransform: 'uppercase', marginBottom: 12 }}>
                Ajouter une couleur
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <select
                  value={newColor.printerId}
                  onChange={(e) => setNewColor({ ...newColor, printerId: e.target.value })}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: `0.5px solid ${border}`,
                    background: fieldBg, color: fg, fontSize: 13, outline: 'none',
                  }}
                >
                  {PRINTERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.model})</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Nom couleur (ex: Orange)"
                  value={newColor.name}
                  onChange={(e) => setNewColor({ ...newColor, name: e.target.value })}
                  style={{
                    padding: '10px 12px', borderRadius: 8, border: `0.5px solid ${border}`,
                    background: fieldBg, color: fg, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={newColor.hex}
                    onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                    style={{ width: 50, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    placeholder="#FF0000"
                    value={newColor.hex}
                    onChange={(e) => setNewColor({ ...newColor, hex: e.target.value })}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8, border: `0.5px solid ${border}`,
                      background: fieldBg, color: fg, fontSize: 12, outline: 'none', boxSizing: 'border-box',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
                <Btn
                  variant="primary" full
                  disabled={loading || !newColor.name.trim()}
                  onClick={handleAddColor}
                >
                  {loading ? 'Ajout...' : 'Ajouter'}
                </Btn>
              </div>
            </div>

            {/* Colors by printer */}
            <div style={{ display: 'grid', gap: 12 }}>
              {PRINTERS.map(printer => (
                <div key={printer.id} style={{
                  background: cardBg, border: `0.5px solid ${border}`,
                  borderRadius: 14, padding: 14, overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                    paddingBottom: 12, borderBottom: `0.5px solid ${border}`,
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: printerColor(printer.hue),
                    }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{printer.name}</div>
                      <div style={{ fontSize: 10.5, color: sub }}>{printer.model}</div>
                    </div>
                  </div>

                  {colorsByPrinter[printer.id].length === 0 ? (
                    <div style={{ fontSize: 12, color: sub, textAlign: 'center', padding: '8px 0' }}>
                      Aucune couleur assignée
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {colorsByPrinter[printer.id].map(color => (
                        <div key={color.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                          background: fieldBg, borderRadius: 8,
                        }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 4,
                            background: color.hex_color,
                            border: `1px solid ${border}`,
                          }} />
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{color.color_name}</span>
                          <span style={{ fontSize: 10, color: sub, fontFamily: 'monospace' }}>{color.hex_color}</span>
                          <button
                            onClick={() => handleDeleteColor(color.id)}
                            style={{
                              width: 24, height: 24, borderRadius: 6, border: 'none',
                              background: 'oklch(0.55 0.18 25)', color: '#fff',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 600,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Reservations Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Réservations</h2>
              <Btn
                variant="danger"
                size="sm"
                icon="trash"
                onClick={handleDeleteAllReservations}
                disabled={loading || reservations.length === 0}
              >
                Tout supprimer
              </Btn>
            </div>
            <div style={{
              background: cardBg, border: `0.5px solid ${border}`,
              borderRadius: 14, overflow: 'hidden', maxHeight: '70vh', overflowY: 'auto',
            }}>
              {reservations.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: sub }}>
                  Aucune réservation
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {reservations
                    .filter(r => r.startMin + r.durationMin > 0)
                    .sort((a, b) => a.startMin - b.startMin)
                    .map(r => (
                      <div key={r.id} style={{
                        padding: '12px 16px', borderBottom: `0.5px solid ${border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>
                            {r.firstName} {r.lastName}
                          </div>
                          <div style={{ fontSize: 11, color: sub, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                            {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)} ({fmtDuration(r.durationMin)})
                          </div>
                          <div style={{ fontSize: 10.5, color: sub, marginTop: 1 }}>
                            {PRINTERS.find(p => p.id === r.printerId)?.name} · {r.project}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteReservation(r.id)}
                          style={{
                            padding: '6px 10px', borderRadius: 6, border: 'none',
                            background: 'oklch(0.55 0.18 25)', color: '#fff',
                            cursor: 'pointer', fontSize: 11, fontWeight: 600,
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MaintenanceCard({ printer, maintenance, me, dark, border, fg, sub, fieldBg, cardBg }) {
  const [expanded, setExpanded] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [returnAt, setReturnAt] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const isActive = !!maintenance;

  const handleSet = async () => {
    if (!message.trim()) return;
    setLoading(true);
    await setMaintenance(printer.id, message.trim(), returnAt || null, me);
    setExpanded(false);
    setMessage('');
    setReturnAt('');
    setLoading(false);
  };

  const handleClear = async () => {
    setLoading(true);
    await clearMaintenance(printer.id);
    setLoading(false);
  };

  const activeBg   = dark ? 'rgba(180,60,30,0.15)' : 'oklch(0.96 0.04 25)';
  const activeBorder = dark ? 'rgba(180,60,30,0.35)' : 'oklch(0.86 0.07 25)';
  const activeText = dark ? 'oklch(0.75 0.18 25)' : 'oklch(0.4 0.18 25)';
  const activeSub  = dark ? 'rgba(255,200,180,0.55)' : 'oklch(0.52 0.12 25)';

  return (
    <div style={{
      background: isActive ? activeBg : cardBg,
      border: `0.5px solid ${isActive ? activeBorder : border}`,
      borderRadius: 12, padding: 12,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: printerColor(printer.hue), flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: isActive ? activeText : fg, flex: 1 }}>{printer.name}</span>
        {isActive && (
          <span style={{
            fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
            background: dark ? 'rgba(180,60,30,0.3)' : 'oklch(0.90 0.07 25)',
            color: activeText, letterSpacing: '0.03em',
          }}>
            MAINTENANCE
          </span>
        )}
      </div>

      {isActive ? (
        <>
          <div style={{ fontSize: 11.5, color: activeText, marginBottom: 3, lineHeight: 1.4 }}>
            {maintenance.message}
          </div>
          {maintenance.return_at && (
            <div style={{ fontSize: 10.5, color: activeSub, marginBottom: 10 }}>
              Retour : {new Date(maintenance.return_at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <Btn
            variant="danger" size="sm" full
            disabled={loading}
            onClick={handleClear}
          >
            {loading ? '…' : 'Lever la maintenance'}
          </Btn>
        </>
      ) : expanded ? (
        <>
          <textarea
            autoFocus
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Raison (ex: buse bouchée, calibration…)"
            rows={2}
            style={{
              width: '100%', resize: 'none', border: `0.5px solid ${border}`,
              borderRadius: 6, padding: '6px 8px', fontSize: 11.5,
              background: fieldBg, color: fg, outline: 'none',
              boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: 6,
            }}
          />
          <div style={{ fontSize: 10, color: sub, marginBottom: 4 }}>Retour estimé (optionnel)</div>
          <input
            type="datetime-local"
            value={returnAt}
            onChange={e => setReturnAt(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${border}`,
              background: fieldBg, color: fg, fontSize: 11.5, outline: 'none',
              boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn
              variant="danger" size="sm"
              disabled={loading || !message.trim()}
              onClick={handleSet}
              style={{ flex: 1 }}
            >
              {loading ? '…' : 'Mettre en maintenance'}
            </Btn>
            <Btn
              variant="secondary" size="sm"
              onClick={() => { setExpanded(false); setMessage(''); setReturnAt(''); }}
            >
              Annuler
            </Btn>
          </div>
        </>
      ) : (
        <Btn variant="secondary" size="sm" full icon="wrench" onClick={() => setExpanded(true)}>
          Mettre en maintenance
        </Btn>
      )}
    </div>
  );
}

function PrinterControlCard({ printer, telemetry, dark, border, fg, sub, cardBg }) {
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState(null);

  const state = telemetry?.state || 'offline';
  const isPrinting = state === 'printing';
  const isPaused   = state === 'paused';
  const isActive   = isPrinting || isPaused;

  const stateColor = {
    printing: 'oklch(0.5 0.18 145)',
    paused:   'oklch(0.55 0.16 55)',
    error:    'oklch(0.5 0.18 25)',
  }[state] || sub;

  const stateLabel = {
    printing: 'En impression',
    paused:   'En pause',
    idle:     'Idle',
    error:    'Erreur',
    offline:  'Hors ligne',
  }[state] || state;

  const send = async (cmd) => {
    setBusy(true);
    setFeedback(null);
    const ok = await sendPrinterCommand(printer.id, cmd);
    setFeedback(ok ? 'Commande envoyée' : 'Erreur');
    setBusy(false);
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div style={{ background: cardBg, border: `0.5px solid ${border}`, borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: printerColor(printer.hue), flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: fg }}>{printer.name}</span>
      </div>
      <div style={{ fontSize: 12, color: stateColor, fontWeight: 500 }}>
        {stateLabel}{isPrinting && telemetry?.progress != null && ` — ${telemetry.progress}%`}
      </div>
      {isActive ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isPrinting && (
            <button disabled={busy} onClick={() => send('pause')} style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: `0.5px solid ${border}`, background: dark ? 'rgba(255,200,50,0.12)' : 'oklch(0.97 0.06 80)', color: 'oklch(0.5 0.16 70)', fontWeight: 600, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
              ⏸ Mettre en pause
            </button>
          )}
          {isPaused && (
            <button disabled={busy} onClick={() => send('resume')} style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: `0.5px solid ${border}`, background: dark ? 'rgba(50,200,100,0.12)' : 'oklch(0.97 0.06 145)', color: 'oklch(0.45 0.16 145)', fontWeight: 600, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
              ▶ Reprendre
            </button>
          )}
          <button disabled={busy} onClick={() => { if (confirm(`Annuler l'impression sur ${printer.name} ?`)) send('stop'); }} style={{ width: '100%', padding: '7px 0', borderRadius: 8, border: `0.5px solid ${border}`, background: dark ? 'rgba(220,60,40,0.12)' : 'oklch(0.97 0.04 25)', color: 'oklch(0.5 0.18 25)', fontWeight: 600, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            ✕ Annuler l'impression
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: sub }}>
          {state === 'offline' ? 'Imprimante non joignable' : 'Aucune impression en cours'}
        </div>
      )}
      {feedback && (
        <div style={{ fontSize: 11, color: feedback === 'Commande envoyée' ? 'oklch(0.5 0.16 145)' : 'oklch(0.5 0.18 25)' }}>
          {feedback}
        </div>
      )}
    </div>
  );
}
