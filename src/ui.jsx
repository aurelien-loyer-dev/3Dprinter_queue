// ui.jsx — small primitives (icons, avatar, status pill, buttons)
import React from 'react';

export function Icon({ name, size = 16, color = 'currentColor', stroke = 1.6, style }) {
  const s = { width: size, height: size, display: 'inline-block', flexShrink: 0, ...style };
  const common = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'search':
      return (<svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7" {...common} /><path d="m20 20-3.5-3.5" {...common} /></svg>);
    case 'bell':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" {...common} /><path d="M10 20a2 2 0 0 0 4 0" {...common} /></svg>);
    case 'plus':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14" {...common} /></svg>);
    case 'close':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M18 6 6 18" {...common} /></svg>);
    case 'chevron-right':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m9 6 6 6-6 6" {...common} /></svg>);
    case 'chevron-left':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m15 6-6 6 6 6" {...common} /></svg>);
    case 'chevron-down':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m6 9 6 6 6-6" {...common} /></svg>);
    case 'arrow-right':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M5 12h14M13 6l6 6-6 6" {...common} /></svg>);
    case 'clock':
      return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="9" {...common} /><path d="M12 7v5l3 2" {...common} /></svg>);
    case 'check':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m5 12 5 5L20 7" {...common} /></svg>);
    case 'trash':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" {...common} /></svg>);
    case 'wrench':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-2-2-3.5 1L7 16.5 8 13 6 11l8-8 .7 3.3Z" {...common} /></svg>);
    case 'flame':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-2.5C9 9 8 7 8 5c1.5 1 2.5 2 4-2Z" {...common} /></svg>);
    case 'thermometer':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M14 14V5a2 2 0 1 0-4 0v9a4 4 0 1 0 4 0Z" {...common} /></svg>);
    case 'user':
      return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="8" r="4" {...common} /><path d="M4 21a8 8 0 0 1 16 0" {...common} /></svg>);
    case 'logout':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H10" {...common} /></svg>);
    case 'history':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" {...common} /></svg>);
    case 'list':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...common} /></svg>);
    case 'grid':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" {...common} /></svg>);
    case 'printer':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M7 9V4h10v5M5 9h14a2 2 0 0 1 2 2v5h-4v4H7v-4H3v-5a2 2 0 0 1 2-2Z" {...common} /></svg>);
    case 'sparkle':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M18 6l-4 4M10 14l-4 4" {...common} /></svg>);
    default:
      return null;
  }
}

export function Avatar({ first, last, size = 28, hue }) {
  const init = (first[0] || '') + (last[0] || '');
  const h = hue ?? ((first.charCodeAt(0) * 31 + last.charCodeAt(0) * 17) % 360);
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `oklch(0.94 0.03 ${h})`,
        color: `oklch(0.4 0.1 ${h})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 600, letterSpacing: '0.02em',
        flexShrink: 0,
        border: `0.5px solid oklch(0.85 0.05 ${h})`,
      }}
    >
      {init.toUpperCase()}
    </div>
  );
}

export function StatusDot({ state, size = 8, pulse = true }) {
  const color =
    state === 'printing'         ? 'oklch(0.72 0.16 50)'  :
    state === 'soon_available'   ? 'oklch(0.72 0.16 200)' :
    state === 'soon_unavailable' ? 'oklch(0.78 0.16 80)'  :
    state === 'available'        ? 'oklch(0.72 0.16 145)' :
    'oklch(0.7 0 0)';
  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        width: size, height: size, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 0 2px color-mix(in oklch, ${color} 25%, transparent)`,
      }}
    >
      {pulse && (state === 'printing' || state === 'soon_available') && (
        <span
          style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            background: color, opacity: 0.3,
            animation: 'qp-pulse 2s ease-out infinite',
          }}
        />
      )}
    </span>
  );
}

export function StatePill({ state, compact = false }) {
  const map = {
    printing:         { label: 'En impression',        color: 'oklch(0.55 0.15 50)',  bg: 'oklch(0.97 0.04 60)'  },
    soon_available:   { label: 'Bientôt disponible',   color: 'oklch(0.4 0.14 200)',  bg: 'oklch(0.96 0.03 210)' },
    soon_unavailable: { label: 'Bientôt indisponible', color: 'oklch(0.5 0.14 80)',   bg: 'oklch(0.97 0.04 85)'  },
    available:        { label: 'Disponible',           color: 'oklch(0.4 0.13 145)',  bg: 'oklch(0.96 0.04 145)' },
  };
  const s = map[state] || map.available;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '2px 7px' : '3px 9px',
      borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: compact ? 10.5 : 11.5, fontWeight: 500,
      letterSpacing: '0.005em',
      whiteSpace: 'nowrap',
    }}>
      <StatusDot state={state} size={6} pulse={false} />
      {s.label}
    </span>
  );
}

export function Btn({ variant = 'primary', size = 'md', children, icon, iconRight, onClick, disabled, style, full }) {
  const sizes = {
    sm: { h: 28, px: 10, fs: 12.5, gap: 6, r: 8 },
    md: { h: 36, px: 14, fs: 13.5, gap: 7, r: 10 },
    lg: { h: 44, px: 18, fs: 15,   gap: 8, r: 12 },
  }[size];
  const variants = {
    primary:   { bg: '#1d1d1f', color: '#fff',                      border: '0.5px solid #1d1d1f' },
    secondary: { bg: 'rgba(0,0,0,0.04)', color: '#1d1d1f',          border: '0.5px solid rgba(0,0,0,0.08)' },
    ghost:     { bg: 'transparent', color: '#1d1d1f',               border: '0.5px solid transparent' },
    danger:    { bg: 'oklch(0.96 0.04 25)', color: 'oklch(0.5 0.18 25)', border: '0.5px solid oklch(0.88 0.06 25)' },
  };
  const v = variants[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        height: sizes.h, padding: `0 ${sizes.px}px`, gap: sizes.gap,
        borderRadius: sizes.r,
        background: v.bg, color: v.color, border: v.border,
        fontSize: sizes.fs, fontWeight: 500, letterSpacing: '0.005em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: full ? '100%' : 'auto',
        transition: 'transform 0.08s ease, opacity 0.15s ease, background 0.15s ease',
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
      onMouseDown={e => !disabled && (e.currentTarget.style.transform = 'scale(0.97)')}
      onMouseUp={e => (e.currentTarget.style.transform = '')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}
    >
      {icon && <Icon name={icon} size={sizes.fs + 1} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.fs + 1} />}
    </button>
  );
}

export function GlobalAnims() {
  return (
    <style>{`
      @keyframes qp-pulse {
        0% { transform: scale(0.8); opacity: 0.5; }
        100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes qp-fadein {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes qp-overlay-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes qp-modal-in {
        from { opacity: 0; transform: translateY(20px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes qp-toast-in {
        from { opacity: 0; transform: translateX(20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes qp-shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `}</style>
  );
}
