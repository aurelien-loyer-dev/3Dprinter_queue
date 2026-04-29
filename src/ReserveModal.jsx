// ReserveModal.jsx — duration-based reservation flow
import React from 'react';
import {
  PRINTERS,
  computePrinterStatus,
  printerById, findNextAvailable, getNextSlotOffset, printerColor,
  fmtTime, fmtDuration, fmtDayLabel, fmtRelativeFuture,
} from './data.js';
import { Icon, Btn } from './ui.jsx';

export function ReserveModal({ open, onClose, onConfirm, defaultPrinterId, reservations, slotSize, dark }) {
  const [printerId, setPrinterId] = React.useState(defaultPrinterId || PRINTERS[0].id);
  const [durationMin, setDurationMin] = React.useState(60);
  const [project, setProject] = React.useState('');
  const [chosenStart, setChosenStart] = React.useState(null);

  React.useEffect(() => {
    if (open) {
      setPrinterId(defaultPrinterId || PRINTERS[0].id);
      setChosenStart(null);
      setProject('');
      setDurationMin(60);
    }
  }, [open, defaultPrinterId]);

  if (!open) return null;

  const printer = printerById(printerId);
  const slotOffset = getNextSlotOffset(slotSize);

  const candidates = [];
  let cursor = slotOffset;
  for (let i = 0; i < 5; i++) {
    const next = findNextAvailable(reservations, printerId, durationMin, slotSize, cursor, slotOffset);
    candidates.push(next);
    cursor = next + slotSize;
  }

  const startMin = chosenStart ?? candidates[0];
  const endMin = startMin + durationMin;

  const dialogBg = dark ? '#1c1c1e' : '#ffffff';
  const overlayBg = dark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)';
  const fgText = dark ? '#f5f5f7' : '#1d1d1f';
  const subText = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#f5f5f7';

  // Duration presets in minutes, displayed in hours
  const durationOptions = [30, 60, 90, 120, 180, 240, 360, 480];
  const firstFutureIdx = candidates.findIndex(s => s > 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: overlayBg,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'qp-overlay-fade 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
          background: dialogBg, color: fgText,
          borderRadius: 20,
          border: `0.5px solid ${border}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.05)',
          animation: 'qp-modal-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `0.5px solid ${border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Nouvelle réservation</h2>
            <div style={{ fontSize: 12, color: subText, marginTop: 2 }}>Indique une durée, on te propose les prochains créneaux libres.</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: fieldBg, color: fgText, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Printer */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: subText, marginBottom: 8 }}>
              Imprimante
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {PRINTERS.map(p => {
                const selected = p.id === printerId;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setPrinterId(p.id); setChosenStart(null); }}
                    style={{
                      cursor: 'pointer',
                      padding: '10px 6px',
                      borderRadius: 10,
                      border: `0.5px solid ${selected ? printerColor(p.hue) : border}`,
                      background: selected ? `color-mix(in oklch, ${printerColor(p.hue)} 12%, ${dialogBg})` : fieldBg,
                      color: fgText,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: printerColor(p.hue) }} />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.005em' }}>{p.name}</span>
                    <span style={{ fontSize: 9.5, color: subText }}>{p.size === 'large' ? 'P1S' : 'A1 Mini'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: subText }}>
                Durée
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(durationMin)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
              {durationOptions.map(d => (
                <button
                  key={d}
                  onClick={() => { setDurationMin(d); setChosenStart(null); }}
                  style={{
                    cursor: 'pointer', height: 36, borderRadius: 8,
                    border: `0.5px solid ${durationMin === d ? '#1d1d1f' : border}`,
                    background: durationMin === d ? '#1d1d1f' : fieldBg,
                    color: durationMin === d ? '#fff' : fgText,
                    fontSize: 13, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmtDuration(d)}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={30} max={480} step={30}
              value={durationMin}
              onChange={(e) => { setDurationMin(parseInt(e.target.value)); setChosenStart(null); }}
              style={{ width: '100%', accentColor: '#1d1d1f' }}
            />
          </div>

          {/* Project name */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: subText, marginBottom: 8 }}>
              Nom du projet <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span>
            </div>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Boîtier Raspberry Pi..."
              style={{
                width: '100%', height: 38, padding: '0 12px',
                borderRadius: 10, border: `0.5px solid ${border}`,
                background: fieldBg, color: fgText,
                fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Slot suggestions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: subText, marginBottom: 8 }}>
              Créneaux disponibles
            </div>

            {/* Banner when no immediate slot */}
            {candidates[0] > 0 && (
              <div style={{
                marginBottom: 10, padding: '10px 14px', borderRadius: 10,
                background: 'oklch(0.97 0.04 80)', border: '0.5px solid oklch(0.88 0.06 80)',
                color: 'oklch(0.45 0.14 80)', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Icon name="clock" size={13} />
                Aucun créneau libre maintenant — prochain disponible {fmtRelativeFuture(candidates[0])}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {candidates.map((s, i) => {
                const selected = s === startMin;
                const isFuture = s > 0;
                return (
                  <button
                    key={i}
                    onClick={() => setChosenStart(s)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10,
                      border: `0.5px solid ${selected ? printerColor(printer.hue) : border}`,
                      background: selected ? `color-mix(in oklch, ${printerColor(printer.hue)} 10%, ${dialogBg})` : fieldBg,
                      color: fgText,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        border: `1.5px solid ${selected ? printerColor(printer.hue) : border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: printerColor(printer.hue) }} />}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtTime(s)} – {fmtTime(s + durationMin)}
                      </span>
                    </span>
                    <span style={{ fontSize: 11.5, color: subText, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                      {fmtDayLabel(s)}
                      {isFuture && <span style={{ marginLeft: 6, color: 'oklch(0.5 0.14 80)' }}>{fmtRelativeFuture(s)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px', borderTop: `0.5px solid ${border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
        }}>
          <div style={{ fontSize: 11.5, color: subText }}>
            {fmtDuration(durationMin)} · {Math.ceil(durationMin / slotSize)} créneau{Math.ceil(durationMin / slotSize) > 1 ? 'x' : ''} de {slotSize}min
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" size="md" onClick={onClose}>Annuler</Btn>
            <Btn
              variant="primary"
              size="md"
              icon="check"
              onClick={() => onConfirm({ printerId, startMin, durationMin, project: project || 'Impression' })}
            >
              Confirmer
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
