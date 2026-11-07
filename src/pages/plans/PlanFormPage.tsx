import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { DayPicker } from '../../components/scheduling'
import { inputClass } from '../../components/styles'
import { Button, ErrorBanner, Field, Spinner } from '../../components/ui'
import { toFriendlyError } from '../../lib/errors'
import { addDays, formatDay, isoWeekday, todayIso } from '../../lib/format'
import { getPatient } from '../../lib/patients'
import { createPlan, getSettings } from '../../lib/plans'
import { describeFill } from '../../lib/scheduleText'
import type { Patient } from '../../lib/types'

type Errors = Partial<Record<'start' | 'total' | 'days' | 'time' | 'duration' | 'fee' | 'reeval', string>>

/** First and last date the plan would use, ignoring clashes (the database may skip some). */
function previewDates(start: string, days: number[], total: number): { first: string; last: string } | null {
  if (!start || days.length === 0 || !(total >= 1 && total <= 200)) return null
  const dates: string[] = []
  for (let d = start, i = 0; dates.length < total && i < 800; d = addDays(d, 1), i++) {
    if (days.includes(isoWeekday(d))) dates.push(d)
  }
  return { first: dates[0]!, last: dates[dates.length - 1]! }
}

export function PlanFormPage() {
  const { id: patientId } = useParams()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [start, setStart] = useState(todayIso())
  const [total, setTotal] = useState('12')
  const [days, setDays] = useState<number[]>([1, 3, 5])
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState('60')
  const [fee, setFee] = useState('')
  const [goal, setGoal] = useState('')
  const [reeval, setReeval] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    Promise.all([getPatient(patientId), getSettings()])
      .then(([p, s]) => {
        if (cancelled) return
        setPatient(p)
        setFee(p.default_fee ? String(p.default_fee) : '')
        setDuration(String(s.default_session_minutes))
      })
      .catch((e) => !cancelled && setLoadError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [patientId])

  const preview = useMemo(() => previewDates(start, days, Number(total)), [start, days, total])

  function validate(): Errors {
    const e: Errors = {}
    const n = Number(total), mins = Number(duration), f = fee.trim() === '' ? 0 : Number(fee)
    if (!start) e.start = 'Pick a start date.'
    if (!Number.isInteger(n) || n < 1 || n > 200) e.total = 'Between 1 and 200 sessions.'
    if (days.length === 0) e.days = 'Pick at least one day.'
    if (!time) e.time = 'Pick a time.'
    if (!Number.isInteger(mins) || mins < 15 || mins > 240) e.duration = 'Between 15 and 240 minutes.'
    if (!Number.isFinite(f) || f < 0 || !/^\d*(\.\d{1,2})?$/.test(fee.trim())) e.fee = 'Enter a valid amount.'
    if (reeval && start && reeval < start) e.reeval = 'Must be on or after the start date.'
    return e
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await createPlan({
        patientId: patientId!, startDate: start, totalSessions: Number(total), daysOfWeek: days,
        sessionTime: time, durationMinutes: Number(duration), feePerSession: fee.trim() ? Number(fee) : 0,
        goal: goal.trim() || null, reevaluationDate: reeval || null,
      })
      const fill = describeFill(result, 'created')
      navigate(`/plans/${result.care_plan_id}`, { replace: true, state: { message: { text: fill.text, extra: fill.skipped } } })
    } catch (e) {
      setSaveError(toFriendlyError(e))
      setSaving(false)
    }
  }

  if (loadError) return <ErrorBanner message={loadError} />
  if (!patient) return <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>

  return (
    <section>
      <Link to={`/patients/${patientId}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-teal-700">
        <Icon name="back" className="h-4 w-4" /> {patient.full_name}
      </Link>
      <h1 className="animate-rise mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">New plan of care</h1>
      <p className="mt-1 text-sm text-ink-soft">Visits are created automatically. Times that clash with another visit are skipped and moved to the next free day.</p>

      {patient.status === 'discharged' ? (
        <div className="mt-6"><ErrorBanner message="This patient is discharged. Reactivate them first." /></div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
          <fieldset className="animate-rise space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6">
            <legend className="sr-only">Schedule</legend>
            <p className="font-display text-lg font-semibold" aria-hidden>Schedule</p>
            <Field label="Days" htmlFor="days" error={errors.days}>
              <DayPicker value={days} onChange={setDays} invalid={Boolean(errors.days)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time" htmlFor="time" error={errors.time}>
                <input id="time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass(Boolean(errors.time))} />
              </Field>
              <Field label="Length (min)" htmlFor="duration" error={errors.duration}>
                <input id="duration" type="number" inputMode="numeric" min={15} max={240} step={5} value={duration}
                       onChange={(e) => setDuration(e.target.value)} className={`${inputClass(Boolean(errors.duration))} h-12`} />
              </Field>
              <Field label="Start date" htmlFor="start" error={errors.start} hint={start < todayIso() ? 'Past start: earlier visits are added so you can mark them done.' : undefined}>
                <input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass(Boolean(errors.start))} />
              </Field>
              <Field label="Sessions" htmlFor="total" error={errors.total}>
                <input id="total" type="number" inputMode="numeric" min={1} max={200} value={total}
                       onChange={(e) => setTotal(e.target.value)} className={`${inputClass(Boolean(errors.total))} h-12`} />
              </Field>
            </div>
            {preview && (
              <p className="rounded-xl bg-paper px-3.5 py-2.5 text-sm text-ink-soft">
                <b className="text-ink">{total} visits</b>, about {formatDay(preview.first)} → {formatDay(preview.last)}
              </p>
            )}
          </fieldset>

          <fieldset className="animate-rise space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card [animation-delay:60ms] sm:p-6">
            <legend className="sr-only">Details</legend>
            <p className="font-display text-lg font-semibold" aria-hidden>Details</p>
            <Field label="Fee per session (₱)" htmlFor="fee" error={errors.fee} hint="Copied from the patient’s default fee.">
              <input id="fee" type="number" inputMode="decimal" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)}
                     className={`${inputClass(Boolean(errors.fee))} h-12`} />
            </Field>
            <Field label="Goal" htmlFor="goal" optional>
              <textarea id="goal" rows={2} maxLength={500} value={goal} onChange={(e) => setGoal(e.target.value)}
                        placeholder="Independent walking with a cane" className={`${inputClass()} py-3`} />
            </Field>
            <Field label="Re-evaluation date" htmlFor="reeval" error={errors.reeval} optional>
              <input id="reeval" type="date" min={start} value={reeval} onChange={(e) => setReeval(e.target.value)} className={inputClass(Boolean(errors.reeval))} />
            </Field>
          </fieldset>

          {saveError && <ErrorBanner message={saveError} />}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
            <Link to={`/patients/${patientId}`} className="inline-flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-ink-soft hover:bg-card md:flex-none md:px-5">Cancel</Link>
            <Button type="submit" loading={saving} className="flex-[2] md:flex-none md:px-8">Create plan</Button>
          </div>
        </form>
      )}
    </section>
  )
}
