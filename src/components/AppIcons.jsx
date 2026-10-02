// App-style module icons: a rounded gradient square with a simple white glyph.
// One shared look for every tile on the portal.

const TONES = {
  cmms: ['#4f46e5', '#0ea5e9'], // indigo → sky
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

// CMMS 2: an excavator arm scooping a spark (the "gem"), with the SI mark.
export function CmmsIcon({ className }) {
  return (
    <Tile tone="cmms" className={className} label="CMMS 2">
      {/* boom + stick */}
      <path d="M11 33 L25 14 L41 24" {...line} strokeWidth="4.5" />
      {/* bucket */}
      <path
        d="M38 22 L49 22 L49 30 Q49 35 43 35 L40 35 Z"
        fill="#fff"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="14" r="2.6" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
      {/* spark / gem being dug out */}
      <path d="M46 38 L48.4 44.6 L55 47 L48.4 49.4 L46 56 L43.6 49.4 L37 47 L43.6 44.6 Z" fill="#fde68a" />
      {/* SI */}
      <text
        x="9"
        y="55"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontWeight="800"
        fontSize="20"
        letterSpacing="-0.5"
        fill="#fff"
      >
        SI
      </text>
    </Tile>
  )
}

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

// CMMS 2 tile picture: a brown soil mountain with the white "CMMS 2" sign on
// top, an excavator working a bench and two dump lorries on the haul road.
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
          <stop offset="0" stopColor="#7cc4ff" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="cmms-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9743a" />
          <stop offset="1" stopColor="#7c4a22" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#cmms-sky)" />
      <circle cx="172" cy="30" r="13" fill="#fef3c7" />
      {/* far hill */}
      <path d="M0 132 Q40 104 78 118 T160 112 T200 120 V200 H0Z" fill="#d6a46e" opacity="0.55" />
      {/* main soil mountain with dug benches on the right */}
      <path
        d="M-2 170 C20 150 42 110 70 82 L92 60 L108 60 L124 78 L124 92 L144 92 L144 108 L166 108 L166 124 L188 124 C194 134 200 140 202 146 V200 H-2Z"
        fill="url(#cmms-soil)"
      />
      <path d="M124 92 H144 M144 108 H166 M166 124 H188" stroke="#d99a5c" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M40 120 q10 -6 18 -2 M56 98 q8 -5 14 -1"
        stroke="#a5652f"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* white sign on the summit */}
      <rect x="86" y="44" width="3" height="18" fill="#e2e8f0" />
      <rect x="111" y="44" width="3" height="18" fill="#e2e8f0" />
      <rect x="58" y="20" width="84" height="28" rx="4" fill="#fff" stroke="#cbd5e1" strokeWidth="1" />
      <text
        x="100"
        y="40.5"
        textAnchor="middle"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontWeight="800"
        fontSize="17"
        letterSpacing="0.5"
        fill="#1e3a8a"
      >
        CMMS 2
      </text>
      {/* excavator on the middle bench, digging the slope */}
      <g transform="translate(150 81) scale(1.65)">
        <rect x="-2" y="10" width="22" height="6" rx="3" fill="#1f2937" />
        <path
          d="M0 10 V3 Q0 1 2 1 H9 V-4 Q9 -6 11 -6 H15 L18 1 H19 Q20 1 20 3 V10Z"
          fill="#f59e0b"
          stroke="#b45309"
          strokeWidth="0.8"
        />
        <path d="M11 -4.5 H14.5 L16.3 0.5 H11Z" fill="#e0f2fe" />
        <path
          d="M2 2 L-8 -12 L-16 -3"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path d="M-15 -4 L-21 -6 L-22 0 Q-19 3 -15 1Z" fill="#475569" />
      </g>
      {/* haul road */}
      <path d="M-2 176 Q100 166 202 178 V200 H-2Z" fill="#5b3a1d" />
      <path
        d="M8 186 H26 M44 184 H62 M80 183 H98 M116 183 H134 M152 184 H170 M188 186 H200"
        stroke="#a87b4f"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* two dump lorries */}
      <Lorry x={8} y={150} />
      <Lorry x={86} y={147} flip />
    </svg>
  )
}

function Lorry({ x, y, flip = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.4)${flip ? ' scale(-1 1) translate(-40 0)' : ''}`}>
      {/* soil load + dump body */}
      <path d="M2 4 Q10 -4 20 2 Q24 -1 26 4Z" fill="#b9743a" />
      <path d="M0 4 H27 L25 14 H2Z" fill="#f59e0b" stroke="#b45309" strokeWidth="0.8" />
      {/* cab */}
      <path d="M28 6 H35 L39 11 V16 H28Z" fill="#fbbf24" stroke="#b45309" strokeWidth="0.8" />
      <path d="M30 7.5 H34 L36.6 11 H30Z" fill="#e0f2fe" />
      <rect x="0" y="14" width="39" height="3" rx="1" fill="#374151" />
      <circle cx="8" cy="19" r="3.6" fill="#1f2937" />
      <circle cx="8" cy="19" r="1.4" fill="#9ca3af" />
      <circle cx="31" cy="19" r="3.6" fill="#1f2937" />
      <circle cx="31" cy="19" r="1.4" fill="#9ca3af" />
    </g>
  )
}
