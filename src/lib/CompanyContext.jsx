import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { groupByBusiness, listBusinesses, listCompanies } from './companies.js'

// The company the user is working in (chosen in the top bar). Every module on
// the main page works on this company. Companies are grouped by business, the
// same way MJM Intranet shows them.
const CompanyContext = createContext(null)
const KEY = 'portal.company'

// MJM Intranet opens CMMS 2 with the company chosen there in the link:
// ?gw_company=<code or name>&gw_company_name=<name>&gw_company_short=<short>.
// Read once at start-up (before anything rewrites the address bar) and the
// matching company is selected as soon as the list is loaded.
const WANTED = readWantedCompany()
function readWantedCompany() {
  const pick = (params) => {
    const w = { company: params.get('gw_company'), name: params.get('gw_company_name'), short: params.get('gw_company_short') }
    return w.company || w.name || w.short ? w : null
  }
  try {
    const fromSearch = pick(new URLSearchParams(window.location.search))
    if (fromSearch) return fromSearch
    const i = window.location.hash.indexOf('?')
    return i >= 0 ? pick(new URLSearchParams(window.location.hash.slice(i + 1))) : null
  } catch {
    return null
  }
}
function dropWantedFromUrl() {
  try {
    const url = new URL(window.location.href)
    for (const k of ['gw_company', 'gw_company_name', 'gw_company_short']) url.searchParams.delete(k)
    const i = url.hash.indexOf('?')
    if (i >= 0) {
      const params = new URLSearchParams(url.hash.slice(i + 1))
      for (const k of ['gw_company', 'gw_company_name', 'gw_company_short']) params.delete(k)
      const rest = params.toString()
      url.hash = url.hash.slice(0, i) + (rest ? '?' + rest : '')
    }
    window.history.replaceState(null, '', url.toString())
  } catch {
    /* ignore */
  }
}
const key = (v) => String(v || '').trim().toLowerCase()
/** The company the Intranet asked for, matched by code, name, short name or Intranet id. */
function matchWanted(companies, wanted) {
  if (!wanted) return null
  const asks = [wanted.company, wanted.name, wanted.short].map(key).filter(Boolean)
  return (
    companies.find((c) => [c.code, c.intranet_id, c.name, c.short_name].map(key).some((v) => v && asks.includes(v))) ||
    null
  )
}

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [businesses, setBusinesses] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [currentId, setCurrentId] = useState(() => read())

  const reload = useCallback(async () => {
    try {
      const [cos, biz] = await Promise.all([listCompanies(), listBusinesses()])
      setCompanies(cos)
      setBusinesses(biz)
      setError('')
      // Opened from the Intranet with a company: switch to it (once).
      if (WANTED && !WANTED.done) {
        WANTED.done = true
        const hit = matchWanted(cos, WANTED)
        if (hit) {
          setCurrentId(hit.id)
          write(hit.id)
        }
        dropWantedFromUrl()
      }
    } catch (e) {
      setError(e.message || 'Could not load companies.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Inactive companies are kept for history but not offered in the switcher.
  const active = useMemo(() => companies.filter((c) => c.is_active !== false), [companies])
  const groups = useMemo(() => groupByBusiness(businesses, active), [businesses, active])
  const current = companies.find((c) => c.id === currentId) || active[0] || null
  const businessesOf = useCallback(
    (c) => businesses.filter((b) => (c?.business_ids || []).includes(b.id)),
    [businesses]
  )
  const select = useCallback((id) => {
    setCurrentId(id)
    write(id)
  }, [])

  return (
    <CompanyContext.Provider
      value={{ companies, businesses, groups, current, businessesOf, select, reload, loaded, error }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export const useCompany = () => useContext(CompanyContext)

function read() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function write(id) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // ignore (private mode)
  }
}
