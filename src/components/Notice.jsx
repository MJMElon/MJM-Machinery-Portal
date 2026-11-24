import { useCallback, useEffect, useRef, useState } from 'react'
import { EMBEDDED } from './Shell.jsx'

// A small notice at the top right (under the Log out button), e.g. "Claim 005
// approved": counts down a few seconds, then disappears by itself. Click it to
// close it sooner.
//   const [notice, notify] = useNotice()
//   notify('Claim 005 approved', 'Sub line', 'green', undoFn)   … and render {notice}
// With undoFn the notice has an Undo button (on its right) while it counts down.

const SECONDS = 5
const TONES = {
  green: ['bg-emerald-500', 'text-emerald-600'],
  red: ['bg-red-500', 'text-red-600'],
  blue: ['bg-sky-500', 'text-sky-600']
}

export function useNotice() {
  const [item, setItem] = useState(null) // { id, title, sub, tone }
  const notify = useCallback((title, sub = '', tone = 'green', onUndo = null) => setItem({ id: Date.now() + Math.random(), title, sub, tone, onUndo }), [])
  // closing a notice never closes a newer one (e.g. the "undone" notice shown by Undo)
  const node = item ? <Notice key={item.id} {...item} onDone={() => setItem((it) => (it && it.id === item.id ? null : it))} /> : null
  return [node, notify]
}

function Notice({ title, sub, tone, onUndo, onDone }) {
  const [undoing, setUndoing] = useState(false)
  const [left, setLeft] = useState(SECONDS)
  const [run, setRun] = useState(false)
  const done = useRef(onDone)
  done.current = onDone
  const undoingRef = useRef(false)
  undoingRef.current = undoing
  useEffect(() => {
    const start = requestAnimationFrame(() => setRun(true)) // start the shrinking bar
    const tick = setInterval(() => setLeft((s) => s - 1), 1000)
    const end = setTimeout(() => !undoingRef.current && done.current(), SECONDS * 1000)
    return () => {
      cancelAnimationFrame(start)
      clearInterval(tick)
      clearTimeout(end)
    }
  }, [])
  const [bar, ink] = TONES[tone] || TONES.green
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => done.current()}
      className={`fixed right-4 z-[70] w-96 max-w-[calc(100vw-2rem)] cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${EMBEDDED ? 'top-3' : 'top-24'}`}
      title="Close"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${bar} text-white`}>
          {tone === 'red' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          {sub && <span className="mt-0.5 block text-xs text-slate-500">{sub}</span>}
        </span>
        <span className={`shrink-0 pt-0.5 text-xs font-semibold tabular-nums ${ink}`}>{Math.max(left, 0)}s</span>
        {onUndo && (
          <button
            type="button"
            disabled={undoing}
            onClick={async (e) => {
              e.stopPropagation()
              setUndoing(true)
              try {
                await onUndo()
              } finally {
                done.current()
              }
            }}
            className="-my-1 shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {undoing ? 'Undoing…' : 'Undo'}
          </button>
        )}
      </div>
      <div className="h-1 bg-slate-100">
        <div className={`h-full ${bar} ease-linear`} style={{ width: run ? '0%' : '100%', transition: `width ${SECONDS}s linear` }} />
      </div>
    </div>
  )
}
