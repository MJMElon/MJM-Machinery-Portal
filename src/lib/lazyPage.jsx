import { Component, lazy } from 'react'

// Pages are loaded on first use (one file each). After a new version goes live
// (GitHub Pages replaces every file), a page that was already open still asks
// for the OLD file names, which are gone: the page would stay blank until it is
// opened again. So when a page file cannot be loaded, reload once to get the new
// version (at most once a minute, so a real network problem does not loop).

const KEY = 'app.reloaded-for-update'

export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* no storage: still reload */
  }
  window.location.reload()
  return true
}

/** React.lazy that reloads the app once when the page file is gone (new version live). */
export const lazyPage = (load) =>
  lazy(() =>
    load().catch((err) => {
      if (reloadForUpdate()) return new Promise(() => {}) // keep the spinner while the page reloads
      throw err
    })
  )

// Vite: a page's helper files failed to load → same reload.
if (typeof window !== 'undefined')
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForUpdate()) e.preventDefault()
  })

/** Anything that still fails while showing a page: a message with Reload instead of a blank page. */
export class PageErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-base font-semibold text-slate-800">This page could not be opened.</p>
        <p className="text-sm text-slate-500">A newer version may have just gone live.</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          Reload
        </button>
      </div>
    )
  }
}
