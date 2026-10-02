// Picture buttons for the main page (shaped illustrations, no box).

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

// Settings button picture (no box): a modern workshop with free-standing white
// letter signs "SETTINGS" on the roof, an excavator in the open bay for
// service, and drums / tyres in the yard breaking out of the outline.
export function SettingsScene({ className }) {
  return (
    <svg viewBox="0 0 256 170" className={className} role="img" aria-label="Settings">
      <defs>
        <linearGradient id="set-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="1" stopColor="#d5dde8" />
        </linearGradient>
        <linearGradient id="set-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a9b6c8" />
          <stop offset="1" stopColor="#8796ab" />
        </linearGradient>
        <linearGradient id="set-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#64748b" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
        <linearGradient id="set-bay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f172a" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
        <radialGradient id="set-lamp" cx="0.5" cy="0" r="0.9">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="set-yel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd34d" />
          <stop offset="1" stopColor="#f2a500" />
        </linearGradient>
        <linearGradient id="set-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bfe3ff" />
          <stop offset="1" stopColor="#5b86b5" />
        </linearGradient>
        <filter id="set-blur">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <filter id="set-lift" x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1" floodColor="#1e293b" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* ground shadow */}
      <ellipse cx="128" cy="152" rx="116" ry="7" fill="#1e293b" opacity="0.22" filter="url(#set-blur)" />

      {/* roof top plane (seen slightly from above) */}
      <path d="M34 82 L176 82 L214 74 L72 74Z" fill="url(#set-roof)" />
      <path d="M34 82 L176 82" stroke="#94a3b8" strokeWidth="1.2" />
      {/* side wall (shaded) with cladding */}
      <path d="M176 82 L214 74 V144 L176 150Z" fill="url(#set-side)" />
      <g stroke="#7b8aa0" strokeWidth="0.7" opacity="0.8">
        <path d="M185 80.1 V148.6" />
        <path d="M194 78.2 V147.2" />
        <path d="M203 76.3 V145.8" />
      </g>
      <path d="M184 100 L206 95.4 V110 L184 114.6Z" fill="url(#set-glass)" opacity="0.9" />
      <path d="M186 101.6 L192 100.3 L186 108Z" fill="#fff" opacity="0.5" />
      {/* front facade */}
      <path d="M34 82 H176 V150 H34Z" fill="url(#set-front)" />
      <rect x="34" y="82" width="142" height="7" fill="#2563eb" />
      <rect x="34" y="88.2" width="142" height="0.8" fill="#1d4ed8" />
      <g stroke="#c3cdda" strokeWidth="0.6">
        <path d="M34 104 H176" />
        <path d="M34 120 H176" />
        <path d="M34 136 H176" />
      </g>

      {/* open bay with lamp light and the excavator in for service */}
      <rect x="44" y="96" width="70" height="54" fill="url(#set-bay)" />
      <path d="M44 96 H114 V103 H44Z" fill="#94a3b8" />
      <g stroke="#64748b" strokeWidth="0.6">
        <path d="M44 98.3 H114" />
        <path d="M44 100.6 H114" />
      </g>
      <path d="M60 103 L98 103 L112 150 L46 150Z" fill="url(#set-lamp)" />
      <rect x="76" y="103" width="6" height="1.8" rx="0.9" fill="#fde68a" />
      {/* tool board on the back wall */}
      <g stroke="#94a3b8" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <path d="M50 110 v7" />
        <path d="M54 110 v6" />
        <path d="M58 110 l2 6" />
      </g>
      {/* excavator inside, tracks + bucket breaking out of the door */}
      <g transform="translate(66 117) scale(1.25)">
        <rect x="0" y="15" width="32" height="7.5" rx="3.75" fill="#2b2f36" />
        <g fill="#5b6270">
          <circle cx="5" cy="18.7" r="1.6" />
          <circle cx="11.5" cy="18.7" r="1.3" />
          <circle cx="18" cy="18.7" r="1.3" />
          <circle cx="24.5" cy="18.7" r="1.3" />
          <circle cx="27.6" cy="18.7" r="1.6" />
        </g>
        <path d="M5 15 V7 Q5 5 7 5 H29 Q32 5 32 8 V15Z" fill="url(#set-yel)" />
        <path d="M6 5 V-2 Q6 -4 8 -4 H14 Q16 -4 16.6 -2 L18 5Z" fill="url(#set-yel)" />
        <path d="M7.6 -2.4 H13.6 L15 3 H7.6Z" fill="#2f4a6e" />
        <path d="M8 6 L-4 -6 L-1 -8 L12 5Z" fill="url(#set-yel)" />
        <path d="M-3 -7 L-14 6 L-11.5 7.5 L-0.5 -5Z" fill="#f2b21c" />
        <path d="M-12 6 L-20 3 Q-22.5 9 -18 12.5 L-11.5 10.5Z" fill="#4b5563" />
      </g>

      {/* closed bay */}
      <rect x="124" y="104" width="44" height="46" fill="#cbd5e1" />
      <g stroke="#94a3b8" strokeWidth="0.8">
        <path d="M124 108 H168" />
        <path d="M124 112 H168" />
        <path d="M124 116 H168" />
        <path d="M124 120 H168" />
        <path d="M124 124 H168" />
        <path d="M124 128 H168" />
        <path d="M124 132 H168" />
        <path d="M124 136 H168" />
        <path d="M124 140 H168" />
        <path d="M124 144 H168" />
      </g>
      <rect x="142" y="146" width="8" height="1.6" rx="0.8" fill="#64748b" />
      {/* gear badge on the facade */}
      <g transform="translate(146 95)">
        <circle r="6.2" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" />
        <g fill="#2563eb">
          <rect x="-1.1" y="-5.2" width="2.2" height="2.6" rx="0.5" />
          <rect x="-1.1" y="2.6" width="2.2" height="2.6" rx="0.5" />
          <rect x="-5.2" y="-1.1" width="2.6" height="2.2" rx="0.5" />
          <rect x="2.6" y="-1.1" width="2.6" height="2.2" rx="0.5" />
          <rect x="-1.1" y="-5.2" width="2.2" height="2.6" rx="0.5" transform="rotate(45)" />
          <rect x="-1.1" y="2.6" width="2.2" height="2.6" rx="0.5" transform="rotate(45)" />
          <rect x="-5.2" y="-1.1" width="2.6" height="2.2" rx="0.5" transform="rotate(45)" />
          <rect x="2.6" y="-1.1" width="2.6" height="2.2" rx="0.5" transform="rotate(45)" />
          <circle r="3.4" />
        </g>
        <circle r="1.3" fill="#fff" />
      </g>

      {/* yard: oil drums + tyre stack breaking out of the building */}
      <g transform="translate(206 128)">
        <ellipse cx="9" cy="22.5" rx="14" ry="1.8" fill="#1e293b" opacity="0.3" />
        <rect x="0" y="4" width="10" height="18" rx="1.5" fill="#dc2626" />
        <ellipse cx="5" cy="4" rx="5" ry="1.4" fill="#ef4444" />
        <path d="M0 10 H10 M0 16 H10" stroke="#991b1b" strokeWidth="0.8" />
        <rect x="11" y="6" width="10" height="16" rx="1.5" fill="#2563eb" />
        <ellipse cx="16" cy="6" rx="5" ry="1.4" fill="#3b82f6" />
        <path d="M11 12 H21 M11 17 H21" stroke="#1e40af" strokeWidth="0.8" />
      </g>
      <g transform="translate(20 132)" fill="#1f2329">
        <ellipse cx="9" cy="18.5" rx="13" ry="1.6" fill="#1e293b" opacity="0.3" />
        <rect x="0" y="12" width="18" height="6" rx="3" />
        <rect x="0" y="6" width="18" height="6" rx="3" />
        <rect x="0" y="0" width="18" height="6" rx="3" />
        <g fill="#4b5563">
          <rect x="6" y="13.6" width="6" height="2.8" rx="1.4" />
          <rect x="6" y="7.6" width="6" height="2.8" rx="1.4" />
          <rect x="6" y="1.6" width="6" height="2.8" rx="1.4" />
        </g>
      </g>

      {/* S E T T I N G S : free-standing white letter signs on the roof */}
      <g fontFamily="'Plus Jakarta Sans', system-ui, sans-serif" fontWeight="800" fontSize="20" textAnchor="middle">
        <g fill="#334155">
          <rect x="48.3" y="73" width="1.6" height="6" />
          <rect x="64.6" y="73" width="1.6" height="6" />
          <rect x="80.5" y="73" width="1.6" height="6" />
          <rect x="96.5" y="73" width="1.6" height="6" />
          <rect x="109.4" y="73" width="1.6" height="6" />
          <rect x="123.6" y="73" width="1.6" height="6" />
          <rect x="142.3" y="73" width="1.6" height="6" />
          <rect x="160.1" y="73" width="1.6" height="6" />
        </g>
        <g fill="#475569" transform="translate(1.2 1.4)">
          <text x="49.1" y="74">
            S
          </text>
          <text x="65.4" y="74">
            E
          </text>
          <text x="81.3" y="74">
            T
          </text>
          <text x="97.3" y="74">
            T
          </text>
          <text x="110.2" y="74">
            I
          </text>
          <text x="124.4" y="74">
            N
          </text>
          <text x="143.1" y="74">
            G
          </text>
          <text x="160.9" y="74">
            S
          </text>
        </g>
        <g fill="#94a3b8" transform="translate(0.6 0.7)">
          <text x="49.1" y="74">
            S
          </text>
          <text x="65.4" y="74">
            E
          </text>
          <text x="81.3" y="74">
            T
          </text>
          <text x="97.3" y="74">
            T
          </text>
          <text x="110.2" y="74">
            I
          </text>
          <text x="124.4" y="74">
            N
          </text>
          <text x="143.1" y="74">
            G
          </text>
          <text x="160.9" y="74">
            S
          </text>
        </g>
        <g fill="#ffffff" stroke="#94a3b8" strokeWidth="0.6" filter="url(#set-lift)">
          <text x="49.1" y="74">
            S
          </text>
          <text x="65.4" y="74">
            E
          </text>
          <text x="81.3" y="74">
            T
          </text>
          <text x="97.3" y="74">
            T
          </text>
          <text x="110.2" y="74">
            I
          </text>
          <text x="124.4" y="74">
            N
          </text>
          <text x="143.1" y="74">
            G
          </text>
          <text x="160.9" y="74">
            S
          </text>
        </g>
      </g>
    </svg>
  )
}
