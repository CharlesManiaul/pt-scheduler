import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { DayPicker, PlanChip, PlanProgress, SessionChip, SessionDialog } from '../../components/scheduling'
import { buttonClass, inputClass } from '../../components/styles'
import { Button, ConfirmDialog, ErrorBanner, Field, Modal, Notice, Spinner } from '../../components/ui'
import { toFriendlyError } from '../../lib/errors'
import { formatClock, formatDate, formatDays, formatPeso, formatVisit } from '../../lib/format'
import { cancelPlan, extendPlan, getPlan, setPlanOnHold, updatePlanDetails, updatePlanSchedule } from '../../lib/plans'
import { describeFill } from '../../lib/scheduleText'
import { listPlanSessions } from '../../lib/sessions'
import type { CarePlan, Session } from '../../lib/types'

type Message = { text: string; extra?: string | null }
type Dialog = null | 'extend' | 'schedule' | 'details' | 'hold' | 'cancel'

export function PlanDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [plan, setPlan] = useState<CarePlan | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [message, setMessage] = useState<Message | null>((location.state as { message?: Message } | null)?.message ?? null)
  const [selected, setSelected] = useState<Session | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [loadedAt, setLoadedAt] = useState(0)   // time of the last load; splits past/upcoming

  // the success message came in via navigation state; clear it so a refresh doesn't repeat it
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getPlan(id), listPlanSessions(id)])
      .then(([p, s]) => { if (!cancelled) { setPlan(p); setSessions(s); setError(null); setLoadedAt(Date.now()) } })
      .catch((e) => !cancelled && setError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [id, reloadKey])

  const done = (m: Message) => {
    setSelected(null)
    setDialog(null)
    setMessage(m)
    setReloadKey((k) => k + 1)
  }

  if (error && !plan) return <ErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!plan) return <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>

  const now = loadedAt
  const overdue = sessions.filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() < now)
  const upcoming = sessions.filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() >= now)
  const finished = sessions.filter((s) => s.status === 'completed' || s.status === 'no_show').reverse()
  const cancelledList = sessions.filter((s) => s.status === 'cancelled')
  const editable = plan.status === 'active'

  return (
    <section>
      <Link to={`/patients/${plan.patient_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-teal-700">
        <Icon name="back" className="h-4 w-4" /> {plan.patient_name}
      </Link>

      <div className="animate-rise mt-2 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Plan of care</h1>
        <PlanChip status={plan.status} />
      </div>
      {plan.goal && <p className="mt-1 text-ink-soft">{plan.goal}</p>}

      {message && (
        <div className="mt-4">
          <Notice tone={message.extra ? 'warning' : 'success'} onDismiss={() => setMessage(null)}>
            <p>{message.text}</p>
            {message.extra && <p className="mt-1 text-ink-soft">{message.extra}</p>}
          </Notice>
        </div>
      )}

      <div className="animate-rise mt-5 grid gap-4 rounded-2xl border border-line bg-card p-5 shadow-card [animation-delay:60ms] sm:grid-cols-2">
        <PlanProgress done={plan.completed} noShow={plan.no_show} total={plan.total_sessions} />
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-ink-faint">Schedule</dt><dd>{formatDays(plan.days_of_week)} · {formatClock(plan.session_time)}</dd>
          <dt className="text-ink-faint">Length</dt><dd>{plan.duration_minutes} min · {formatPeso(plan.fee_per_session)}</dd>
          <dt className="text-ink-faint">Started</dt><dd>{formatDate(plan.start_date)}</dd>
          {plan.reevaluation_date && <><dt className="text-ink-faint">Re-evaluate</dt><dd>{formatDate(plan.reevaluation_date)}</dd></>}
          {plan.next_session_at && <><dt className="text-ink-faint">Next visit</dt><dd className="font-semibold text-teal-700">{formatVisit(plan.next_session_at)}</dd></>}
        </dl>
      </div>

      {/* plan actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        {editable && <button className={buttonClass('secondary')} onClick={() => setDialog('schedule')}>Change schedule</button>}
        {(plan.status === 'active' || plan.status === 'completed') && <button className={buttonClass('secondary')} onClick={() => setDialog('extend')}>Add sessions</button>}
        <button className={buttonClass('secondary')} onClick={() => setDialog('details')}>Edit goal</button>
        {(plan.status === 'active' || plan.status === 'on_hold') && (
          <button className={buttonClass('ghost')} onClick={() => setDialog('hold')}>{plan.status === 'on_hold' ? 'Resume plan' : 'Put on hold'}</button>
        )}
        {(plan.status === 'active' || plan.status === 'on_hold') && (
          <button className={buttonClass('ghost', 'text-danger-600 hover:bg-danger-50 hover:text-danger-600')} onClick={() => setDialog('cancel')}>Cancel plan</button>
        )}
      </div>

      {error && <div className="mt-4"><ErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} /></div>}

      <div className="mt-6 space-y-6">
        {overdue.length > 0 && (
          <SessionGroup title="Needs update" hint="These visits have passed. Mark them done or no-show." sessions={overdue} overdue onSelect={setSelected} />
        )}
        <SessionGroup title="Upcoming" sessions={upcoming} onSelect={setSelected} empty="No upcoming visits." />
        {finished.length > 0 && <SessionGroup title="Completed" sessions={finished} onSelect={setSelected} />}
        {cancelledList.length > 0 && (
          <div>
            <button onClick={() => setShowCancelled((v) => !v)} className="text-sm font-medium text-ink-soft underline underline-offset-2">
              {showCancelled ? 'Hide' : 'Show'} {cancelledList.length} cancelled
            </button>
            {showCancelled && <div className="mt-3"><SessionGroup title="Cancelled" sessions={cancelledList} onSelect={setSelected} /></div>}
          </div>
        )}
      </div>

      <SessionDialog session={selected} patientName={plan.patient_name} onClose={() => setSelected(null)} onDone={done} />

      {dialog === 'extend' && <ExtendDialog open plan={plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'schedule' && <ScheduleDialog open plan={plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'details' && <DetailsDialog open plan={plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'hold' && <HoldDialog open plan={plan} onClose={() => setDialog(null)} onDone={done} />}
      {dialog === 'cancel' && <CancelPlanDialog open plan={plan} onClose={() => setDialog(null)} onDone={done} />}
    </section>
  )
}

function SessionGroup({ title, hint, sessions, onSelect, overdue, empty }: {
  title: string; hint?: string; sessions: Session[]; onSelect: (s: Session) => void; overdue?: boolean; empty?: string
}) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold">{title} <span className="font-sans text-sm font-normal text-ink-faint">{sessions.length || ''}</span></h2>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
      {sessions.length === 0 && empty && <p className="mt-2 text-sm text-ink-faint">{empty}</p>}
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        {sessions.map((s) => (
          <li key={s.id}>
            <button onClick={() => onSelect(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-paper">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper font-display text-sm font-semibold text-ink-soft">
                {s.session_number ?? '–'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{formatVisit(s.starts_at)}</span>
                {s.is_manually_moved && s.status === 'scheduled' && <span className="block text-xs text-ink-faint">Moved</span>}
                {s.cancel_reason && <span className="block truncate text-xs text-ink-faint">{s.cancel_reason}</span>}
              </span>
              <SessionChip status={s.status} overdue={overdue} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

type DialogProps = { open: boolean; plan: CarePlan; onClose: () => void; onDone: (m: Message) => void }

function useAction(onDone: (m: Message) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(action: () => Promise<Message>) {
    setBusy(true); setError(null)
    try { const m = await action(); setBusy(false); onDone(m) } catch (e) { setError(toFriendlyError(e)); setBusy(false) }
  }
  return { busy, error, run }
}

function ExtendDialog({ open, plan, onClose, onDone }: DialogProps) {
  const [n, setN] = useState('4')
  const { busy, error, run } = useAction(onDone)
  const value = Number(n)
  const ok = Number.isInteger(value) && value >= 1 && plan.total_sessions + value <= 200
  return (
    <Modal open={open} onClose={onClose} title="Add sessions">
      <p className="text-sm text-ink-soft">New visits continue on the plan’s days and time, starting from the next free day.</p>
      <div className="mt-4">
        <Field label="How many more?" htmlFor="extend_n" error={n && !ok ? `Between 1 and ${200 - plan.total_sessions}.` : null}>
          <input id="extend_n" type="number" inputMode="numeric" min={1} max={200 - plan.total_sessions} value={n}
                 onChange={(e) => setN(e.target.value)} className={`${inputClass(Boolean(n) && !ok)} h-12`} />
        </Field>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} disabled={!ok} onClick={() => run(async () => {
          const r = await extendPlan(plan.care_plan_id, value)
          const d = describeFill(r, 'extended'); return { text: d.text, extra: d.skipped }
        })}>Add {ok ? value : ''} sessions</Button>
      </div>
    </Modal>
  )
}

function ScheduleDialog({ open, plan, onClose, onDone }: DialogProps) {
  const [days, setDays] = useState<number[]>(plan.days_of_week)
  const [time, setTime] = useState(plan.session_time.slice(0, 5))
  const [duration, setDuration] = useState(String(plan.duration_minutes))
  const [fee, setFee] = useState(String(plan.fee_per_session))
  const { busy, error, run } = useAction(onDone)
  const mins = Number(duration), f = Number(fee)
  const ok = days.length > 0 && Boolean(time) && Number.isInteger(mins) && mins >= 15 && mins <= 240 && Number.isFinite(f) && f >= 0

  return (
    <Modal open={open} onClose={onClose} title="Change schedule" wide>
      <p className="text-sm text-ink-soft">Future visits are rebuilt with the new schedule. Past visits and visits you moved by hand stay as they are.</p>
      <div className="mt-4 space-y-4">
        <Field label="Days" htmlFor="sch_days"><DayPicker value={days} onChange={setDays} invalid={days.length === 0} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Time" htmlFor="sch_time"><input id="sch_time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass(!time)} /></Field>
          <Field label="Minutes" htmlFor="sch_dur"><input id="sch_dur" type="number" inputMode="numeric" min={15} max={240} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} className={`${inputClass()} h-12`} /></Field>
          <Field label="Fee (₱)" htmlFor="sch_fee"><input id="sch_fee" type="number" inputMode="decimal" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className={`${inputClass()} h-12`} /></Field>
        </div>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} disabled={!ok} onClick={() => run(async () => {
          const r = await updatePlanSchedule(plan.care_plan_id, { days, time, duration: mins, fee: f })
          const d = describeFill(r, 'rescheduled'); return { text: d.text, extra: d.skipped }
        })}>Update schedule</Button>
      </div>
    </Modal>
  )
}

function DetailsDialog({ open, plan, onClose, onDone }: DialogProps) {
  const [goal, setGoal] = useState(plan.goal ?? '')
  const [reeval, setReeval] = useState(plan.reevaluation_date ?? '')
  const { busy, error, run } = useAction(onDone)
  const ok = !reeval || reeval >= plan.start_date
  return (
    <Modal open={open} onClose={onClose} title="Goal & re-evaluation">
      <div className="space-y-4">
        <Field label="Goal" htmlFor="det_goal" optional>
          <textarea id="det_goal" rows={3} maxLength={500} value={goal} onChange={(e) => setGoal(e.target.value)} className={`${inputClass()} py-3`} />
        </Field>
        <Field label="Re-evaluation date" htmlFor="det_reeval" optional error={ok ? null : 'Must be on or after the start date.'}>
          <input id="det_reeval" type="date" min={plan.start_date} value={reeval} onChange={(e) => setReeval(e.target.value)} className={inputClass(!ok)} />
        </Field>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} disabled={!ok} onClick={() => run(async () => {
          await updatePlanDetails(plan.care_plan_id, goal.trim() || null, reeval || null); return { text: 'Plan details saved.' }
        })}>Save</Button>
      </div>
    </Modal>
  )
}

function HoldDialog({ open, plan, onClose, onDone }: DialogProps) {
  const { busy, error, run } = useAction(onDone)
  const resume = plan.status === 'on_hold'
  return (
    <ConfirmDialog
      open={open} onCancel={onClose} busy={busy}
      title={resume ? 'Resume this plan?' : 'Put this plan on hold?'}
      body={<>
        {resume
          ? 'Visits are created again from today on the plan’s days, until all sessions are scheduled.'
          : 'Future visits are removed from the schedule. The sessions still owed are re-created from the next free day when you resume.'}
        {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      </>}
      confirmLabel={resume ? 'Resume' : 'Put on hold'}
      onConfirm={() => run(async () => {
        const r = await setPlanOnHold(plan.care_plan_id, !resume)
        if (!resume) return { text: 'Plan is on hold. Future visits were removed.' }
        const d = describeFill(r, 'extended'); return { text: `Plan resumed. ${d.text}`, extra: d.skipped }
      })}
    />
  )
}

function CancelPlanDialog({ open, plan, onClose, onDone }: DialogProps) {
  const [reason, setReason] = useState('')
  const { busy, error, run } = useAction(onDone)
  return (
    <Modal open={open} onClose={onClose} title="Cancel this plan?">
      <p className="text-sm text-ink-soft">All future visits are cancelled. Completed visits, notes and payments are kept. This can’t be undone; you can create a new plan later.</p>
      <div className="mt-4">
        <Field label="Reason" htmlFor="plan_reason" optional>
          <input id="plan_reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass()} h-12`} placeholder="Goals met early, moved away…" />
        </Field>
      </div>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Keep plan</Button>
        <Button variant="danger" loading={busy} onClick={() => run(async () => {
          await cancelPlan(plan.care_plan_id, reason.trim() || null); return { text: 'Plan cancelled. Future visits were cancelled.' }
        })}>Cancel plan</Button>
      </div>
    </Modal>
  )
}
