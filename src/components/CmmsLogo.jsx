// CMMS 2 logo: an excavator digging a diamond marked "SI" out of the ground.
export function CmmsLogo({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="CMMS 2 logo" {...props}>
      <defs>
        <linearGradient id="cmms-gem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>

      {/* ground with the dig pit */}
      <path d="M4 74 H52 Q58 74 60 79 Q66 90 78 90 Q88 90 92 80 V96 H4 Z" fill="#a16207" opacity="0.25" />
      <path
        d="M4 74 H52 Q58 74 60 79 Q66 90 78 90 Q88 90 92 80"
        fill="none"
        stroke="#a16207"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* diamond (gem) with SI */}
      <g transform="translate(76 71)">
        <path
          d="M-15 -8 L-8 -16 H8 L15 -8 L0 16 Z"
          fill="url(#cmms-gem)"
          stroke="#1e3a8a"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M-15 -8 H15 M-8 -16 L-4 -8 L0 16 M8 -16 L4 -8 L0 16"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
        <text
          x="0"
          y="5"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontWeight="900"
          fontSize="12"
          fill="#ffffff"
          stroke="#1e3a8a"
          strokeWidth="0.6"
          paintOrder="stroke"
        >
          SI
        </text>
      </g>

      {/* excavator */}
      {/* tracks */}
      <rect x="6" y="62" width="40" height="11" rx="5.5" fill="#1f2937" />
      <circle cx="12" cy="67.5" r="2.4" fill="#9ca3af" />
      <circle cx="26" cy="67.5" r="2.4" fill="#9ca3af" />
      <circle cx="40" cy="67.5" r="2.4" fill="#9ca3af" />
      {/* body + cab */}
      <path
        d="M8 60 V46 Q8 43 11 43 H22 V37 Q22 34 25 34 H33 Q36 34 37 37 L40 47 H44 Q46 47 46 49 V60 Z"
        fill="#f59e0b"
        stroke="#b45309"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M25.5 37.5 H32.5 L34.8 45 H25.5 Z"
        fill="#e0f2fe"
        stroke="#b45309"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* boom + arm */}
      <path
        d="M40 50 L58 24 L64 26 L46 54 Z"
        fill="#f59e0b"
        stroke="#b45309"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M58 24 L71 51 L66 54 L55 29 Z"
        fill="#fbbf24"
        stroke="#b45309"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="26" r="2.6" fill="#1f2937" />
      {/* bucket scooping the gem */}
      <path
        d="M65 51 L75 47 L79 55 Q77 61 69 61 Z"
        fill="#6b7280"
        stroke="#1f2937"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M79 55 L81 57 M76 59 L78 61 M72 61 L73 63" stroke="#1f2937" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
