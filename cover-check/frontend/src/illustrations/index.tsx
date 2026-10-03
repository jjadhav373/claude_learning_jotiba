/**
 * Cover Check illustrations — original, flat, two-tone (mint-600 / mint-300) with ink outlines on a
 * mint-50 blob. Objects, not people. The hexagon (turtle-shell) motif marks the Cover Check shield.
 * Colours come from CSS variables so a token change recolours every illustration.
 */
import type { ReactElement } from 'react';

const ink = 'var(--ink-900)', m6 = 'var(--mint-600)', m3 = 'var(--mint-300)', m1 = 'var(--mint-100)', m0 = 'var(--mint-50)', w = '#fff';
const amber = 'var(--amber-100)', ocean = 'var(--ocean-100)';
const sw = { stroke: ink, strokeWidth: 2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

/** Hex pattern used inside shields. */
const Hexes = ({ x, y, s = 7 }: { x: number; y: number; s?: number }) => {
  const hex = (cx: number, cy: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    return <polygon key={`${cx}-${cy}`} points={pts} fill="none" stroke={w} strokeOpacity=".55" strokeWidth="1.5" />;
  };
  const dx = s * Math.sqrt(3), dy = s * 1.5;
  const out: ReactElement[] = [];
  for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) out.push(hex(x + c * dx + (r % 2 ? dx / 2 : 0), y + r * dy));
  return <g>{out}</g>;
};

