// PrinterCard.jsx — single printer column in the dashboard
import React from 'react';
import {
  loadPct, findNextAvailable,
  getNextSlotOffset,
  printerColor, printerColorSoft,
  fmtTime, fmtDuration, fmtRelativeFuture,
} from './data.js';
import { Icon, Btn, StatePill } from './ui.jsx';

export function PrinterCard({ printer, status, reservations, allReservations, me, onSlotClick, onReserve, onCancel, slotSize, density, dark, searchQuery, hourSpan = 24 }) {
  const HOURS = hourSpan;
  const PIXELS_PER_HOUR = density === 'compact' ? 36 : density === 'comfy' ? 64 : 48;
  const TIMELINE_HEIGHT = HOURS * PIXELS_PER_HOUR;
  const slotOffset = getNextSlotOffset(slotSize);

  const items = reservations
    .filter(r => r.printerId === printer.id)
    .filter(r => r.startMin + r.durationMin > 0 && r.startMin < HOURS * 60)
    .sort((a, b) => a.startMin - b.startMin);

  const load = loadPct(allReservations, printer.id);
  const nextStart = findNextAvailable(allReservations, printer.id, slotSize, slotSize, slotOffset, slotOffset);

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
          <StatePill state={status.state} compact />
        </div>
        <div style={{ fontSize: 11.5, color: subText, marginBottom: 10 }}>
          {printer.model}
        </div>

        {(status.state === 'printing' || status.state === 'soon_available') && (
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
        {status.state === 'available' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.13 145)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="check" size={12} />
            Prête à imprimer
          </div>
        )}
        {status.state === 'soon_unavailable' && (
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.14 80)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon name="clock" size={12} />
            Impression {fmtRelativeFuture(status.nextStartMin)}
          </div>
        )}

        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: subText }}>
          <span>Charge 24h</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 50, height: 3, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ width: `${load * 100}%`, height: '100%', background: printerColor(printer.hue, 0.65, 0.1), borderRadius: 999 }} />
            </div>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: fgText, fontWeight: 500, minWidth: 28, textAlign: 'right' }}>{Math.round(load * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Reserve CTA */}
      <div style={{ padding: density === 'compact' ? '10px 14px' : '12px 18px', borderBottom: `0.5px solid ${border}` }}>
        <Btn variant="primary" size="sm" full icon="plus" onClick={() => onReserve(printer.id)}>
          Réserver — prochain {fmtTime(nextStart)}
        </Btn>
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
          onSlotClick={(min) => onSlotClick && onSlotClick(printer.id, min)}
          onItemCancel={onCancel}
        />
      </div>
    </div>
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
              {fmtTime(min)}
            </div>
          );
        })}
      </div>

      {/* Lanes */}
      <div style={{ flex: 1, position: 'relative', height: TIMELINE_HEIGHT, marginRight: 12 }}>
        {/* Hour grid lines */}
        {Array.from({ length: hours + 1 }).map((_, i) => (
          <div key={`h-${i}`} style={{
            position: 'absolute', top: i * pixelsPerHour, left: 0, right: 0,
            height: 0.5, background: hourLine,
          }} />
        ))}
        {/* Slot dividers */}
        {Array.from({ length: totalSlots }).map((_, i) => i % slotsPerHour === 0 ? null : (
          <div key={`s-${i}`} style={{
            position: 'absolute', top: i * slotHeight, left: 0, right: 0,
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
                top: i * slotHeight, left: 0, right: 0, height: slotHeight,
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
          const top = (visStart / 60) * pixelsPerHour;
          const height = ((visEnd - visStart) / 60) * pixelsPerHour;
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
        height: Math.max(height, 18),
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
        }}>
          {r.firstName} {r.lastName}
        </span>
        {!compact && (
          <span style={{ fontSize: 10, opacity: 0.65, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {fmtDuration(r.durationMin)}
          </span>
        )}
      </div>
      {!compact && (
        <div style={{
          fontSize: 10, opacity: 0.7, fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {fmtTime(r.startMin)}–{fmtTime(r.startMin + r.durationMin)}
          {isLive && <span style={{ marginLeft: 6, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>● en cours</span>}
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
