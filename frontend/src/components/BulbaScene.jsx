// Original "leaf creature" mascot + lush green mountain scenery, drawn inline as SVG.
// Bulbasaur-inspired mascot; the background is rolling green mountains and a meadow.
// Inline SVG = no external assets, crisp at any size, and theme-friendly.

// The creature drawing as a reusable <g> (origin ≈ body centre). idp keeps the
// gradient ids unique when more than one instance is on a page.
function Creature({ idp = 'b' }) {
  const body = `${idp}-body`;
  const bulb = `${idp}-bulb`;
  return (
    <g>
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fe3bd" />
          <stop offset="100%" stopColor="#57b98a" />
        </linearGradient>
        <radialGradient id={bulb} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#8fd6a2" />
          <stop offset="100%" stopColor="#2f8f5c" />
        </radialGradient>
      </defs>

      <ellipse cx="6" cy="152" rx="205" ry="26" fill="rgba(0,0,0,0.2)" />

      {[[-92, 30], [-30, 34], [36, 34], [96, 30]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="46" height="88" rx="23" fill="#4aa77c" stroke="#2c6b4e" strokeWidth="5" />
      ))}

      <ellipse cx="0" cy="0" rx="138" ry="102" fill={`url(#${body})`} stroke="#2c6b4e" strokeWidth="6" />
      <ellipse cx="-10" cy="34" rx="96" ry="58" fill="#c8f2d8" opacity="0.85" />
      {[[-74, -22, 22], [-30, -44, 18], [22, -30, 20], [70, -6, 17]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#2f8f6b" opacity="0.85" />
      ))}

      <circle cx="-152" cy="-34" r="82" fill={`url(#${body})`} stroke="#2c6b4e" strokeWidth="6" />
      <path d="M-206 -104 L-232 -176 L-166 -136 Z" fill="#57b98a" stroke="#2c6b4e" strokeWidth="6" strokeLinejoin="round" />
      <path d="M-120 -118 L-116 -190 L-72 -140 Z" fill="#57b98a" stroke="#2c6b4e" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="-186" cy="-42" r="20" fill="#fff" />
      <circle cx="-124" cy="-42" r="20" fill="#fff" />
      <circle cx="-182" cy="-40" r="11" fill="#b5533f" />
      <circle cx="-120" cy="-40" r="11" fill="#b5533f" />
      <circle cx="-180" cy="-42" r="5.5" fill="#241611" />
      <circle cx="-118" cy="-42" r="5.5" fill="#241611" />
      <circle cx="-187" cy="-47" r="3.4" fill="#fff" />
      <circle cx="-125" cy="-47" r="3.4" fill="#fff" />
      <path d="M-176 8 q24 22 48 0" fill="none" stroke="#2c6b4e" strokeWidth="6" strokeLinecap="round" />

      <ellipse cx="66" cy="-96" rx="104" ry="86" fill={`url(#${bulb})`} stroke="#256b45" strokeWidth="6" />
      {[[30, -120, 20], [78, -140, 22], [110, -96, 18], [58, -74, 16]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#256b45" opacity="0.75" />
      ))}
      <path d="M60 -178 q-42 -46 -86 -34 q6 50 60 56 Z" fill="#4aa77c" stroke="#256b45" strokeWidth="5" strokeLinejoin="round" />
      <path d="M72 -182 q40 -50 88 -40 q-4 52 -62 60 Z" fill="#63c98f" stroke="#256b45" strokeWidth="5" strokeLinejoin="round" />
      <path d="M66 -186 q-6 -58 30 -84 q30 34 8 84 Z" fill="#7bd6a1" stroke="#256b45" strokeWidth="5" strokeLinejoin="round" />
    </g>
  );
}

// A little pine tree.
function Tree({ x, y, s = 1, fill = '#1f7a52' }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <path d="M0 0 L-18 34 L-6 34 L-24 62 L24 62 L6 34 L18 34 Z" fill={fill} />
      <rect x="-3" y="60" width="6" height="10" rx="2" fill="#5b3d24" />
    </g>
  );
}

// A tiny two-leaf sprout (a baby Bulba) for the meadow.
function Sprout({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <path d="M0 0v-12" stroke="#2f8f5c" strokeWidth="3" strokeLinecap="round" />
      <path d="M0 -12c-2-7-7-10-13-11 0 8 5 11 13 11z" fill="#4aa77c" />
      <path d="M0 -11c2-6 6-9 12-10 0 7-5 10-12 10z" fill="#63c98f" />
    </g>
  );
}

