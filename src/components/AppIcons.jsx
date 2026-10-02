// App-style module icons: a rounded gradient square with a simple white glyph.
// One shared look for every tile on the portal.

const TONES = {
  cmms: ['#4f46e5', '#0ea5e9'], // indigo → sky
  work: ['#f97316', '#f59e0b'], // orange → amber
  machtrek: ['#059669', '#14b8a6'], // emerald → teal
  settings: ['#334155', '#64748b'] // slate
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
      <path d="M38 22 L49 22 L49 30 Q49 35 43 35 L40 35 Z" fill="#fff" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
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
