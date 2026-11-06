import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { groupByBusiness, listBusinesses, listCompanies } from './companies.js'

// The company the user is working in (chosen in the top bar). Every module on
// the main page works on this company. Companies are grouped by business, the
// same way MJM Connect (the Intranet) shows them.
const CompanyContext = createContext(null)
const KEY = 'portal.company'

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
