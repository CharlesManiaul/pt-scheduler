import { useEffect, useState } from 'react'
import { toFriendlyError } from '../lib/errors'
import { formatVisit, manilaIso, todayIso } from '../lib/format'
import { getPatient, listPatients } from '../lib/patients'
import { getSettings } from '../lib/plans'
import { createSingleSession } from '../lib/sessions'
import type { PatientListItem } from '../lib/types'
import { useSlotCheck } from '../lib/useSlotCheck'
import { Icon } from './Icon'
import { SlotIssues } from './scheduling'
import { inputClass } from './styles'
import { Button, ErrorBanner, Field, Modal } from './ui'

type PickedPatient = { id: string; full_name: string; default_fee: number | null }

/**
 * One-off visit (evaluation, extra session) outside any plan.
 * With `patient` it's for that patient (patient page); without, it shows a
 * patient picker first (calendar: tap an empty time slot).
 */
export function AddVisitDialog({ patient, initialDate, initialTime, onClose, onDone }: {
  patient?: PickedPatient
  initialDate?: string
  initialTime?: string
  onClose: () => void
  onDone: (m: { text: string }) => void
}) {
  const [picked, setPicked] = useState<PickedPatient | null>(patient ?? null)
  const [date, setDate] = useState(initialDate ?? todayIso())
  const [time, setTime] = useState(initialTime ?? '09:00')
  const [minutes, setMinutes] = useState('60')
  const [fee, setFee] = useState(patient?.default_fee ? String(patient.default_fee) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // default visit length from Settings
  useEffect(() => {
    let cancelled = false
    getSettings().then((s) => !cancelled && setMinutes(String(s.default_session_minutes))).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const mins = Number(minutes)
  const feeValue = fee.trim() === '' ? 0 : Number(fee)
  const valid = Boolean(picked && date && time) && Number.isInteger(mins) && mins >= 15 && mins <= 240 && Number.isFinite(feeValue) && feeValue >= 0
  const startsAt = date && time ? manilaIso(date, time) : null
  const slot = useSlotCheck(valid ? startsAt : null, mins)

  async function save() {
    if (!picked || !startsAt) return
    setBusy(true)
    setError(null)
    try {
      await createSingleSession({ patientId: picked.id, startsAt, durationMinutes: mins, fee: feeValue })
      onDone({ text: `Visit for ${picked.full_name} added on ${formatVisit(startsAt)}.` })
    } catch (e) {
      setError(toFriendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={patient ? 'One-off visit' : 'New visit'}>
      <p className="text-sm text-ink-soft">For an evaluation or an extra visit outside a plan.</p>

      <div className="mt-4 space-y-4">
        {!patient && (
          <PatientPicker
            value={picked}
            onChange={(p) => {
              setPicked(p)
              setFee('')
              // the list doesn't carry fees; fetch the picked patient's default fee
              if (p) getPatient(p.id).then((full) => setFee(full.default_fee ? String(full.default_fee) : '')).catch(() => {})
            }}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="ov_date"><input id="ov_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass()} /></Field>
          <Field label="Time" htmlFor="ov_time"><input id="ov_time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass()} /></Field>
          <Field label="Minutes" htmlFor="ov_min"><input id="ov_min" type="number" inputMode="numeric" min={15} max={240} step={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${inputClass()} h-12`} /></Field>
          <Field label="Fee (₱)" htmlFor="ov_fee"><input id="ov_fee" type="number" inputMode="decimal" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className={`${inputClass()} h-12`} /></Field>
        </div>
        {valid && <SlotIssues {...slot} />}
      </div>

      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} disabled={!valid || slot.hasOverlap || slot.checking} onClick={save}>Add visit</Button>
      </div>
    </Modal>
  )
}

/** Type-ahead search over active patients (max 8 suggestions). */
function PatientPicker({ value, onChange }: { value: PickedPatient | null; onChange: (p: PickedPatient | null) => void }) {
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
