import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Card } from '../../components/ui.jsx'
import { IconChevron, IconExternal, IconImage, IconList } from '../../components/icons.jsx'
import { countToReview } from '../../lib/whatsapp.js'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

// Machinery module home. MachTrek is linked, not embedded — it stays its own
// app and is not modified by this portal.
export default function MachineryHome() {
  const [toReview, setToReview] = useState(null)
  useEffect(() => {
    countToReview().then(setToReview).catch(() => setToReview(null))
  }, [])

  return (
    <div className="space-y-3">
      <PageHeader title="Machinery" subtitle="All companies" />

      <Link to="/machinery/photos">
        <Card className="flex items-center gap-3 p-4 active:bg-slate-50">
          <Tile Icon={IconImage} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              Incoming Photos
              {toReview > 0 && <Badge color="amber">{toReview} to review</Badge>}
            </span>
            <span className="block truncate text-sm text-slate-500">Photos sent to the WhatsApp number</span>
          </span>
          <IconChevron width={20} height={20} className="text-slate-500" />
        </Card>
      </Link>

      <a href={MACHTREK_URL} target="_blank" rel="noopener noreferrer" className="block">
        <Card className="flex items-center gap-3 p-4 active:bg-slate-50">
          <Tile Icon={IconList} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-800">MachTrek</span>
            <span className="block truncate text-sm text-slate-500">Work records, rates, payroll (opens MachTrek)</span>
          </span>
          <IconExternal width={20} height={20} className="text-slate-500" />
        </Card>
      </a>
    </div>
  )
}

function Tile({ Icon }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
      <Icon width={26} height={26} />
    </span>
  )
}
