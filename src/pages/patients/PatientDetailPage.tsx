import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { PlanChip, PlanProgress, SessionChip, SessionDialog, SlotIssues } from '../../components/scheduling'
import { buttonClass, inputClass } from '../../components/styles'
import { Button, ButtonLink, ConfirmDialog, ErrorBanner, Field, Modal, Notice, Spinner, StatusBadge } from '../../components/ui'
import { toFriendlyError } from '../../lib/errors'
import {
  ageFrom, formatClock, formatDate, formatDays, formatPeso, formatVisit, initials, manilaIso, mapsUrl, telHref, todayIso,
} from '../../lib/format'
import { dischargePatient, getPatient, getPatientBalance, reactivatePatient } from '../../lib/patients'
import { listPlansForPatient } from '../../lib/plans'
import { createSingleSession, listUpcomingForPatient } from '../../lib/sessions'
import type { CarePlan, Patient, PatientBalance, Session } from '../../lib/types'
import { useSlotCheck } from '../../lib/useSlotCheck'

export function PatientDetailPage() {
  const { id } = useParams()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [balance, setBalance] = useState<PatientBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [plans, setPlans] = useState<CarePlan[]>([])
  const [upcoming, setUpcoming] = useState<Session[]>([])
  const [selected, setSelected] = useState<Session | null>(null)
  const [addVisitOpen, setAddVisitOpen] = useState(false)
  const [message, setMessage] = useState<{ text: string; extra?: string | null } | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getPatient(id), getPatientBalance(id), listPlansForPatient(id), listUpcomingForPatient(id)])
      .then(([p, b, pl, up]) => {
        if (cancelled) return
        setPatient(p)
        setBalance(b)
        setPlans(pl)
        setUpcoming(up)
        setLoadedAt(Date.now())
      })
      .catch((e) => !cancelled && setError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [id, reloadKey])

  async function toggleStatus() {
    if (!patient) return
    setStatusBusy(true)
    setStatusError(null)
    try {
      if (patient.status === 'active') {
        const cancelledVisits = await dischargePatient(patient.id)
        setMessage({ text: cancelledVisits ? `Discharged. ${cancelledVisits} future visit${cancelledVisits === 1 ? ' was' : 's were'} cancelled.` : 'Discharged.' })
      } else {
        await reactivatePatient(patient.id)
        setMessage({ text: 'Reactivated. Create a new plan to schedule visits.' })
      }
      setConfirmOpen(false)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setStatusError(toFriendlyError(e))
    } finally {
      setStatusBusy(false)
    }
  }

  const visitChanged = (m: { text: string; extra?: string | null }) => {
    setSelected(null)
    setAddVisitOpen(false)
    setMessage(m)
    setReloadKey((k) => k + 1)
  }

  if (error) {
    return (
      <section className="space-y-4">
        <BackLink />
        <ErrorBanner message={error} onRetry={() => { setError(null); setReloadKey((k) => k + 1) }} />
      </section>
    )
  }
  if (!patient) {
    return <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>
  }

  const p = patient
  const age = ageFrom(p.birth_date)
  const sex = p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : null
  const discharged = p.status === 'discharged'

  return (
    <section>
      <BackLink />

      {/* Header */}
      <div className="animate-rise mt-3 flex items-start gap-4">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl font-display text-2xl font-semibold ${
          discharged ? 'bg-paper-deep text-ink-soft' : 'bg-teal-700 text-white'
        }`}>
          {initials(p.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{p.full_name}</h1>
            <StatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-ink-soft">
            {[age !== null ? `${age} years old` : null, sex].filter(Boolean).join(' · ') || 'Age not recorded'}
          </p>
        </div>
      </div>

      {message && (
        <div className="mt-4">
          <Notice tone={message.extra ? 'warning' : 'success'} onDismiss={() => setMessage(null)}>
            <p>{message.text}</p>
            {message.extra && <p className="mt-1 text-ink-soft">{message.extra}</p>}
          </Notice>
        </div>
      )}

      {/* Quick actions — big targets for use on the doorstep */}
      <div className="animate-rise mt-5 grid grid-cols-3 gap-2 [animation-delay:60ms] sm:flex">
        <a href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm:px-5')}>
          <Icon name="map" className="h-4 w-4" /> Directions
        </a>
        {p.phone ? (
          <a href={telHref(p.phone)} className={buttonClass('secondary', 'sm:px-5')}>
            <Icon name="phone" className="h-4 w-4" /> Call
          </a>
        ) : (
          <span className={buttonClass('secondary', 'pointer-events-none opacity-50 sm:px-5')} aria-disabled>
            <Icon name="phone" className="h-4 w-4" /> No phone
          </span>
        )}
        <ButtonLink to={`/patients/${p.id}/edit`} variant="secondary" className="sm:px-5">
          <Icon name="edit" className="h-4 w-4" /> Edit
        </ButtonLink>
      </div>

      {p.precautions && (
        <div className="animate-rise mt-5 flex gap-3 rounded-2xl border border-clay-500/30 bg-clay-50 p-4 [animation-delay:100ms]">
          <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-clay-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-clay-600">Precautions</p>
            <p className="mt-1 whitespace-pre-line text-ink">{p.precautions}</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Home visit" delay={140}>
            <Row label="Address" value={p.address} multiline />
            <Row label="Landmark" value={p.landmark} />
          </Card>
          <Card title="Clinical" delay={180}>
            <Row label="Diagnosis" value={p.diagnosis} multiline />
            <Row label="Referring doctor" value={p.referring_doctor} />
          </Card>
          <Card title="Plans of care" delay={220} action={!discharged && (
            <Link to={`/patients/${p.id}/plans/new`} className="inline-flex items-center gap-1 text-sm font-semibold text-clay-600 hover:underline">
              <Icon name="plus" className="h-4 w-4" /> New plan
            </Link>
          )}>
            {plans.length === 0 ? (
              <p className="text-sm text-ink-soft">{discharged ? 'No plans.' : 'No plan yet. Create one to schedule visits automatically.'}</p>
            ) : (
              <ul className="space-y-3">
                {plans.map((pl) => (
                  <li key={pl.care_plan_id}>
                    <Link to={`/plans/${pl.care_plan_id}`} className="block rounded-xl border border-line p-3.5 transition hover:border-teal-600/40 hover:bg-paper/60">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{pl.goal || `${formatDays(pl.days_of_week)} · ${formatClock(pl.session_time)}`}</span>
                        <PlanChip status={pl.status} />
                      </div>
                      <PlanProgress done={pl.completed} noShow={pl.no_show} total={pl.total_sessions} />
                      <p className="mt-2 text-xs text-ink-faint">
                        {formatDays(pl.days_of_week)} · {formatClock(pl.session_time)}
                        {pl.next_session_at && <> · next <b className="text-teal-700">{formatVisit(pl.next_session_at)}</b></>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Upcoming visits" delay={260} action={!discharged && (
            <button onClick={() => setAddVisitOpen(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-clay-600 hover:underline">
              <Icon name="plus" className="h-4 w-4" /> One-off visit
            </button>
          )}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing scheduled.</p>
            ) : (
              <ul className="-mx-2">
                {upcoming.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => setSelected(v)} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-paper">
                      <span>
                        <span className="font-semibold">{formatVisit(v.starts_at)}</span>
                        <span className="ml-2 text-xs text-ink-faint">{v.care_plan_id ? `Session ${v.session_number ?? ''}` : 'One-off'}</span>
                      </span>
                      <SessionChip status={v.status} overdue={new Date(v.starts_at).getTime() < loadedAt} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Billing" delay={160}>
            <Row label="Default fee" value={formatPeso(p.default_fee)} />
            {balance && (
              <>
                <Row label="Charged" value={formatPeso(balance.total_charged)} />
                <Row label="Paid" value={formatPeso(balance.total_paid)} />
                <div className="mt-2 flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
                  <span className="text-sm font-medium">Balance</span>
                  <span className={`font-display text-xl font-semibold ${balance.balance > 0 ? 'text-clay-600' : 'text-moss-600'}`}>
                    {formatPeso(balance.balance)}
                  </span>
                </div>
              </>
            )}
          </Card>
          <Card title="Contact" delay={200}>
            <Row label="Phone" value={p.phone} href={p.phone ? telHref(p.phone) : undefined} />
            <Row label="Contact person" value={p.contact_person} />
            <Row label="Contact phone" value={p.contact_phone} href={p.contact_phone ? telHref(p.contact_phone) : undefined} />
          </Card>
          {p.notes && (
            <Card title="Notes" delay={240}>
              <p className="whitespace-pre-line text-sm text-ink">{p.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Discharge / reactivate */}
      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-faint">Added {formatDate(p.created_at)} · Updated {formatDate(p.updated_at)}</p>
        <button
          onClick={() => setConfirmOpen(true)}
          className={buttonClass(discharged ? 'secondary' : 'ghost', discharged ? '' : 'text-danger-600 hover:bg-danger-50 hover:text-danger-600')}
        >
          {discharged ? 'Reactivate patient' : 'Discharge patient'}
        </button>
      </div>
      {statusError && <div className="mt-3"><ErrorBanner message={statusError} /></div>}

      <ConfirmDialog
        open={confirmOpen}
        title={discharged ? `Reactivate ${p.full_name}?` : `Discharge ${p.full_name}?`}
        body={discharged
          ? 'They’ll appear in your active list again and new plans can be created.'
          : 'Their open plans and all future visits are cancelled. History, notes and payments are kept, and you can reactivate them anytime.'}
        confirmLabel={discharged ? 'Reactivate' : 'Discharge'}
        variant={discharged ? 'primary' : 'danger'}
        busy={statusBusy}
        onConfirm={toggleStatus}
        onCancel={() => setConfirmOpen(false)}
      />

      <SessionDialog session={selected} patientName={p.full_name} onClose={() => setSelected(null)} onDone={visitChanged} />
      {addVisitOpen && <AddVisitDialog patient={p} onClose={() => setAddVisitOpen(false)} onDone={visitChanged} />}
    </section>
  )
}

function BackLink() {
  return (
    <Link to="/patients" className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-teal-700">
      <Icon name="back" className="h-4 w-4" /> Patients
    </Link>
  )
}

function Card({ title, delay, action, children }: { title: string; delay: number; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl border border-line bg-card p-5 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {action}
      </div>
      <dl className="space-y-2.5">{children}</dl>
    </div>
  )
}

function Row({ label, value, multiline, href }: { label: string; value: string | null; multiline?: boolean; href?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`text-ink ${multiline ? 'whitespace-pre-line' : ''}`}>
        {value ? (href ? <a href={href} className="font-medium text-teal-700 underline underline-offset-2">{value}</a> : value)
               : <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  )
}

/** One-off visit (evaluation, extra session) outside any plan. */
function AddVisitDialog({ patient, onClose, onDone }: {
  patient: Patient
  onClose: () => void
  onDone: (m: { text: string }) => void
}) {
  const [date, setDate] = useState(todayIso())
  const [time, setTime] = useState('09:00')
  const [minutes, setMinutes] = useState('60')
  const [fee, setFee] = useState(patient.default_fee ? String(patient.default_fee) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mins = Number(minutes)
  const feeValue = fee.trim() === '' ? 0 : Number(fee)
  const valid = Boolean(date && time) && Number.isInteger(mins) && mins >= 15 && mins <= 240 && Number.isFinite(feeValue) && feeValue >= 0
  const startsAt = valid ? manilaIso(date, time) : null
  const slot = useSlotCheck(startsAt, mins)

  async function save() {
    if (!startsAt) return
    setBusy(true)
    setError(null)
    try {
      await createSingleSession({ patientId: patient.id, startsAt, durationMinutes: mins, fee: feeValue })
      onDone({ text: `Visit added on ${formatVisit(startsAt)}.` })
    } catch (e) {
      setError(toFriendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="One-off visit">
      <p className="text-sm text-ink-soft">For an evaluation or an extra visit outside the plan.</p>
      <div className="mt-4 space-y-4">
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
