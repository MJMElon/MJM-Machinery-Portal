import { useCallback, useEffect, useMemo, useState } from 'react'
import { companyByNumber, listCompanies } from './companies.js'
import { casePhotos, listCases } from './cases.js'
import { listMessages, signPaths } from './whatsapp.js'

const POLL_MS = 15000
export const UNASSIGNED = 'unassigned'

// Loads companies + pending/solved cases and keeps them fresh.
// A case belongs to a company when the number that opened it is in that
// company's WhatsApp numbers and the company has CMMS 2 access. Cases opened by
// numbers not listed under any company are "unassigned".
export function useCases() {
  const [companies, setCompanies] = useState([])
  const [pending, setPending] = useState([])
  const [solved, setSolved] = useState([])
  const [problems, setProblems] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [cos, p, s, pr] = await Promise.all([
        listCompanies().catch(() => []),
        listCases({ status: 'pending' }),
        listCases({ status: 'solved' }),
        listMessages({ filter: 'problems', limit: 50 }).catch(() => [])
      ])
      setCompanies(cos)
      setPending(p)
      setSolved(s)
      setProblems(pr)
      // Thumbnails: the first few photos of each case.
      const paths = [...p, ...s].flatMap((c) =>
        casePhotos(c)
          .slice(0, 3)
          .map((m) => m.storage_path)
      )
      setUrls(await signPaths(paths))
    } catch (e) {
      setError(e.message || 'Could not load cases.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const enabled = useMemo(() => companies.filter((c) => c.cmms_enabled), [companies])

  // Case → company key: a company id, UNASSIGNED, or null (company without CMMS access).
  const keyOf = useMemo(() => {
    const find = companyByNumber(companies)
    return (row) => {
      const c = find(row.wa_from)
      if (!c) return UNASSIGNED
      return c.cmms_enabled ? c.id : null
    }
  }, [companies])

  const forCompany = useCallback((rows, key) => rows.filter((r) => keyOf(r) === key), [keyOf])

  return { companies, enabled, pending, solved, problems, urls, loading, error, reload: load, keyOf, forCompany }
}
