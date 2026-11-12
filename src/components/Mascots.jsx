import { useEffect, useState } from 'react'

// Machines driving along the bottom of the main page, one after another:
// an excavator, a lorry, a tractor and a bulldozer (plain side views), picked
// at random each time. Never over the page content (pointer events pass
// through), and off when the person prefers reduced motion.
export const MACHINES = { excavator: Excavator, lorry: Lorry, tractor: Tractor, bulldozer: Bulldozer }
const NAMES = Object.keys(MACHINES)

const pick = (not) => {
  const pool = NAMES.filter((n) => n !== not)
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function Mascots() {
  const [run, setRun] = useState(null) // { id, who, time }

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    setRun({ id: 1, who: pick(), time: 26 })
  }, [])

  if (!run) return null
  const Machine = MACHINES[run.who]
  // The next one sets off as soon as this one has gone.
  const next = () => setRun((r) => ({ id: r.id + 1, who: pick(r.who), time: 24 + Math.round(Math.random() * 10) }))
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-1 z-10 h-12 overflow-hidden print:hidden" aria-hidden="true">
      <div key={run.id} className="mascot-drive absolute bottom-0 left-0" style={{ '--mascot-time': `${run.time}s` }} onAnimationEnd={next}>
        <Machine />
      </div>
    </div>
  )
}

const Wheel = ({ cx, cy, r }) => (
  <g className="mascot-wheel">
    <circle cx={cx} cy={cy} r={r} fill="#1e293b" />
    <circle cx={cx} cy={cy} r={r * 0.45} fill="#94a3b8" />
    <path d={`M${cx} ${cy - r * 0.8}v${r * 1.6}M${cx - r * 0.8} ${cy}h${r * 1.6}`} stroke="#64748b" strokeWidth="1" />
  </g>
)

// Tracks: a rounded band with two rollers.
const Tracks = ({ x, y, w, h = 12 }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#1e293b" />
    <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx={(h - 6) / 2} fill="#475569" />
    <Wheel cx={x + h / 2 + 2} cy={y + h / 2} r={h / 2 - 2} />
    <Wheel cx={x + w - h / 2 - 2} cy={y + h / 2} r={h / 2 - 2} />
  </g>
)

function Excavator() {
  return (
    <svg width="96" height="44" viewBox="0 0 96 44" fill="none">
      <Tracks x={10} y={30} w={50} />
      <rect x={14} y={19} width={40} height={11} rx={2} fill="#ca8a04" />
      <path d="M18 19v-9h14v9z" fill="#eab308" />
      <rect x={21} y={12} width={8} height={5} fill="#cbd5e1" />
      {/* boom and stick, bucket down */}
      <path d="M44 22l22-13" stroke="#a16207" strokeWidth="5" strokeLinecap="round" />
      <path d="M66 9l18 16" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
      <path d="M82 23l8 1-4 8-8-4z" fill="#475569" />
    </svg>
  )
}

function Lorry() {
  return (
    <svg width="104" height="44" viewBox="0 0 104 44" fill="none">
      {/* tipper body and cab */}
      <path d="M30 12h66l-4 20H30z" fill="#64748b" />
      <rect x={30} y={30} width={66} height={4} fill="#334155" />
      <path d="M6 34V18l6-9h18v25z" fill="#dc2626" />
      <path d="M13 12h10v8H13z" fill="#cbd5e1" />
      <rect x={4} y={32} width={94} height={3} rx={1} fill="#1e293b" />
      <Wheel cx={18} cy={37} r={6} />
      <Wheel cx={60} cy={37} r={6} />
      <Wheel cx={76} cy={37} r={6} />
    </svg>
  )
}

function Tractor() {
  return (
    <svg width="84" height="44" viewBox="0 0 84 44" fill="none">
      {/* cab over the big rear wheel, bonnet to the front */}
      <path d="M22 30V10h18l5 10h16v10z" fill="#15803d" />
      <path d="M26 14h12l3 6H26z" fill="#cbd5e1" />
      <rect x={52} y={11} width={2.5} height={9} rx={1} fill="#475569" />
      <Wheel cx={60} cy={35} r={7} />
      <Wheel cx={30} cy={30} r={12} />
    </svg>
  )
}

function Bulldozer() {
  return (
    <svg width="92" height="44" viewBox="0 0 92 44" fill="none">
      <Tracks x={20} y={30} w={48} h={13} />
      <rect x={24} y={20} width={40} height={10} rx={2} fill="#ca8a04" />
      <path d="M38 20v-10h16v10z" fill="#eab308" />
      <rect x={41} y={12} width={10} height={6} fill="#cbd5e1" />
      <rect x={26} y={24} width={14} height={4} rx={1} fill="#854d0e" />
      {/* push arms and blade */}
      <path d="M26 25H12M26 31H12" stroke="#a16207" strokeWidth="3" strokeLinecap="round" />
      <path d="M8 14q-7 10-2 28h8q-4-16 0-28z" fill="#475569" />
    </svg>
  )
}
