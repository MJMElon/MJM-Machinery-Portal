// Module icons for the main page: formal rounded squares, one colour each,
// with a simple white symbol inside (app-icon style).

function Tile({ from, to, id, label, children }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={label} className="h-full w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${id})`} />
      <rect x="2" y="2" width="60" height="60" rx="15" fill="none" stroke="#fff" strokeOpacity="0.25" />
      <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}

// Machinery Manage: excavator arm + bucket over tracks.
export function MachineryIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-mach" from="#f59e0b" to="#d97706" label="Machinery Manage">
        <rect x="14" y="40" width="26" height="9" rx="4.5" />
        <path d="M18 40v-8h9v-6h6l3 6h3v8" />
        <path d="M36 26l8-11 7 9" />
        <path d="M51 24v6h-5" />
      </Tile>
    </span>
  )
}

// Diesel Manage: fuel pump with nozzle.
export function DieselIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-dsl" from="#10b981" to="#047857" label="Fuel Manage">
        <path d="M17 50V18a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v32" />
        <path d="M14 50h26" />
        <rect x="22" y="21" width="10" height="9" rx="1.5" />
        <path d="M37 27h4a3 3 0 0 1 3 3v12a3 3 0 0 0 6 0V25l-4-4" />
      </Tile>
    </span>
  )
}

// Settings: cog.
export function SettingsIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-set" from="#64748b" to="#334155" label="Settings">
        <circle cx="32" cy="32" r="6" />
        <path d="M32 14v5M32 45v5M14 32h5M45 32h5M19.3 19.3l3.5 3.5M41.2 41.2l3.5 3.5M19.3 44.7l3.5-3.5M41.2 22.8l3.5-3.5" />
        <circle cx="32" cy="32" r="13" strokeDasharray="4.5 3.6" />
      </Tile>
    </span>
  )
}

// ---- Diesel Manage sub-module icons ---------------------------------------

export function DieselClaimsIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-dcl" from="#f59e0b" to="#d97706" label="Fuel Claims">
        <path d="M20 12h24v40l-4-3-4 3-4-3-4 3-4-3-4 3z" />
        <path d="M26 22h12M26 29h12M26 36h7" />
      </Tile>
    </span>
  )
}

export function DieselUsageIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-dus" from="#0ea5e9" to="#0369a1" label="Fuel Usage">
        <path d="M32 13c-8 10-13 16-13 23a13 13 0 0 0 26 0c0-7-5-13-13-23z" />
        <path d="M25 38a7 7 0 0 0 7 7" />
      </Tile>
    </span>
  )
}

export function FleetCardIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-fcd" from="#10b981" to="#047857" label="Fleet Card Manage">
        <rect x="12" y="18" width="40" height="28" rx="4" />
        <path d="M12 27h40M19 38h9" />
      </Tile>
    </span>
  )
}

export function ReportIcon({ className }) {
  return (
    <span className={className}>
      <Tile id="ic-rpt" from="#8b5cf6" to="#5b21b6" label="Report">
        <path d="M14 50h36" />
        <path d="M20 44V32M30 44V22M40 44V28M50 44V16" />
      </Tile>
    </span>
  )
}
