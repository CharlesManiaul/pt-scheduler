import { useEffect, useState } from 'react'
import { listPatients } from '../lib/patients'
import type { PatientListItem } from '../lib/types'
import { Icon } from './Icon'
import { inputClass } from './styles'
import { Field } from './ui'

export type PickedPatient = { id: string; full_name: string; default_fee: number | null }

/** Type-ahead search over active patients (max 8 suggestions). */
export function PatientPicker({ value, onChange }: { value: PickedPatient | null; onChange: (p: PickedPatient | null) => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ term: string; items: PatientListItem[] } | null>(null)
  const term = search.trim()

  useEffect(() => {
    if (value || term.length < 2) return
    let cancelled = false
    const t = setTimeout(() => {
      listPatients({ search: term, status: 'active', page: 0 })
        .then((r) => !cancelled && setResults({ term, items: r.items.slice(0, 8) }))
        .catch(() => !cancelled && setResults({ term, items: [] }))
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [term, value])

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-teal-600/30 bg-teal-600/5 px-4 py-3">
        <span className="font-semibold">{value.full_name}</span>
        <button type="button" onClick={() => { onChange(null); setSearch('') }} className="text-sm font-medium text-clay-600 hover:underline">Change</button>
      </div>
    )
  }

  const items = results && results.term === term ? results.items : null
  return (
    <Field label="Patient" htmlFor="ov_patient">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-ink-faint" />
        <input id="ov_patient" type="search" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Type a name" className={`${inputClass()} h-12 pl-11`} />
      </div>
      {term.length >= 2 && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line bg-card">
          {items === null && <li className="px-4 py-3 text-sm text-ink-faint">Searching…</li>}
          {items?.length === 0 && <li className="px-4 py-3 text-sm text-ink-faint">No active patient by that name.</li>}
          {items?.map((p) => (
            <li key={p.id}>
              <button type="button"
                      onClick={() => onChange({ id: p.id, full_name: p.full_name, default_fee: null })}
                      className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-paper">
                <span className="text-sm font-semibold">{p.full_name}</span>
                <span className="truncate text-xs text-ink-faint">{p.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
