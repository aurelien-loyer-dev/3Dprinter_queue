// data.js — données statiques + helpers métier
// Toute la logique DB est dans supabase.js.

export const PRINTERS = [
  { id: 'abdillah', name: 'ABDILLAH', model: 'Bambu Lab P1S',     hue: 14,  size: 'large' },
  { id: 'sergi',    name: 'SERGI',    model: 'Bambu Lab A1 Mini', hue: 210, size: 'mini'  },
  { id: 'desyre',   name: 'DÉSYRÉ',   model: 'Bambu Lab A1 Mini', hue: 145, size: 'mini'  },
  { id: 'sandati',  name: 'SANDATI',  model: 'Bambu Lab A1 Mini', hue: 280, size: 'mini'  },
  { id: 'noah',     name: 'NOAH',     model: 'Bambu Lab A1 Mini', hue: 38,  size: 'mini'  },
];

export const MS_PER_MIN = 60_000;
export const NOW_FIXED = new Date();

// ── Status computation ─────────────────────────────────────────────────────
// States: 'printing' | 'soon_available' | 'soon_unavailable' | 'available'

const SOON_MIN = 30;

export function computePrinterStatus(reservations, printerId) {
  const currentJob = reservations.find(r =>
    r.printerId === printerId &&
    r.startMin <= 0 &&
    r.startMin + r.durationMin > 0
  );

  if (currentJob) {
    const etaMin = currentJob.startMin + currentJob.durationMin;
    const progress = Math.min(1, (-currentJob.startMin) / currentJob.durationMin);
    return {
      state: etaMin <= SOON_MIN ? 'soon_available' : 'printing',
      etaMin,
      progress,
    };
  }

  const nextJob = reservations
    .filter(r => r.printerId === printerId && r.startMin > 0)
    .sort((a, b) => a.startMin - b.startMin)[0];

  if (nextJob && nextJob.startMin <= SOON_MIN) {
    return { state: 'soon_unavailable', nextStartMin: nextJob.startMin };
  }

  return { state: 'available' };
}

// ── Time helpers ───────────────────────────────────────────────────────────

export function minToDate(min) {
  return new Date(NOW_FIXED.getTime() + min * MS_PER_MIN);
}

export function fmtTime(min) {
  const d = minToDate(min);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`;
  if (h) return `${h}h`;
  return `${m}min`;
}

export function fmtDayLabel(min) {
  const d = minToDate(min);
  const today = NOW_FIXED;
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return "aujourd'hui";
  if (d.toDateString() === tomorrow.toDateString())  return 'demain';
  if (d.toDateString() === yesterday.toDateString()) return 'hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtRelativeFuture(min) {
  if (min < 1)  return 'maintenant';
  if (min < 60) return `dans ${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `dans ${h}h`;
  return `dans ${h}h${String(m).padStart(2, '0')}`;
}

// ── Printer helpers ────────────────────────────────────────────────────────

export function printerColor(hue, l = 0.55, c = 0.13) {
  return `oklch(${l} ${c} ${hue})`;
}

export function printerColorSoft(hue) {
  return `oklch(0.95 0.04 ${hue})`;
}

export function printerById(id) {
  return PRINTERS.find(p => p.id === id);
}

export function findNextAvailable(reservations, printerId, durationMin, slotSize = 30, fromMin = 0) {
  const sorted = reservations
    .filter(r => r.printerId === printerId && r.startMin + r.durationMin > fromMin)
    .sort((a, b) => a.startMin - b.startMin);
  let cursor = Math.max(fromMin, 0);
  cursor = Math.ceil(cursor / slotSize) * slotSize;
  for (const r of sorted) {
    if (cursor + durationMin <= r.startMin) return cursor;
    cursor = Math.max(cursor, Math.ceil((r.startMin + r.durationMin) / slotSize) * slotSize);
  }
  return cursor;
}

export function loadPct(reservations, printerId) {
  const horizon = 24 * 60;
  const items = reservations.filter(r =>
    r.printerId === printerId &&
    r.startMin + r.durationMin > 0 &&
    r.startMin < horizon
  );
  const booked = items.reduce((sum, r) => {
    const start = Math.max(0, r.startMin);
    const end   = Math.min(horizon, r.startMin + r.durationMin);
    return sum + Math.max(0, end - start);
  }, 0);
  return Math.min(1, booked / horizon);
}
