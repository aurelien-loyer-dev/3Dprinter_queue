// PrinterCard.jsx — single printer column in the dashboard
import React from 'react';

function swatchBorder(hex) {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? '2px solid rgba(0,0,0,0.30)' : '1.5px solid rgba(255,255,255,0.12)';
}
import {
  findNextAvailable,
  getNextSlotOffset,
  printerColor, printerColorSoft,
  fmtTime, fmtTimeRound, fmtDuration, fmtRelativeFuture,
  NOW_FIXED,
} from './data.js';
import { loadFilamentColors, loadPrinterNotes, addPrinterNote, deletePrinterNote } from './supabase.js';
import { Icon, Btn, StatePill } from './ui.jsx';

export function PrinterCard({ printer, status, reservations, allReservations, me, onSlotClick, onReserve, onCancel, slotSize, density, dark, searchQuery, hourSpan = 24, maintenance = null, telemetry = null }) {
  const HOURS = hourSpan;
  const PIXELS_PER_HOUR = density === 'compact' ? 36 : density === 'comfy' ? 64 : 48;
  const TIMELINE_HEIGHT = HOURS * PIXELS_PER_HOUR;
  const slotOffset = getNextSlotOffset(slotSize);

  const [dbFilamentColors, setDbFilamentColors] = React.useState([]);
  const [notes, setNotes] = React.useState([]);
  const [noteInput, setNoteInput] = React.useState('');
  const [showNoteInput, setShowNoteInput] = React.useState(false);
  const [noteLoading, setNoteLoading] = React.useState(false);

  React.useEffect(() => {
    loadFilamentColors().then(colors => setDbFilamentColors(colors.filter(c => c.printer_id === printer.id)));
    loadPrinterNotes(printer.id).then(setNotes);
  }, [printer.id]);

  // Couleurs AMS du bridge prioritaires sur les couleurs manuelles
  const filamentColors = React.useMemo(() => {
    if (telemetry?.ams_colors) {
      try {
        return JSON.parse(telemetry.ams_colors).map((hex, i) => ({ id: `ams-${i}`, hex_color: hex, color_name: `AMS ${i + 1}` }));
      } catch { /* fall through */ }
    }
    return dbFilamentColors;
  }, [telemetry?.ams_colors, dbFilamentColors]);

  const handleAddNote = async () => {
    if (!noteInput.trim() || !me) return;
    setNoteLoading(true);
    const ok = await addPrinterNote(printer.id, noteInput.trim(), me);
    if (ok) {
      loadPrinterNotes(printer.id).then(setNotes);
      setNoteInput('');
      setShowNoteInput(false);
    }
    setNoteLoading(false);
  };

  const handleDeleteNote = async (noteId) => {
    const ok = await deletePrinterNote(noteId);
    if (ok) setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const items = reservations
    .filter(r => r.printerId === printer.id)
    .filter(r => r.startMin + r.durationMin > 0 && r.startMin < HOURS * 60)
    .sort((a, b) => a.startMin - b.startMin);

  const nextStart = findNextAvailable(allReservations, printer.id, slotSize, slotSize, slotOffset, slotOffset);
  const elapsedMin = (Date.now() - NOW_FIXED.getTime()) / 60_000;
  const currentJob = items.find(r => r.startMin <= elapsedMin && r.startMin + r.durationMin > elapsedMin);

  const cardBg = dark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const subText = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,29,31,0.55)';
  const fgText = dark ? '#f5f5f7' : '#1d1d1f';

  const PrinterDot = () => (
    <span style={{
      width: 8, height: 8, borderRadius: 2,
      background: printerColor(printer.hue),
      flexShrink: 0,
    }} />
  );

  return (
    <div style={{
      background: cardBg,
      border: `0.5px solid ${border}`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ padding: density === 'compact' ? '12px 14px' : '16px 18px', borderBottom: `0.5px solid ${border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <PrinterDot />
            <span style={{ fontWeight: 600, fontSize: density === 'compact' ? 14 : 15, letterSpacing: '0.01em', color: fgText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {printer.name}
            </span>
          </div>
          <StatePill state={maintenance ? 'maintenance' : status.state} compact />
        </div>
        <div style={{ fontSize: 11.5, color: subText, marginBottom: 10 }}>
          {printer.model}
        </div>

        {/* Maintenance banner */}
        {maintenance && (
          <div style={{
            margin: '0 -18px', padding: '10px 18px',
            background: dark ? 'rgba(180,60,30,0.15)' : 'oklch(0.96 0.04 25)',
            borderTop: `0.5px solid ${dark ? 'rgba(180,60,30,0.3)' : 'oklch(0.88 0.06 25)'}`,
            borderBottom: `0.5px solid ${dark ? 'rgba(180,60,30,0.3)' : 'oklch(0.88 0.06 25)'}`,
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: dark ? 'oklch(0.75 0.18 25)' : 'oklch(0.4 0.18 25)', marginBottom: 3 }}>
              <Icon name="wrench" size={12} />
              En maintenance
            </div>
            <div style={{ fontSize: 11, color: dark ? 'oklch(0.65 0.14 25)' : 'oklch(0.45 0.14 25)', lineHeight: 1.4 }}>
              {maintenance.message}
            </div>
            {maintenance.return_at && (
              <div style={{ fontSize: 10.5, color: dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.1 25)', marginTop: 3 }}>
                Retour estimé {new Date(maintenance.return_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        )}

        {!maintenance && (status.state === 'printing' || status.state === 'soon_available') && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: subText, marginBottom: 5 }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: fgText, fontWeight: 500 }}>{Math.round(status.progress * 100)}%</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>fin {fmtRelativeFuture(status.etaMin)}</span>
            </div>
            <div style={{ height: 3, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ width: `${status.progress * 100}%`, height: '100%', background: printerColor(printer.hue), borderRadius: 999, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}
        {!maintenance && status.state === 'paused' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.45 0.12 220)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="clock" size={12} />
            En pause
          </div>
        )}
        {!maintenance && status.state === 'error' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.18 25)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="wrench" size={12} />
            Erreur détectée{telemetry?.error_code ? ` (${telemetry.error_code})` : ''}
          </div>
        )}
        {!maintenance && status.state === 'offline' && (
          <div style={{ fontSize: 11.5, color: subText, display: 'flex', alignItems: 'center', gap: 5 }}>
            Hors ligne
          </div>
        )}
        {!maintenance && status.state === 'reserved' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="clock" size={12} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'oklch(0.45 0.12 220)' }}>Réservé</div>
              {currentJob && (
                <div style={{ fontWeight: 700, fontSize: 12, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentJob.firstName} {currentJob.lastName}
                </div>
              )}
              {currentJob && (
                <div style={{ fontSize: 10, color: subText }}>{fmtTime(currentJob.startMin)}–{fmtTime(currentJob.startMin + currentJob.durationMin)}</div>
              )}
            </div>
          </div>
        )}
        {!maintenance && status.state === 'available' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.13 145)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="check" size={12} />
            Prête à imprimer
          </div>
        )}
        {!maintenance && status.state === 'soon_unavailable' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.14 80)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="clock" size={12} />
            Impression {fmtRelativeFuture(status.nextStartMin)}
          </div>
        )}

        {/* Telemetry chips: temp, layers, speed */}
        {telemetry && !maintenance && (telemetry.nozzle_temp != null || telemetry.layer_current != null || telemetry.error_code) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {telemetry.nozzle_temp != null && (
              <TelChip dark={dark}>
                <Icon name="thermometer" size={10} />
                {telemetry.nozzle_temp}°{telemetry.bed_temp != null ? `·${telemetry.bed_temp}°` : ''}
              </TelChip>
            )}
            {telemetry.layer_current != null && telemetry.layer_total != null && (
              <TelChip dark={dark}>
                {telemetry.layer_current}/{telemetry.layer_total} couches
              </TelChip>
            )}
            {telemetry.speed_level && (status.state === 'printing' || status.state === 'paused') && (
              <TelChip dark={dark}>{telemetry.speed_level}</TelChip>
            )}
            {telemetry.error_code != null && (
              <TelChip dark={dark} error>Code {telemetry.error_code}</TelChip>
            )}
          </div>
        )}

        {filamentColors.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
            <div style={{ fontSize: 10, color: subText, marginBottom: 6, fontWeight: 500 }}>Filaments disponibles</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {filamentColors.map(color => (
                <div key={color.id} title={color.color_name} style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: color.hex_color,
                  border: swatchBorder(color.hex_color),
                  boxShadow: `0 2px 6px ${color.hex_color}55`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {(notes.length > 0 || me) && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: subText, fontWeight: 500 }}>Notes</div>
              {me && !showNoteInput && (
                <button
                  onClick={() => setShowNoteInput(true)}
                  style={{
                    width: 18, height: 18, borderRadius: 4, border: 'none',
                    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    color: subText, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Ajouter une note"
                >
                  <Icon name="plus" size={9} />
                </button>
              )}
            </div>
            {notes.slice(0, 2).map(note => (
              <div key={note.id} style={{
                fontSize: 11, padding: '5px 8px', borderRadius: 6, marginBottom: 4,
                background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${border}`,
                position: 'relative',
              }}>
                <div style={{
                  color: fgText, lineHeight: 1.4,
                  paddingRight: me && (me.isAdmin || me.login === note.author_login) ? 18 : 0,
                }}>
                  {note.content}
                </div>
                <div style={{ fontSize: 9.5, color: subText, marginTop: 2 }}>
                  {note.author_name}
                </div>
                {me && (me.isAdmin || me.login === note.author_login) && (
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 16, height: 16, borderRadius: 3, border: 'none',
                      background: 'transparent', color: subText, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Supprimer"
                  >
                    <Icon name="close" size={9} />
                  </button>
                )}
              </div>
            ))}
            {notes.length === 0 && !showNoteInput && (
              <div style={{ fontSize: 11, color: subText }}>Aucune note</div>
            )}
            {showNoteInput && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <textarea
                  autoFocus
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } if (e.key === 'Escape') { setShowNoteInput(false); setNoteInput(''); } }}
                  placeholder="Ajouter une note…"
                  rows={2}
                  style={{
                    width: '100%', resize: 'none', border: `0.5px solid ${border}`,
                    borderRadius: 6, padding: '5px 7px', fontSize: 11,
                    background: dark ? 'rgba(255,255,255,0.05)' : '#fff',
                    color: fgText, outline: 'none', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={handleAddNote}
                    disabled={noteLoading || !noteInput.trim()}
                    style={{
                      flex: 1, height: 24, borderRadius: 5, border: 'none',
                      background: printerColor(printer.hue), color: '#fff',
                      fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                      opacity: noteLoading || !noteInput.trim() ? 0.5 : 1,
                    }}
                  >
                    {noteLoading ? '…' : 'Publier'}
                  </button>
                  <button
                    onClick={() => { setShowNoteInput(false); setNoteInput(''); }}
                    style={{
                      height: 24, padding: '0 8px', borderRadius: 5, border: 'none',
                      background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                      color: subText, fontSize: 10.5, cursor: 'pointer',
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reserve CTA */}
      <div style={{ padding: density === 'compact' ? '10px 14px' : '12px 18px', borderBottom: `0.5px solid ${border}` }}>
        {maintenance ? (
          <Btn variant="secondary" size="sm" full disabled>
            Imprimante en maintenance
          </Btn>
        ) : (
          <Btn variant="primary" size="sm" full icon="plus" onClick={() => onReserve(printer.id)}>
            Réserver — prochain {fmtTime(nextStart)}
          </Btn>
        )}
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', padding: '4px 0 8px' }}>
        <Timeline
          hours={HOURS}
          pixelsPerHour={PIXELS_PER_HOUR}
          slotSize={slotSize}
          items={items}
          printer={printer}
          status={status}
          me={me}
          dark={dark}
          density={density}
          searchQuery={searchQuery}
          onSlotClick={maintenance ? null : ((min) => onSlotClick && onSlotClick(printer.id, min))}
          onItemCancel={onCancel}
        />
      </div>
    </div>
  );
}

function TelChip({ dark, error, children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 10, fontVariantNumeric: 'tabular-nums',
      padding: '2px 6px', borderRadius: 5,
      background: error
        ? (dark ? 'rgba(220,60,40,0.15)' : 'oklch(0.96 0.04 25)')
        : (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
      color: error
        ? (dark ? 'oklch(0.7 0.18 25)' : 'oklch(0.48 0.18 25)')
        : (dark ? 'rgba(255,255,255,0.6)' : 'rgba(29,29,31,0.6)'),
      border: `0.5px solid ${error
        ? (dark ? 'rgba(220,60,40,0.3)' : 'oklch(0.88 0.06 25)')
        : (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')}`,
    }}>
      {children}
    </span>
  );
}

