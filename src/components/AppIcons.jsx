// App-style module icons: a rounded gradient square with a simple white glyph.
// One shared look for every tile on the portal.

const TONES = {
  work: ['#f97316', '#f59e0b'], // orange → amber
  machtrek: ['#059669', '#14b8a6'], // emerald → teal
  settings: ['#334155', '#64748b'], // slate
  machines: ['#0284c7', '#22d3ee'], // sky → cyan
  suppliers: ['#7c3aed', '#a855f7'], // violet → purple
  users: ['#e11d48', '#fb7185'] // rose
}

function Tile({ tone, children, className = '', label }) {
  const [a, b] = TONES[tone]
  const id = `appicon-${tone}`
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <rect x="0.5" y="0.5" width="63" height="63" rx="15.5" fill="none" stroke="#fff" strokeOpacity="0.18" />
      {children}
    </svg>
  )
}

const line = { fill: 'none', stroke: '#fff', strokeLinecap: 'round', strokeLinejoin: 'round' }

// Maintenance Work Manage: a notebook with a check.
export function WorkIcon({ className }) {
  return (
    <Tile tone="work" className={className} label="Maintenance Work Manage">
      <rect x="18" y="13" width="30" height="38" rx="4" {...line} strokeWidth="3.5" />
      <path d="M14 21h6M14 32h6M14 43h6" {...line} strokeWidth="3.5" />
      <path d="M27 24h13M27 31h13" {...line} strokeWidth="3" strokeOpacity="0.85" />
      <path d="M27 40l3.5 3.5L38 36" {...line} strokeWidth="3.5" />
    </Tile>
  )
}

// MachTrek: a route between two stops, with the "m" mark.
export function MachTrekIcon({ className }) {
  return (
    <Tile tone="machtrek" className={className} label="MachTrek">
      <path d="M17 47 C30 47 34 40 26 34 S26 22 36 21" {...line} strokeWidth="3.5" strokeDasharray="0.1 6.5" />
      <circle cx="16" cy="47" r="5" fill="#fff" />
      <circle cx="46" cy="18" r="11" fill="#fff" />
      <text
        x="46"
        y="23.5"
        textAnchor="middle"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontWeight="800"
        fontSize="16"
        fill="#059669"
      >
        m
      </text>
    </Tile>
  )
}

// Settings: a gear.
export function SettingsIcon({ className }) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <Tile tone="settings" className={className} label="Settings">
      <g transform="translate(32 32)">
        {teeth.map((deg) => (
          <rect key={deg} x="-3.5" y="-19" width="7" height="9" rx="2" fill="#fff" transform={`rotate(${deg})`} />
        ))}
        <circle r="13" fill="#fff" />
        <circle r="5.5" fill="#475569" />
      </g>
    </Tile>
  )
}

// Machinery Profile: an excavator, side view.
export function MachinesIcon({ className }) {
  return (
    <Tile tone="machines" className={className} label="Machinery Profile">
      <rect x="10" y="42" width="30" height="9" rx="4.5" fill="#fff" />
      <circle cx="15" cy="46.5" r="2" fill="#0284c7" />
      <circle cx="25" cy="46.5" r="2" fill="#0284c7" />
      <circle cx="35" cy="46.5" r="2" fill="#0284c7" />
      <path d="M12 39V29a2 2 0 0 1 2-2h8v-6a2 2 0 0 1 2-2h7l3 8h4a2 2 0 0 1 2 2v10Z" fill="#fff" />
      <path d="M25 22.5h5.2l2 5H25Z" fill="#0ea5e9" />
      <path d="M38 31 46 16l9 13" {...line} strokeWidth="4" />
      <path d="M51 28h7v6q0 4-4 4h-3Z" fill="#fff" />
    </Tile>
  )
}

// Supplier Workshop List: a workshop with a wrench.
export function SuppliersIcon({ className }) {
  return (
    <Tile tone="suppliers" className={className} label="Supplier Workshop List">
      <path d="M12 28 32 15l20 13v22H12Z" fill="#fff" />
      <rect x="21" y="34" width="22" height="16" rx="1.5" fill="#7c3aed" opacity="0.18" />
      <path d="M21 39h22M21 44h22" stroke="#7c3aed" strokeOpacity="0.45" strokeWidth="2" />
      <path
        d="M41 20.5a6 6 0 0 0 7.6 7.6l3.2 3.2-3.3 3.3-3.2-3.2a6 6 0 0 0-7.6-7.6l3.4 3.4 2.6-.6.6-2.6Z"
        fill="#7c3aed"
        transform="translate(-14 4)"
      />
    </Tile>
  )
}