/** The Cover Check emblem: a rounded shield with the shell pattern and a tick. */
export const Emblem = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2.5l11 4v8.3C27 21.9 22.4 27.4 16 29.5 9.6 27.4 5 21.9 5 14.8V6.5z" fill={m6} />
    <path d="M16 2.5l11 4v8.3C27 21.9 22.4 27.4 16 29.5z" fill="var(--mint-700)" />
    <path d="M10.8 15.6l3.6 3.6 7-7.4" fill="none" stroke={w} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HeroArt = () => (
  <svg viewBox="0 0 340 200" width="100%" role="img" aria-label="A shield next to a policy summary on a phone">
    <path d="M44 120c-18-46 18-96 78-104 52-7 74 18 118 10 46-8 86 22 86 70 0 52-40 92-110 96-60 4-152-10-172-72z" fill={m1} />
    {[[40, 40], [300, 34], [312, 150], [70, 176]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 2 ? 4 : 3} fill={m3} />)}
    {/* phone */}
    <rect x="168" y="30" width="104" height="160" rx="18" fill={w} {...sw} />
    <rect x="200" y="40" width="40" height="6" rx="3" fill={m1} />
    <rect x="182" y="60" width="76" height="10" rx="5" fill={m3} />
    {[84, 104, 124].map((y, i) => (
      <g key={y}>
        <circle cx="189" cy={y + 4} r="6" fill={i === 2 ? amber : m1} stroke={ink} strokeWidth="1.5" />
        {i < 2 && <path d={`M186 ${y + 4}l2 2 4-4`} fill="none" stroke="var(--mint-700)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
        <rect x="200" y={y} width={i === 1 ? 44 : 58} height="8" rx="4" fill="var(--line)" />
      </g>
    ))}
    <rect x="182" y="150" width="76" height="24" rx="12" fill="var(--mint-700)" />
    {/* shield */}
    <g transform="translate(70 46)">
      <path d="M60 4l50 18v38c0 34-21 60-50 72C31 120 10 94 10 60V22z" fill={m6} {...sw} />
      <clipPath id="hc"><path d="M60 4l50 18v38c0 34-21 60-50 72C31 120 10 94 10 60V22z" /></clipPath>
      <g clipPath="url(#hc)"><Hexes x={60} y={58} s={14} /></g>
      <path d="M38 64l15 15 30-32" fill="none" stroke={w} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <path d="M150 34l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={m3} stroke={ink} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const ReadoutArt = ({ size = 72 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="38" fill={m1} />
    <rect x="18" y="14" width="36" height="46" rx="6" fill={w} {...sw} />
    <path d="M26 26h20M26 34h20M26 42h12" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
    <circle cx="50" cy="48" r="12" fill={m3} fillOpacity=".55" {...sw} />
    <path d="M59 57l8 8" {...sw} strokeWidth="4" />
    <path d="M45 48l3.5 3.5 6-6.5" fill="none" stroke="var(--mint-800)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SummaryArt = ({ size = 76 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="38" fill={m1} />
    <path d="M14 22a8 8 0 018-8h30a8 8 0 018 8v18a8 8 0 01-8 8H30l-10 8v-8.5A8 8 0 0114 40z" fill={w} {...sw} />
    <path d="M24 26h26M24 33h18" stroke={m3} strokeWidth="3.5" strokeLinecap="round" />
    <circle cx="58" cy="54" r="12" fill="var(--mint-700)" stroke={ink} strokeWidth="2" />
    <path d="M52.5 54l3.8 3.8 7-7.4" fill="none" stroke={w} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DoneArt = () => (
  <svg viewBox="0 0 200 130" width="200" height="130" aria-hidden="true">
    <ellipse cx="100" cy="70" rx="86" ry="56" fill={m1} />
    {[[30, 30, m3], [168, 28, ocean], [176, 96, m3], [24, 100, amber], [150, 116, m3]].map(([x, y, f], i) => (
      <rect key={i} x={x as number} y={y as number} width="8" height="8" rx="2" fill={f as string} transform={`rotate(${i * 25} ${x} ${y})`} />
    ))}
    <g transform="translate(58 12)">
      <path d="M42 4l36 13v27c0 25-15 43-36 51C21 87 6 69 6 44V17z" fill={m6} {...sw} />
      <clipPath id="dc"><path d="M42 4l36 13v27c0 25-15 43-36 51C21 87 6 69 6 44V17z" /></clipPath>
      <g clipPath="url(#dc)"><Hexes x={42} y={46} s={11} /></g>
      <path d="M26 47l11 11 22-23" fill="none" stroke={w} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

export const LockedDocArt = ({ size = 88 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden="true">
    <circle cx="44" cy="44" r="42" fill={m1} />
    <path d="M22 14h30l14 14v44a4 4 0 01-4 4H22a4 4 0 01-4-4V18a4 4 0 014-4z" fill={w} {...sw} />
    <path d="M52 14v14h14" fill={m0} {...sw} />
    <path d="M27 36h22M27 44h28M27 52h16" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
    <rect x="48" y="52" width="26" height="22" rx="5" fill={m6} {...sw} />
    <path d="M53 52v-5a8 8 0 0116 0v5" fill="none" {...sw} />
    <circle cx="61" cy="62" r="2.6" fill={w} />
  </svg>
);

export const ReadingArt = () => (
  <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
    <circle cx="60" cy="60" r="56" fill={m1} />
    <path d="M36 20h36l16 16v60a5 5 0 01-5 5H36a5 5 0 01-5-5V25a5 5 0 015-5z" fill={w} {...sw} />
    <path d="M72 20v16h16" fill={m0} {...sw} />
    {[46, 56, 66, 76, 86].map((y, i) => <rect key={y} x="40" y={y} width={[38, 30, 40, 24, 34][i]} height="4" rx="2" fill="var(--line)" />)}
    <g className="scan">
      <rect x="31" y="40" width="57" height="10" fill={m3} fillOpacity=".45">
        <animate attributeName="y" values="38;86;38" dur="2.4s" repeatCount="indefinite" />
      </rect>
    </g>
  </svg>
);

export const BlurryArt = () => (
  <svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
    <circle cx="44" cy="44" r="42" fill={amber} />
    <rect x="22" y="16" width="44" height="56" rx="5" fill={w} {...sw} />
    {[30, 38, 46, 54].map((y) => <rect key={y} x="28" y={y} width="32" height="4" rx="2" fill="var(--line-strong)" opacity=".5" />)}
    <circle cx="60" cy="62" r="11" fill={w} {...sw} />
    <path d="M60 56v7M60 67v.1" stroke="var(--amber-700)" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export const AdvisorArt = ({ size = 56 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill={ocean} />
    <circle cx="32" cy="27" r="9" fill={w} {...sw} />
    <path d="M17 50c2-8 8-12 15-12s13 4 15 12" fill={w} {...sw} />
    <path d="M21 28a11 11 0 0122 0" fill="none" {...sw} />
    <rect x="18" y="26" width="5" height="8" rx="2" fill="var(--ocean-700)" />
    <rect x="41" y="26" width="5" height="8" rx="2" fill="var(--ocean-700)" />
  </svg>
);
