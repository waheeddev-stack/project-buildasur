// Hand-rolled inline SVG icon set — no icon dependency, crisp at any size, and it
// inherits `currentColor` so icons theme themselves. Stroke style = 2px round.

function Svg({ children, size = 20, className = '', ...rest }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Svg>
);

export const IconSliders = (p) => (
  <Svg {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="16" cy="18" r="2" />
  </Svg>
);

export const IconSparkles = (p) => (
  <Svg {...p}>
    <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
    <path d="M5 15l.6 1.6L7.2 17l-1.6.6L5 19l-.6-1.6L2.8 17l1.6-.4z" />
  </Svg>
);

export const IconCalendar = (p) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="3" />
    <path d="M3 9.5h18M8 3v3M16 3v3" />
    <path d="M7.5 13h3M13.5 13h3M7.5 16.5h3" />
  </Svg>
);

export const IconClock = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const IconSearch = (p) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);

export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const IconClose = (p) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconSun = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </Svg>
);

export const IconMoon = (p) => (
  <Svg {...p}>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Svg>
);

export const IconLogout = (p) => (
  <Svg {...p}>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="M16 8l4 4-4 4M10 12h10" />
  </Svg>
);

export const IconUser = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
);

export const IconLock = (p) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <path d="M12 14.5v2.5" />
  </Svg>
);

export const IconSend = (p) => (
  <Svg {...p}>
    <path d="M4 12l16-8-6 16-3.2-6.8z" />
    <path d="M10.8 13.2 20 4" />
  </Svg>
);

export const IconRefresh = (p) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-1.6 6.2" />
    <path d="M20 5v6h-6" />
  </Svg>
);

export const IconArrowRight = (p) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconCheck = (p) => (
  <Svg {...p}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </Svg>
);

export const IconWarning = (p) => (
  <Svg {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 9.5v5M12 17.5v.5" />
  </Svg>
);

export const IconCamera = (p) => (
  <Svg {...p}>
    <path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </Svg>
);

export const IconLink = (p) => (
  <Svg {...p}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M11 6.5 12.8 4.7a4 4 0 0 1 5.7 5.7l-1.8 1.8" />
    <path d="M13 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" />
  </Svg>
);

export const IconPlug = (p) => (
  <Svg {...p}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6.5 8h11v3a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 6.5 11z" />
    <path d="M12 16.5V21" />
  </Svg>
);

export const IconInbox = (p) => (
  <Svg {...p}>
    <path d="M3 13.5 6 5h12l3 8.5" />
    <path d="M3 13.5V19h18v-5.5" />
    <path d="M3 13.5h5l1 2.5h6l1-2.5h5" />
  </Svg>
);

export const IconLeaf = (p) => (
  <Svg {...p}>
    <path d="M5 19c0-8 5.5-13 15-13 0 9-4.5 14-11 14-1.6 0-4-.5-4-1z" />
    <path d="M5 19c2.5-4 6-7 11-9" />
  </Svg>
);

export const IconBolt = (p) => (
  <Svg {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
  </Svg>
);

// A proper red-and-white Poké Ball (fixed colours so it always reads as one).
export function IconPokeball({ size = 20, className = '' }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 3c-4.6 0-8.4 3.4-8.9 7.8h5.4a3.6 3.6 0 0 1 7 0h5.4C20.4 6.4 16.6 3 12 3z" fill="#ee1515" />
      <path d="M3.1 11.2c.5 4.4 4.3 7.8 8.9 7.8s8.4-3.4 8.9-7.8z" fill="#f8fafc" />
      <rect x="2.4" y="10.8" width="19.2" height="1.7" rx="0.6" fill="#0f172a" />
      <circle cx="12" cy="11.65" r="3.5" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.6" />
      <circle cx="12" cy="11.65" r="1.4" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.1" />
    </svg>
  );
}

// The Bulba mark — a sprouting seed on a green gradient tile. Used in the nav,
// the login card and (as an SVG file) as the favicon.
export function BulbaMark({ size = 32, className = '', id = 'bulbaMark' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="SlotSync logo"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="55%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="15" fill={`url(#${id})`} />
      <rect x="1" y="1" width="46" height="46" rx="15" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      <path d="M24 36c0-6.5 0-9.5 0-13" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M24 24c-1-5.5-4.6-8.6-10.4-9.6.2 6.2 3.4 9.6 10.4 9.6z" fill="#ffffff" />
      <path d="M24 23.4c1-5 4.2-7.8 9.6-8.7-.2 5.6-3.1 8.7-9.6 8.7z" fill="#ffffff" opacity="0.85" />
      <circle cx="24" cy="37.5" r="3.4" fill="#0b3d2b" opacity="0.25" />
    </svg>
  );
}

// Mark + Gen-Z wordmark. Renders the "Sync" half with an animated gradient.
export function BulbaLogo({ size = 30, className = '' }) {
  return (
    <span className={`brand ${className}`.trim()}>
      <BulbaMark size={size} id="bulbaNavMark" />
      <span className="brand-word">
        Slot<span className="brand-grad">Sync</span>
      </span>
    </span>
  );
}
