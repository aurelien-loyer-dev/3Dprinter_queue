// AdminPanel.jsx — Admin dashboard
import React from 'react';
import {
  PRINTERS,
  printerColor, fmtTime, fmtDuration,
} from './data.js';
import {
  loadFilamentColors, addFilamentColor, deleteFilamentColor, deleteReservationAdmin,
} from './supabase.js';
import { Icon, Btn } from './ui.jsx';

export function AdminPanel({ dark, reservations, onReservationDeleted, me }) {
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
      </header>

      {/* Content */}
      <main style={{ padding: '24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

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
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Réservations</h2>
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