// CMMS User Setting: two people.
export function UsersIcon({ className }) {
  return (
    <Tile tone="users" className={className} label="CMMS User Setting">
      <circle cx="26" cy="24" r="7.5" fill="#fff" />
      <path d="M12 48c0-8 6.3-13 14-13s14 5 14 13Z" fill="#fff" />
      <circle cx="42" cy="26" r="6" fill="#fff" opacity="0.75" />
      <path d="M38 37.5c1.3-.3 2.6-.5 4-.5 6.2 0 11 4 11 11H42" fill="#fff" opacity="0.75" />
    </Tile>
  )
}

// CMMS 2 tile picture: a soil mountain under contract work, with the white
// "CMMS 2" sign on the summit, an excavator digging a bench and two dump lorries
// on the haul road. Modern flat illustration with light/shade and haze.
export function CmmsScene({ className }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="CMMS 2"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="cmms-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fb8f5" />
          <stop offset="0.55" stopColor="#cfe4fb" />
          <stop offset="1" stopColor="#fbe3c8" />
        </linearGradient>
        <radialGradient id="cmms-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7d6" />
          <stop offset="0.45" stopColor="#ffe9a8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cmms-lit" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#d9a066" />
          <stop offset="1" stopColor="#b06d36" />
        </linearGradient>
        <linearGradient id="cmms-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9c6131" />
          <stop offset="1" stopColor="#6f4220" />
        </linearGradient>
        <linearGradient id="cmms-cut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8763c" />
          <stop offset="1" stopColor="#94592b" />
        </linearGradient>
        <linearGradient id="cmms-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7a5232" />
          <stop offset="1" stopColor="#4f331c" />
        </linearGradient>
        <linearGradient id="cmms-yel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#f2a500" />
        </linearGradient>
        <linearGradient id="cmms-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fd3ff" />
          <stop offset="1" stopColor="#2f4a6e" />
        </linearGradient>
        <filter id="cmms-soft" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#3b2412" floodOpacity="0.35" />
        </filter>
        <filter id="cmms-blur">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* sky + sun */}
      <rect width="200" height="200" fill="url(#cmms-sky)" />
      <circle cx="160" cy="38" r="26" fill="url(#cmms-sun)" />
      <circle cx="160" cy="38" r="8.5" fill="#fff8df" />
      {/* soft clouds */}
      <g fill="#fff" opacity="0.75">
        <ellipse cx="34" cy="34" rx="16" ry="4.5" />
        <ellipse cx="44" cy="31" rx="9" ry="4.5" />
        <ellipse cx="128" cy="20" rx="11" ry="3" />
      </g>

      {/* distant hills (atmospheric) */}
      <path d="M-5 128 C20 112 42 104 64 110 S108 98 130 106 S176 100 205 110 V200 H-5Z" fill="#b9c3dc" opacity="0.7" />
      <path d="M-5 140 C30 124 58 122 80 128 S140 118 205 128 V200 H-5Z" fill="#cdb39a" opacity="0.65" />
      {/* distant oil palms */}
      <g fill="none" stroke="#6f8f6a" strokeLinecap="round" opacity="0.8">
        <g transform="translate(22 124)">
          <path d="M0 0 V-12" strokeWidth="1.4" />
          <path
            d="M0 -12 q-6 -2 -9 2 M0 -12 q6 -2 9 2 M0 -12 q-4 -5 -9 -5 M0 -12 q4 -5 9 -5 M0 -12 q0 -4 0 -6"
            strokeWidth="1.6"
          />
        </g>
        <g transform="translate(36 128) scale(0.8)">
          <path d="M0 0 V-12" strokeWidth="1.4" />
          <path
            d="M0 -12 q-6 -2 -9 2 M0 -12 q6 -2 9 2 M0 -12 q-4 -5 -9 -5 M0 -12 q4 -5 9 -5 M0 -12 q0 -4 0 -6"
            strokeWidth="1.6"
          />
        </g>
        <g transform="translate(184 126) scale(0.9)">
          <path d="M0 0 V-12" strokeWidth="1.4" />
          <path
            d="M0 -12 q-6 -2 -9 2 M0 -12 q6 -2 9 2 M0 -12 q-4 -5 -9 -5 M0 -12 q4 -5 9 -5 M0 -12 q0 -4 0 -6"
            strokeWidth="1.6"
          />
        </g>
      </g>

      {/* main soil mountain: lit face */}
      <path d="M-5 168 C22 146 52 104 82 70 Q95 55 108 63 C134 80 166 114 205 134 V200 H-5Z" fill="url(#cmms-lit)" />
      {/* shadow face (right of the ridge) */}
      <path
        d="M95 58 Q102 57 108 63 C134 80 166 114 205 134 V200 H122 C120 158 112 106 95 58Z"
        fill="url(#cmms-shade)"
      />
      {/* bench cut into the slope: fresh face + level floor */}
      <path d="M116 72 C140 88 160 102 184 117 L184 121 L122 121 Q114 98 116 72Z" fill="url(#cmms-cut)" />
      <path d="M116 72 C140 88 160 102 184 117" stroke="#e2ad74" strokeWidth="1" fill="none" opacity="0.7" />
      <path d="M112 121 H186" stroke="#7a4a24" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path d="M112 122.5 H186" stroke="#f0c18e" strokeWidth="0.8" opacity="0.5" />
      {/* slope texture */}
      <g stroke="#f0c18e" strokeWidth="0.9" fill="none" strokeLinecap="round" opacity="0.45">
        <path d="M40 132 q14 -10 26 -8" />
        <path d="M58 108 q10 -8 18 -7" />
        <path d="M28 152 q16 -8 30 -6" />
      </g>
      <g fill="#7d4c26" opacity="0.35">
        <circle cx="70" cy="122" r="1" />
        <circle cx="52" cy="140" r="0.8" />
        <circle cx="88" cy="96" r="0.9" />
        <circle cx="140" cy="140" r="1" />
        <circle cx="160" cy="152" r="0.8" />
        <circle cx="130" cy="160" r="1.1" />
      </g>

      {/* summit sign */}
      <g filter="url(#cmms-soft)">
        <rect x="84.5" y="44" width="2.2" height="16" rx="0.6" fill="#64748b" />
        <rect x="105.3" y="44" width="2.2" height="16" rx="0.6" fill="#64748b" />
        <rect x="62" y="22" width="68" height="25" rx="3.5" fill="#ffffff" />
      </g>
      <rect x="62" y="22" width="68" height="4" rx="2" fill="#2563eb" opacity="0.9" />
      <text
        x="96"
        y="41.5"
        textAnchor="middle"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontWeight="800"
        fontSize="13.5"
        letterSpacing="0.4"
        fill="#1e3a8a"
      >
        CMMS 2
      </text>

      {/* excavator on the cut, digging up-slope (faces left) */}
      <g transform="translate(138 98.5)">
        <ellipse cx="16" cy="23" rx="20" ry="2.6" fill="#3b2412" opacity="0.3" filter="url(#cmms-blur)" />
        {/* tracks */}
        <rect x="0" y="15" width="32" height="7.5" rx="3.75" fill="#2b2f36" />
        <g fill="#5b6270">
          <circle cx="5" cy="18.7" r="1.6" />
          <circle cx="11.5" cy="18.7" r="1.3" />
          <circle cx="18" cy="18.7" r="1.3" />
          <circle cx="24.5" cy="18.7" r="1.3" />
          <circle cx="27.6" cy="18.7" r="1.6" />
        </g>
        {/* house */}
        <path d="M5 15 V7 Q5 5 7 5 H29 Q32 5 32 8 V15Z" fill="url(#cmms-yel)" />
        <rect x="25" y="5" width="7" height="10" rx="1.5" fill="#e09400" />
        <path d="M5 11 H32" stroke="#c98200" strokeWidth="0.7" />
        {/* cab */}
        <path d="M6 5 V-4 Q6 -6 8 -6 H14 Q16 -6 16.6 -4 L18 5Z" fill="url(#cmms-yel)" />
        <path d="M7.6 -4.4 H13.6 L15 3 H7.6Z" fill="url(#cmms-glass)" />
        <path d="M8.4 -3.6 L10.6 -3.6 L8.4 0Z" fill="#fff" opacity="0.55" />
        {/* boom + stick with hydraulic cylinders */}
        <path d="M8 6 L-6 -16 L-3 -18 L12 5Z" fill="url(#cmms-yel)" />
        <path d="M3 3 L-4 -10" stroke="#9aa3b2" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M-5 -17 L-17 -3 L-14.5 -1.5 L-2.5 -15Z" fill="#f2b21c" />
        <circle cx="-4.5" cy="-17" r="1.7" fill="#2b2f36" />
        {/* bucket biting the slope */}
        <path d="M-15 -3.5 L-24 -6.5 Q-26.5 -1 -22 2.5 L-14.5 0.5Z" fill="#4b5563" />
        <path
          d="M-24 -6.5 L-26 -5.6 M-25.4 -3.2 L-27.4 -2.6 M-24.2 0 L-26 0.9"
          stroke="#2b2f36"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      </g>
      {/* dust */}
      <g fill="#f4dcc0" opacity="0.7" filter="url(#cmms-blur)">
        <circle cx="111" cy="94" r="3.4" />
        <circle cx="107" cy="98" r="2.5" />
        <circle cx="115" cy="90" r="2.1" />
      </g>

      {/* haul road */}
      <path d="M-5 170 C50 160 130 162 205 174 V200 H-5Z" fill="url(#cmms-road)" />
      <path d="M-5 170 C50 160 130 162 205 174" stroke="#a5784d" strokeWidth="1.2" fill="none" opacity="0.8" />
      <g stroke="#8d6440" strokeWidth="0.9" fill="none" strokeDasharray="3 2.5" opacity="0.8">
        <path d="M-5 182 C60 172 130 175 205 184" />
        <path d="M-5 189 C60 180 130 183 205 191" />
      </g>

      {/* dump lorry 1 (heading right, loaded) */}
      <g transform="translate(18 158)">
        <ellipse cx="22" cy="20" rx="24" ry="2.4" fill="#2a1a0d" opacity="0.35" filter="url(#cmms-blur)" />
        <path d="M1 4 Q9 -4.5 18 1.5 Q23 -1.5 28 4Z" fill="#b8763c" />
        <path d="M3 2 Q10 -2.5 16 1" stroke="#d9a066" strokeWidth="0.9" fill="none" />
        <path d="M0 4 H29 L27 13.5 H2Z" fill="url(#cmms-yel)" />
        <path d="M2 8.5 H28" stroke="#d48a00" strokeWidth="0.8" />
        <path d="M30 6 H37.5 Q39 6 40 7.5 L43 12 V16 H30Z" fill="url(#cmms-yel)" />
        <path d="M32 7.6 H37 L39.8 11.8 H32Z" fill="url(#cmms-glass)" />
        <rect x="0" y="13.5" width="44" height="3" rx="1.2" fill="#2b2f36" />
        <g>
          <circle cx="8" cy="18" r="4" fill="#1f2329" />
          <circle cx="8" cy="18" r="1.6" fill="#9aa3b2" />
          <circle cx="17" cy="18" r="4" fill="#1f2329" />
          <circle cx="17" cy="18" r="1.6" fill="#9aa3b2" />
          <circle cx="36" cy="18" r="4" fill="#1f2329" />
          <circle cx="36" cy="18" r="1.6" fill="#9aa3b2" />
        </g>
      </g>
      {/* dump lorry 2 (heading left, smaller = further) */}
      <g transform="translate(140 158) scale(-0.82 0.82)">
        <ellipse cx="22" cy="20" rx="24" ry="2.4" fill="#2a1a0d" opacity="0.35" filter="url(#cmms-blur)" />
        <path d="M1 4 Q9 -4.5 18 1.5 Q23 -1.5 28 4Z" fill="#b8763c" />
        <path d="M0 4 H29 L27 13.5 H2Z" fill="url(#cmms-yel)" />
        <path d="M2 8.5 H28" stroke="#d48a00" strokeWidth="0.8" />
        <path d="M30 6 H37.5 Q39 6 40 7.5 L43 12 V16 H30Z" fill="url(#cmms-yel)" />
        <path d="M32 7.6 H37 L39.8 11.8 H32Z" fill="url(#cmms-glass)" />
        <rect x="0" y="13.5" width="44" height="3" rx="1.2" fill="#2b2f36" />
        <g>
          <circle cx="8" cy="18" r="4" fill="#1f2329" />
          <circle cx="8" cy="18" r="1.6" fill="#9aa3b2" />
          <circle cx="17" cy="18" r="4" fill="#1f2329" />
          <circle cx="17" cy="18" r="1.6" fill="#9aa3b2" />
          <circle cx="36" cy="18" r="4" fill="#1f2329" />
          <circle cx="36" cy="18" r="1.6" fill="#9aa3b2" />
        </g>
      </g>
    </svg>
  )
}
