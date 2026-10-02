import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { listCompanies } from './companies.js'

// The company the user is working in (chosen in the top bar). Every module on
// the main page works on this company.
const CompanyContext = createContext(null)
const KEY = 'portal.company'

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [currentId, setCurrentId] = useState(() => read())

  const reload = useCallback(async () => {
    try {
      setCompanies(await listCompanies())
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

  const current = companies.find((c) => c.id === currentId) || companies[0] || null
  const select = useCallback((id) => {
    setCurrentId(id)
    write(id)
  }, [])

  return (
    <CompanyContext.Provider value={{ companies, current, select, reload, loaded, error }}>
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