function Timeline({ hours, pixelsPerHour, slotSize, items, printer, status, me, dark, density, searchQuery, onSlotClick, onItemCancel }) {
  const TIMELINE_HEIGHT = hours * pixelsPerHour;
  const slotsPerHour = 60 / slotSize;
  const slotHeight = pixelsPerHour / slotsPerHour;
  const slotOffset = getNextSlotOffset(slotSize);
  const totalSlots = Math.max(0, Math.floor((hours * 60 - slotOffset) / slotSize));

  const subText = dark ? 'rgba(255,255,255,0.45)' : 'rgba(29,29,31,0.45)';
  const slotLine = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)';
  const hourLine = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const slotHover = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)';

  return (
    <div style={{ display: 'flex', position: 'relative' }}>
      {/* Hour ruler */}
      <div style={{ width: 38, position: 'relative', flexShrink: 0, paddingTop: 0 }}>
        {Array.from({ length: hours + 1 }).map((_, i) => {
          const min = i * 60;
          if (i === hours) return null;
          return (
            <div key={i} style={{
              position: 'absolute', top: i * pixelsPerHour, left: 0, right: 0,
              fontSize: 10, color: subText, paddingLeft: 10, fontVariantNumeric: 'tabular-nums',
              transform: 'translateY(-4px)',
            }}>
              {fmtTimeRound(min)}
            </div>
          );
        })}
      </div>

      {/* Lanes */}
      <div style={{ position: 'relative', width: '100%', height: `${TIMELINE_HEIGHT}px`, marginRight: 12 }}>
        {/* Hour grid lines */}
        {Array.from({ length: hours + 1 }).map((_, i) => (
          <div key={`h-${i}`} style={{
            position: 'absolute', top: `${i * pixelsPerHour}px`, left: 0, right: 0,
            height: 0.5, background: hourLine,
          }} />
        ))}
        {/* Slot dividers */}
        {Array.from({ length: totalSlots }).map((_, i) => i % slotsPerHour === 0 ? null : (
          <div key={`s-${i}`} style={{
            position: 'absolute', top: `${i * slotHeight}px`, left: 0, right: 0,
            height: 0.5, background: slotLine,
          }} />
        ))}

        {/* Now line */}
        <div style={{
          position: 'absolute', top: 0, left: -4, right: 0,
          display: 'flex', alignItems: 'center', zIndex: 3, pointerEvents: 'none',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'oklch(0.65 0.22 25)',
            boxShadow: '0 0 0 3px color-mix(in oklch, oklch(0.65 0.22 25) 20%, transparent)',
          }} />
          <div style={{ flex: 1, height: 1.5, background: 'oklch(0.65 0.22 25)', opacity: 0.7 }} />
        </div>

        {/* Empty-slot click overlays */}
        {Array.from({ length: totalSlots }).map((_, i) => {
          const slotStart = slotOffset + i * slotSize;
          const slotEnd = slotStart + slotSize;
          const occupied = items.some(r => slotStart < r.startMin + r.durationMin && slotEnd > r.startMin);
          if (occupied) return null;
          return (
            <div
              key={`slot-${i}`}
              onClick={() => onSlotClick(slotStart)}
              style={{
                position: 'absolute',
                top: `${i * slotHeight}px`, left: 0, right: 0, height: `${slotHeight}px`,
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = slotHover)}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
              title={`Réserver à ${fmtTime(slotStart)}`}
            />
          );
        })}

        {/* Reservations */}
        {items.map(r => {
          const visStart = Math.max(0, r.startMin);
          const visEnd = Math.min(hours * 60, r.startMin + r.durationMin);
          const top = `${(visStart / 60) * pixelsPerHour}px`;
          const height = `${((visEnd - visStart) / 60) * pixelsPerHour}px`;
          const isMine = r.login === me.login;
          const isLive = r.startMin <= 0 && r.startMin + r.durationMin > 0;
          const matchesSearch = searchQuery && (
            r.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchQuery.toLowerCase())
          );
          const dimmed = searchQuery && !matchesSearch;

          return (
            <ReservationBlock
              key={r.id}
              r={r}
              top={top}
              height={height}
              hue={printer.hue}
              isMine={isMine}
              isLive={isLive}
              dark={dark}
              dimmed={dimmed}
              highlighted={matchesSearch}
              density={density}
              onCancel={isMine ? onItemCancel : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReservationBlock({ r, top, height, hue, isMine, isLive, dark, dimmed, highlighted, density, onCancel }) {
  const [hover, setHover] = React.useState(false);
  const compact = density === 'compact' || height < 36;

  const borderColor = isMine
    ? printerColor(hue, 0.5, 0.16)
    : `color-mix(in oklch, ${printerColor(hue)} 30%, transparent)`;
  const bg = isMine
    ? `color-mix(in oklch, ${printerColor(hue)} 18%, ${dark ? '#000' : '#fff'})`
    : dark
      ? `color-mix(in oklch, ${printerColor(hue)} 14%, rgba(0,0,0,0.7))`
      : printerColorSoft(hue);
  const textColor = isMine
    ? `oklch(0.32 0.14 ${hue})`
    : dark ? '#f5f5f7' : `oklch(0.35 0.10 ${hue})`;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute',
        top, left: 4, right: 4,
        height: `calc(max(${height}, 18px))`,
        background: bg,
        border: `0.5px solid ${highlighted ? 'oklch(0.6 0.2 50)' : borderColor}`,
        borderLeft: `3px solid ${printerColor(hue)}`,
        borderRadius: 8,
        padding: compact ? '2px 7px' : '5px 8px',
        fontSize: compact ? 10.5 : 11.5,
        color: textColor,
        overflow: 'hidden',
        cursor: 'default',
        zIndex: hover ? 5 : 2,
        opacity: dimmed ? 0.25 : 1,
        boxShadow: highlighted
          ? '0 0 0 2px color-mix(in oklch, oklch(0.6 0.2 50) 30%, transparent)'
          : hover ? '0 4px 14px rgba(0,0,0,0.10)' : 'none',
        transition: 'opacity 0.15s, box-shadow 0.15s, z-index 0s',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, alignItems: 'baseline' }}>
        <span style={{
          fontWeight: 600, letterSpacing: '0.005em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          minWidth: 0,
          fontSize: compact ? 9.5 : 10,
        }}>
          {r.firstName} {r.lastName}
        </span>
        {!compact && (
          <span style={{ fontSize: 9, opacity: 0.65, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {fmtDuration(r.durationMin)}
          </span>
        )}
      </div>
      {!compact && (
        <div style={{
          fontSize: 14, opacity: 0.85, fontVariantNumeric: 'tabular-nums', fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)}
          {isLive && <span style={{ marginLeft: 6, color: 'oklch(0.55 0.18 25)', fontWeight: 700 }}>● en cours</span>}
        </div>
      )}
      {isMine && hover && onCancel && (
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(r.id); }}
          style={{
            position: 'absolute', top: 4, right: 4,
            width: 20, height: 20, borderRadius: 5,
            border: 'none', background: 'rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: textColor,
          }}
          title="Annuler ma réservation"
        >
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}
