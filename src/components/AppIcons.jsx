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

// CMMS 2 button picture (no box): a flat-topped soil mesa under contract work.
// Each letter of "CMMS 2" stands on the top as its own white sign; an excavator
// digs the right shoulder and two dump lorries haul soil, breaking out of the
// mesa outline. Transparent background, so the button is the mesa itself.
export const CMMS_SCENE_ASPECT = '256 / 170'

export function CmmsScene({ className }) {
  return (
    <svg viewBox="0 0 256 170" className={className} role="img" aria-label="CMMS 2">
      <defs>
        <linearGradient id="cmms-lit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7995c" />
          <stop offset="1" stopColor="#a9662f" />
        </linearGradient>
        <linearGradient id="cmms-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#94592a" />
          <stop offset="1" stopColor="#6c3f1c" />
        </linearGradient>
        <linearGradient id="cmms-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0c48f" />
          <stop offset="1" stopColor="#dfa86c" />
        </linearGradient>
        <linearGradient id="cmms-yel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#f2a500" />
        </linearGradient>
        <linearGradient id="cmms-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a9dbff" />
          <stop offset="1" stopColor="#2f4a6e" />
        </linearGradient>
        <clipPath id="cmms-body">
          <path d="M10 150 C22 136 32 116 44 98 C52 84 56 72 64 62 L184 62 C186 74 187 84 188 90 L212 90 C220 104 226 124 232 150Z" />
        </clipPath>
        <filter id="cmms-blur">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <filter id="cmms-lift" x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1" floodColor="#1e293b" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* ground shadow (no box: the button is the mesa itself) */}
      <ellipse cx="124" cy="152" rx="118" ry="7" fill="#3b2412" opacity="0.28" filter="url(#cmms-blur)" />

      {/* mesa body */}
      <path
        d="M10 150 C22 136 32 116 44 98 C52 84 56 72 64 62 L184 62 C186 74 187 84 188 90 L212 90 C220 104 226 124 232 150Z"
        fill="url(#cmms-lit)"
      />
      <g clipPath="url(#cmms-body)">
        {/* strata bands */}
        <path d="M0 84 C70 80 150 88 240 84 V92 C150 96 70 88 0 92Z" fill="#e4ad72" opacity="0.35" />
        <path d="M0 112 C80 108 160 116 240 110 V117 C160 123 80 115 0 119Z" fill="#8a5428" opacity="0.18" />
        <path d="M0 132 C80 128 160 136 240 131 V137 C160 142 80 135 0 139Z" fill="#e4ad72" opacity="0.28" />
        {/* shaded right side */}
        <path
          d="M166 62 L184 62 C186 74 187 84 188 90 L212 90 C220 104 226 124 232 150 L182 150 C178 118 172 88 166 62Z"
          fill="url(#cmms-shade)"
          opacity="0.92"
        />
        {/* fresh cut face behind the excavator */}
        <path d="M184 62 C186 74 187 84 188 90 L194 90 C192 80 190 70 189 62Z" fill="#c4823f" />
        <path d="M188 90 H214" stroke="#e2ad74" strokeWidth="1" opacity="0.7" />
        {/* haul ramp cut across the lit face */}
        <path d="M10 151 L108 120" stroke="#7d4b22" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 147 L108 116.5" stroke="#c98d52" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
        <path d="M18 152 L104 125" stroke="#a36a37" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.8" />
        {/* pebbles */}
        <g fill="#7a4a24" opacity="0.35">
          <circle cx="70" cy="100" r="1.2" />
          <circle cx="120" cy="96" r="1" />
          <circle cx="140" cy="128" r="1.3" />
          <circle cx="96" cy="138" r="1" />
          <circle cx="205" cy="128" r="1.2" />
          <circle cx="58" cy="128" r="0.9" />
        </g>
      </g>
      {/* flat top surface (slight perspective) */}
      <path d="M64 62 L186 62 L181 56.5 L70 56.5Z" fill="url(#cmms-top)" />
      <path d="M64 62 L186 62" stroke="#f6d3a6" strokeWidth="0.8" />

      {/* C M M S 2 : one free-standing white letter sign each */}
      <g fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fontWeight="800" fontSize="27" textAnchor="middle">
        <g fill="#475569">
          <rect x="61" y="50" width="1.6" height="9" />
          <rect x="71.4" y="50" width="1.6" height="9" />
          <rect x="85" y="50" width="1.6" height="9" />
          <rect x="95.4" y="50" width="1.6" height="9" />
          <rect x="112" y="50" width="1.6" height="9" />
          <rect x="122.4" y="50" width="1.6" height="9" />
          <rect x="135" y="50" width="1.6" height="9" />
          <rect x="145.4" y="50" width="1.6" height="9" />
          <rect x="162" y="50" width="1.6" height="9" />
          <rect x="172.4" y="50" width="1.6" height="9" />
        </g>
        {/* extrusion (depth) */}
        <g fill="#475569" transform="translate(1.4 1.7)">
          <text x="67" y="52">
            C
          </text>
          <text x="91" y="52">
            M
          </text>
          <text x="118" y="52">
            M
          </text>
          <text x="141" y="52">
            S
          </text>
          <text x="168" y="52">
            2
          </text>
        </g>
        <g fill="#94a3b8" transform="translate(0.65 0.8)">
          <text x="67" y="52">
            C
          </text>
          <text x="91" y="52">
            M
          </text>
          <text x="118" y="52">
            M
          </text>
          <text x="141" y="52">
            S
          </text>
          <text x="168" y="52">
            2
          </text>
        </g>
        <g fill="#ffffff" stroke="#94a3b8" strokeWidth="0.7" filter="url(#cmms-lift)">
          <text x="67" y="52">
            C
          </text>
          <text x="91" y="52">
            M
          </text>
          <text x="118" y="52">
            M
          </text>
          <text x="141" y="52">
            S
          </text>
          <text x="168" y="52">
            2
          </text>
        </g>
      </g>

      {/* excavator on the right bench, digging the shoulder (breaks out of the mesa) */}
      <g transform="translate(204 56.6) scale(1.48)">
        <ellipse cx="17" cy="22.6" rx="18" ry="1.6" fill="#3b2412" opacity="0.35" />
        <rect x="0" y="15" width="32" height="7.5" rx="3.75" fill="#2b2f36" />
        <g fill="#5b6270">
          <circle cx="5" cy="18.7" r="1.6" />
          <circle cx="11.5" cy="18.7" r="1.3" />
          <circle cx="18" cy="18.7" r="1.3" />
          <circle cx="24.5" cy="18.7" r="1.3" />
          <circle cx="27.6" cy="18.7" r="1.6" />
        </g>
        <path d="M5 15 V7 Q5 5 7 5 H29 Q32 5 32 8 V15Z" fill="url(#cmms-yel)" />
        <rect x="25" y="5" width="7" height="10" rx="1.5" fill="#e09400" />
        <path d="M5 11 H32" stroke="#c98200" strokeWidth="0.7" />
        <path d="M6 5 V-4 Q6 -6 8 -6 H14 Q16 -6 16.6 -4 L18 5Z" fill="url(#cmms-yel)" />
        <path d="M7.6 -4.4 H13.6 L15 3 H7.6Z" fill="url(#cmms-glass)" />
        <path d="M8.4 -3.6 L10.6 -3.6 L8.4 0Z" fill="#fff" opacity="0.55" />
        <path d="M8 6 L-3 -14 L0 -16 L12 5Z" fill="url(#cmms-yel)" />
        <path d="M3 3 L-2 -9" stroke="#9aa3b2" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M-2 -15 L-10 -1 L-7.5 0.5 L0.5 -13Z" fill="#f2b21c" />
        <circle cx="-1.5" cy="-15" r="1.7" fill="#2b2f36" />
        <path d="M-8 -1.5 L-16 -4.5 Q-18.5 1 -14 4.5 L-7.5 2.5Z" fill="#4b5563" />
        <path
          d="M-16 -4.5 L-18 -3.6 M-17.4 -1.2 L-19.4 -0.6 M-16.2 2 L-18 2.9"
          stroke="#2b2f36"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        {/* soil in the bucket + crumbs */}
        <path d="M-15.5 -4 Q-12 -7.5 -8.5 -2" fill="#b8763c" />
        <g fill="#c98d52">
          <circle cx="-12" cy="8" r="0.9" />
          <circle cx="-10" cy="11" r="0.7" />
          <circle cx="-13.5" cy="12.5" r="0.6" />
        </g>
      </g>

      {/* lorry 1 climbing the ramp (loaded) */}
      <g transform="translate(40 116.5) rotate(-17.4)">
        <ellipse cx="22" cy="20.5" rx="22" ry="1.8" fill="#2a1a0d" opacity="0.4" />
        <path d="M1 4 Q9 -4.5 18 1.5 Q23 -1.5 28 4Z" fill="#b8763c" />
        <path d="M0 4 H29 L27 13.5 H2Z" fill="url(#cmms-yel)" />
        <path d="M2 8.5 H28" stroke="#d48a00" strokeWidth="0.8" />
        <path d="M30 6 H37.5 Q39 6 40 7.5 L43 12 V16 H30Z" fill="url(#cmms-yel)" />
        <path d="M32 7.6 H37 L39.8 11.8 H32Z" fill="url(#cmms-glass)" />
        <rect x="0" y="13.5" width="44" height="3" rx="1.2" fill="#2b2f36" />
        <circle cx="8" cy="18" r="4" fill="#1f2329" />
        <circle cx="8" cy="18" r="1.6" fill="#9aa3b2" />
        <circle cx="17" cy="18" r="4" fill="#1f2329" />
        <circle cx="17" cy="18" r="1.6" fill="#9aa3b2" />
        <circle cx="36" cy="18" r="4" fill="#1f2329" />
        <circle cx="36" cy="18" r="1.6" fill="#9aa3b2" />
      </g>

      {/* lorry 2 on the ground in front, heading out (breaks out of the mesa) */}
      <g transform="translate(118 133) scale(1.08)">
        <ellipse cx="22" cy="20.5" rx="23" ry="2" fill="#2a1a0d" opacity="0.4" />
        <path d="M1 4 Q9 -4.5 18 1.5 Q23 -1.5 28 4Z" fill="#b8763c" />
        <path d="M0 4 H29 L27 13.5 H2Z" fill="url(#cmms-yel)" />
        <path d="M2 8.5 H28" stroke="#d48a00" strokeWidth="0.8" />
        <path d="M30 6 H37.5 Q39 6 40 7.5 L43 12 V16 H30Z" fill="url(#cmms-yel)" />
        <path d="M32 7.6 H37 L39.8 11.8 H32Z" fill="url(#cmms-glass)" />
        <path d="M33 8.4 L35 8.4 L33 10.8Z" fill="#fff" opacity="0.5" />
        <rect x="0" y="13.5" width="44" height="3" rx="1.2" fill="#2b2f36" />
        <circle cx="8" cy="18" r="4" fill="#1f2329" />
        <circle cx="8" cy="18" r="1.6" fill="#9aa3b2" />
        <circle cx="17" cy="18" r="4" fill="#1f2329" />
        <circle cx="17" cy="18" r="1.6" fill="#9aa3b2" />
        <circle cx="36" cy="18" r="4" fill="#1f2329" />
        <circle cx="36" cy="18" r="1.6" fill="#9aa3b2" />
      </g>
    </svg>
  )
}
