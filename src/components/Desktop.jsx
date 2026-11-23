import { ModuleTile, TileGrid } from './ModuleTile.jsx'
import { useWindows } from './Windows.jsx'
import { IconChevron } from './icons.jsx'

// A "desktop" of module icons; clicking one opens the module in a window
// (see Windows.jsx). modules: [{ key, label, Icon, path, href?, disabled?, note? }]
export function Desktop({ modules, orderKey }) {
  const { open } = useWindows()
  return (
    <div className="pt-2 sm:pt-6">
      <TileGrid orderKey={orderKey}>
        {modules.map((m) => (
          <ModuleTile key={m.key} onClick={m.disabled ? undefined : () => open(m)} label={m.label} Icon={m.Icon} disabled={m.disabled} note={m.note} />
        ))}
      </TileGrid>
    </div>
  )
}

/**
 * Modules as a list of wide buttons, top to bottom: icon on the left, the
 * module name beside it, an arrow on the right. Each opens in a window.
 * Press and hold one to move the buttons into another order (remembered
 * per user in this browser, under orderKey). modules: as for Desktop.
 */
export function ModuleList({ modules, orderKey, columns = 1 }) {
  const { open } = useWindows()
  return (
    <div className="pt-2 sm:pt-8">
      <TileGrid orderKey={orderKey} layout={columns === 2 ? 'list2' : 'list'}>
        {modules.map((m) => (
          <ModuleRow key={m.key} m={m} onOpen={() => open(m)} />
        ))}
      </TileGrid>
    </div>
  )
}

function ModuleRow({ m, onOpen }) {
  const name = String(m.label).replace(/\n/g, ' ')
  const inner = (
    <>
      <m.Icon className="block h-12 w-12 shrink-0" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-base font-semibold tracking-tight text-slate-800">{name}</span>
        {m.note && <span className="block text-xs font-medium text-slate-400">{m.note}</span>}
      </span>
      {!m.disabled && <IconChevron width={20} height={20} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand" />}
    </>
  )
  const cls = 'flex h-[72px] w-full select-none items-center gap-4 rounded-2xl border px-4 shadow-sm'
  return m.disabled ? (
    <div className={`${cls} border-slate-200 bg-white/50 opacity-60 grayscale`} aria-disabled="true">
      {inner}
    </div>
  ) : (
    <button
      type="button"
      onClick={onOpen}
      draggable={false}
      className={`${cls} group border-white bg-white/90 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.99]`}
    >
      {inner}
    </button>
  )
}
