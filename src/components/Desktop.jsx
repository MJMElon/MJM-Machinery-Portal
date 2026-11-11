import { ModuleTile, TileGrid } from './ModuleTile.jsx'
import { useWindows } from './Windows.jsx'

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