// Shared scenery: sky, sun with rays, drifting clouds, birds, six misty green
// ridges, tree clusters, meadow and floating leaves. Animation hooks (classes)
// are styled in index.css and respect prefers-reduced-motion.
function Scenery({ idp = 's' }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${idp}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0c3746" />
          <stop offset="32%" stopColor="#135246" />
          <stop offset="62%" stopColor="#2f9a6a" />
          <stop offset="100%" stopColor="#a9e8c0" />
        </linearGradient>
        <linearGradient id={`${idp}-far1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dcf5e7" />
          <stop offset="100%" stopColor="#a2dcc0" />
        </linearGradient>
        <linearGradient id={`${idp}-far2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bce9ce" />
          <stop offset="100%" stopColor="#79c8a1" />
        </linearGradient>
        <linearGradient id={`${idp}-mid1`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd2a3" />
          <stop offset="100%" stopColor="#3ba877" />
        </linearGradient>
        <linearGradient id={`${idp}-mid2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#54bb88" />
          <stop offset="100%" stopColor="#27875d" />
        </linearGradient>
        <linearGradient id={`${idp}-near`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#37a06d" />
          <stop offset="100%" stopColor="#176b48" />
        </linearGradient>
        <linearGradient id={`${idp}-ground`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c7a52" />
          <stop offset="100%" stopColor="#0f4a32" />
        </linearGradient>
        <radialGradient id={`${idp}-sun`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6cf" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#fbe08a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky + horizon warmth */}
      <rect width="1200" height="600" fill={`url(#${idp}-sky)`} />
      <ellipse cx="600" cy="330" rx="720" ry="150" fill="#ffe9a8" opacity="0.12" />

      {/* sun with slow-pulsing rays */}
      <g className="sc-sun" style={{ transformOrigin: '930px 132px' }}>
        <circle cx="930" cy="132" r="230" fill={`url(#${idp}-sun)`} />
        <g className="sc-rays" style={{ transformOrigin: '930px 132px' }} opacity="0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x="927" y="-40" width="6" height="120" rx="3" fill="#fef3c7" transform={`rotate(${i * 30} 930 132)`} />
          ))}
        </g>
        <circle cx="930" cy="132" r="56" fill="#fefae6" opacity="0.96" />
      </g>

      {/* drifting clouds */}
      <g fill="#ffffff" className="sc-cloud sc-cloud-1" opacity="0.16">
        <ellipse cx="240" cy="120" rx="110" ry="34" />
        <ellipse cx="310" cy="106" rx="70" ry="30" />
        <ellipse cx="180" cy="132" rx="64" ry="26" />
      </g>
      <g fill="#ffffff" className="sc-cloud sc-cloud-2" opacity="0.13">
        <ellipse cx="720" cy="86" rx="130" ry="34" />
        <ellipse cx="800" cy="72" rx="80" ry="30" />
        <ellipse cx="640" cy="96" rx="70" ry="26" />
      </g>
      <g fill="#ffffff" className="sc-cloud sc-cloud-3" opacity="0.1">
        <ellipse cx="1040" cy="200" rx="120" ry="30" />
        <ellipse cx="1110" cy="186" rx="70" ry="26" />
      </g>

      {/* birds */}
      <g className="sc-birds" stroke="#0b3d2b" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M520 150 q9 -9 18 0 q9 -9 18 0" />
        <path d="M584 176 q7 -7 14 0 q7 -7 14 0" />
        <path d="M470 190 q6 -6 12 0 q6 -6 12 0" />
      </g>

      {/* ridge 1 — farthest, misty */}
      <path d="M0 306 C150 186 260 262 400 212 C540 162 640 252 780 206 C920 160 1050 252 1200 202 V600 H0 Z" fill={`url(#${idp}-far1)`} opacity="0.9" />
      <g fill="#ffffff" opacity="0.6">
        <path d="M338 224 l46 -60 l46 60 q-46 20 -92 0 Z" />
        <path d="M716 218 l50 -66 l50 66 q-50 22 -100 0 Z" />
      </g>

      {/* mist band 1 */}
      <rect x="0" y="300" width="1200" height="40" fill="#ffffff" opacity="0.15" />
      <ellipse className="sc-mist sc-mist-1" cx="320" cy="314" rx="280" ry="20" fill="#ffffff" opacity="0.16" />
      <ellipse className="sc-mist sc-mist-2" cx="900" cy="320" rx="320" ry="22" fill="#ffffff" opacity="0.14" />

      {/* ridge 2 */}
      <path d="M0 372 C140 262 280 336 420 288 C560 240 680 326 820 282 C960 238 1080 326 1200 282 V600 H0 Z" fill={`url(#${idp}-far2)`} opacity="0.95" />

      {/* ridge 3 — mid far */}
      <path d="M0 432 C160 336 300 404 460 362 C620 320 760 406 920 366 C1060 332 1140 404 1200 374 V600 H0 Z" fill={`url(#${idp}-mid1)`} />

      {/* mist band 2 */}
      <ellipse className="sc-mist sc-mist-3" cx="520" cy="440" rx="360" ry="24" fill="#ffffff" opacity="0.12" />
      <ellipse className="sc-mist sc-mist-1" cx="1050" cy="446" rx="280" ry="20" fill="#ffffff" opacity="0.11" />

      {/* ridge 4 — mid near, carries trees */}
      <path d="M0 500 C180 412 360 476 540 442 C720 408 900 478 1080 448 C1140 440 1176 458 1200 452 V600 H0 Z" fill={`url(#${idp}-mid2)`} />

      {/* tree clusters along the mid-near ridge */}
      <g>
        <Tree x={120} y={488} s={1.05} fill="#1c7a52" />
        <Tree x={168} y={500} s={0.78} fill="#23835a" />
        <Tree x={66} y={504} s={0.85} fill="#1f7a52" />
        <Tree x={470} y={466} s={0.9} fill="#1c7a52" />
        <Tree x={516} y={478} s={0.7} fill="#23835a" />
        <Tree x={962} y={464} s={1.1} fill="#1c7a52" />
        <Tree x={1018} y={478} s={0.8} fill="#23835a" />
        <Tree x={880} y={484} s={0.68} fill="#23835a" />
        <Tree x={1120} y={470} s={0.95} fill="#1f7a52" />
      </g>

      {/* ridge 5 — near */}
      <path d="M0 548 C220 500 420 548 620 526 C820 504 1020 552 1200 534 V600 H0 Z" fill={`url(#${idp}-near)`} />

      {/* foreground meadow */}
      <path d="M0 572 C300 540 600 566 900 550 C1020 544 1120 556 1200 552 V600 H0 Z" fill={`url(#${idp}-ground)`} />

      {/* bushes */}
      <g fill="#1c7a52">
        <ellipse cx="200" cy="576" rx="150" ry="44" />
        <ellipse cx="1010" cy="580" rx="170" ry="46" />
      </g>
      <g fill="#37a06d">
        <ellipse cx="180" cy="566" rx="86" ry="30" />
        <ellipse cx="1030" cy="570" rx="104" ry="32" />
      </g>

      {/* rocks */}
      <g fill="#3aa877" opacity="0.9">
        <path d="M330 588 q18 -22 40 -14 t34 14 z" />
        <path d="M760 590 q16 -20 36 -12 t30 12 z" />
      </g>

      {/* grass tufts */}
      <g stroke="#4fc98d" strokeWidth="4" strokeLinecap="round" opacity="0.9" fill="none">
        <path d="M360 594 q6 -22 0 -34" />
        <path d="M384 596 q10 -20 20 -30" />
        <path d="M820 592 q-6 -22 0 -34" />
        <path d="M844 594 q-10 -20 -20 -30" />
        <path d="M560 596 q6 -20 0 -30" />
      </g>

      {/* baby sprouts */}
      <Sprout x={430} y={592} s={1.1} />
      <Sprout x={700} y={594} s={0.9} />
      <Sprout x={900} y={592} s={1} />

      {/* floating leaves */}
      <g fill="#7bd6a1">
        <path className="sc-leaf sc-leaf-1" d="M180 150 q40 -30 76 -6 q-30 40 -76 6 Z" />
        <path className="sc-leaf sc-leaf-2" d="M1040 190 q44 -26 80 0 q-34 38 -80 0 Z" />
        <path className="sc-leaf sc-leaf-3" d="M600 120 q34 -26 66 -4 q-26 34 -66 4 Z" />
        <path className="sc-leaf sc-leaf-1" d="M420 210 q28 -22 56 -4 q-24 30 -56 4 Z" />
        <path className="sc-leaf sc-leaf-2" d="M300 260 q26 -20 52 -4 q-22 28 -52 4 Z" />
      </g>
    </g>
  );
}

export function BulbaMascot({ size = 160, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="-260 -230 520 420"
      role="img"
      aria-label="Bulba, the leafy timetable mascot"
    >
      <Creature idp="m" />
    </svg>
  );
}

export default function BulbaScene({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Lush green mountains with Bulba the leaf creature"
    >
      <Scenery idp="sc" />
      <g transform="translate(600, 430) scale(0.9)">
        <Creature idp="sc" />
      </g>
    </svg>
  );
}

// Mountain-only scenery for an app-wide background layer (no mascot).
export function BulbaMountains({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-label="Green mountains"
    >
      <Scenery idp="bg" />
    </svg>
  );
}
