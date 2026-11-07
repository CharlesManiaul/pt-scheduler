import { useEffect, useState } from 'react'
import { toFriendlyError } from '../lib/errors'
import { formatVisit, manilaIso, todayIso } from '../lib/format'
import { getPatient } from '../lib/patients'
import { getSettings } from '../lib/plans'
import { createSingleSession } from '../lib/sessions'
import { useSlotCheck } from '../lib/useSlotCheck'
import { PatientPicker, type PickedPatient } from './PatientPicker'
import { SlotIssues } from './scheduling'
import { inputClass } from './styles'
import { Button, ErrorBanner, Field, Modal } from './ui'

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

