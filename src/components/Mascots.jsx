import { useEffect, useState } from 'react'

// Little machines that drive along the bottom of the page now and then: a
// tractor and an excavator (our own drawings). One run every minute or so,
// never over the page content (pointer events pass through), and off when
// the person prefers reduced motion.
const CHARACTERS = ['tractor', 'excavator']

export default function Mascots() {
  const [run, setRun] = useState(null) // { id, who, time }

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let timer
    let n = 0
    const next = (delay) => {
      timer = setTimeout(() => {
        const who = CHARACTERS[n++ % CHARACTERS.length]
        const time = 22 + Math.round(Math.random() * 12)
        setRun({ id: n, who, time })
        next((time + 35 + Math.random() * 40) * 1000)
      }, delay)
    }
    next(6000)
    return () => clearTimeout(timer)
  }, [])

  if (!run) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-1 z-10 h-16 overflow-hidden print:hidden" aria-hidden="true">
      <div key={run.id} className="mascot-drive absolute bottom-0 left-0" style={{ '--mascot-time': `${run.time}s` }} onAnimationEnd={() => setRun(null)}>
        <div className="mascot-bob">{run.who === 'tractor' ? <Tractor /> : <Excavator />}</div>
      </div>
    </div>
  )
}

function Tractor() {
  return (
    <svg width="110" height="60" viewBox="0 0 110 60" fill="none">
      {/* cab + bonnet */}
      <path d="M40 40V14h22l6 12h14v14z" fill="#16a34a" />
      <path d="M44 18h14l4 8H44z" fill="#bfdbfe" />
      <rect x="20" y="30" width="24" height="10" rx="2" fill="#15803d" />
      <rect x="62" y="30" width="22" height="10" rx="2" fill="#15803d" />
      <rect x="26" y="8" width="3" height="10" rx="1" fill="#475569" />
      {/* small front wheel */}
      <g className="mascot-wheel">
        <circle cx="82" cy="44" r="9" fill="#1e293b" />
        <circle cx="82" cy="44" r="4" fill="#cbd5e1" />
        <path d="M82 36v16M74 44h16" stroke="#94a3b8" strokeWidth="1.5" />
      </g>
      {/* big rear wheel */}
      <g className="mascot-wheel">
        <circle cx="36" cy="40" r="16" fill="#1e293b" />
        <circle cx="36" cy="40" r="7" fill="#cbd5e1" />
        <path d="M36 24v32M20 40h32M25 29l22 22M47 29L25 51" stroke="#94a3b8" strokeWidth="1.5" />
      </g>
      {/* eyes on the cab window */}
      <circle cx="50" cy="22" r="1.6" fill="#1e293b" />
      <circle cx="56" cy="22" r="1.6" fill="#1e293b" />
    </svg>
  )
}

function Excavator() {
  return (
    <svg width="130" height="64" viewBox="0 0 130 64" fill="none">
      {/* tracks */}
      <rect x="18" y="42" width="60" height="16" rx="8" fill="#1e293b" />
      <rect x="22" y="46" width="52" height="8" rx="4" fill="#475569" />
      <g className="mascot-wheel">
        <circle cx="28" cy="50" r="5" fill="#cbd5e1" />
        <path d="M28 45v10M23 50h10" stroke="#64748b" strokeWidth="1.2" />
      </g>
      <g className="mascot-wheel">
        <circle cx="68" cy="50" r="5" fill="#cbd5e1" />
        <path d="M68 45v10M63 50h10" stroke="#64748b" strokeWidth="1.2" />
      </g>
      {/* body + cab */}
      <rect x="22" y="26" width="48" height="16" rx="4" fill="#f59e0b" />
      <path d="M26 26v-12h18v12z" fill="#fbbf24" />
      <path d="M29 17h12v7H29z" fill="#bfdbfe" />
      <circle cx="33" cy="20" r="1.5" fill="#1e293b" />
      <circle cx="38" cy="20" r="1.5" fill="#1e293b" />
      {/* arm + bucket, swinging */}
      <g className="mascot-arm">
        <path d="M60 30l26-16" stroke="#d97706" strokeWidth="6" strokeLinecap="round" />
        <path d="M86 14l24 18" stroke="#d97706" strokeWidth="5" strokeLinecap="round" />
        <path d="M108 30l10 2-6 10-10-6z" fill="#475569" />
      </g>
    </svg>
  )
}
