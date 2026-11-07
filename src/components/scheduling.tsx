import { useState } from 'react'
import { formatPeso, formatTime, formatVisit, manilaIso, splitManila, WEEKDAYS } from '../lib/format'
import { toFriendlyError } from '../lib/errors'
import { describeFill } from '../lib/scheduleText'
import { cancelSession, completeSession, markNoShow, rescheduleSession } from '../lib/sessions'
import type { PlanStatus, Session, SessionStatus, SlotIssue } from '../lib/types'
import { useSlotCheck } from '../lib/useSlotCheck'
import { Icon } from './Icon'
import { inputClass } from './styles'
import { Button, ErrorBanner, Field, Modal } from './ui'

// ---------------------------------------------------------------- chips

const SESSION_CHIP: Record<SessionStatus, { label: string; cls: string }> = {
  scheduled: { label: 'Scheduled', cls: 'bg-teal-600/10 text-teal-700' },
  completed: { label: 'Done', cls: 'bg-moss-600/12 text-moss-600' },
  no_show: { label: 'No-show', cls: 'bg-clay-50 text-clay-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-paper-deep text-ink-faint line-through' },
}

export function SessionChip({ status, overdue }: { status: SessionStatus; overdue?: boolean }) {
  if (overdue) return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Needs update</span>
  const c = SESSION_CHIP[status]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.cls}`}>{c.label}</span>
}

const PLAN_CHIP: Record<PlanStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-teal-600/10 text-teal-700' },
  on_hold: { label: 'On hold', cls: 'bg-amber-100 text-amber-800' },
  completed: { label: 'Completed', cls: 'bg-moss-600/12 text-moss-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-paper-deep text-ink-soft' },
}

export function PlanChip({ status }: { status: PlanStatus }) {
  const c = PLAN_CHIP[status]
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.cls}`}>{c.label}</span>
}

/** "7 of 12" with a bar; no-shows count as used sessions. */
export function PlanProgress({ done, noShow, total }: { done: number; noShow: number; total: number }) {
  const used = done + noShow
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span><span className="font-display text-lg font-semibold">{used}</span><span className="text-ink-soft"> of {total} sessions</span></span>
        {noShow > 0 && <span className="text-xs text-clay-600">{noShow} no-show</span>}
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={used}>
        <span className="bg-teal-600 transition-all" style={{ width: `${(done / total) * 100}%` }} />
        <span className="bg-clay-500" style={{ width: `${(noShow / total) * 100}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- inputs

export function DayPicker({ value, onChange, invalid }: { value: number[]; onChange: (days: number[]) => void; invalid?: boolean }) {
  const toggle = (iso: number) => onChange(value.includes(iso) ? value.filter((d) => d !== iso) : [...value, iso].sort())
  return (
    <div className={`grid grid-cols-7 gap-1.5 ${invalid ? 'rounded-xl ring-2 ring-danger-600/40' : ''}`} role="group" aria-label="Days of the week">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.iso)
        return (
          <button
            key={d.iso}
            type="button"
            onClick={() => toggle(d.iso)}
            aria-pressed={on}
            aria-label={d.short}
            className={`h-11 rounded-xl text-sm font-semibold transition ${
              on ? 'bg-teal-700 text-white shadow-card' : 'border border-line bg-paper/60 text-ink-soft hover:border-teal-600'
            }`}
          >
            <span className="sm:hidden">{d.short.slice(0, 2)}</span>
            <span className="hidden sm:inline">{d.short}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Shows overlaps (blocking) and tight travel gaps (warning) from useSlotCheck. */
export function SlotIssues({ checking, failed, issues }: { checking: boolean; failed: boolean; issues: SlotIssue[] }) {
  if (checking) return <p className="text-xs text-ink-faint">Checking your schedule…</p>
  if (failed) return <p className="text-xs text-ink-faint">Couldn’t check the schedule right now.</p>
  if (issues.length === 0) return <p className="flex items-center gap-1 text-xs font-medium text-moss-600"><Icon name="check" className="h-3.5 w-3.5" /> Time is free</p>
  return (
    <ul className="space-y-1.5">
      {issues.map((i) => (
        <li key={`${i.issue}-${i.session_id}`}
            className={`rounded-lg px-3 py-2 text-xs ${i.issue === 'overlap' ? 'bg-danger-50 text-danger-600' : 'bg-amber-50 text-amber-900'}`}>
          {i.issue === 'overlap'
            ? <>Overlaps <b>{i.patient_name}</b> ({formatTime(i.starts_at)}–{formatTime(i.ends_at)}).</>
            : i.issue === 'tight_before'
              ? <>Only {i.gap_minutes} min after <b>{i.patient_name}</b> ends; you usually allow {i.needed_minutes} min to travel.</>
              : <>Only {i.gap_minutes} min before <b>{i.patient_name}</b> starts; you usually allow {i.needed_minutes} min to travel.</>}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- visit actions

type Mode = 'menu' | 'reschedule' | 'cancel' | 'noshow'

/**
 * Everything you can do to one visit: done, no-show, move, cancel.
 * onDone(message) lets the page reload and show what happened.
 */
export function SessionDialog({ session, patientName, onClose, onDone }: {
  session: Session | null
  patientName?: string
  onClose: () => void
  onDone: (message: { text: string; extra?: string | null }) => void
}) {
  return (
    <Modal open={Boolean(session)} onClose={onClose} title={patientName ?? 'Visit'}>
      {session && <SessionActions key={session.id} session={session} onDone={onDone} />}
    </Modal>
  )
}

function SessionActions({ session: s, onDone }: { session: Session; onDone: (m: { text: string; extra?: string | null }) => void }) {
  const [mode, setMode] = useState<Mode>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openedAt] = useState(() => Date.now())
  const started = new Date(s.starts_at).getTime() <= openedAt
  const duration = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000)

  async function run(action: () => Promise<{ text: string; extra?: string | null }>) {
    setBusy(true)
    setError(null)
    try {
      onDone(await action())
    } catch (e) {
      setError(toFriendlyError(e))
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{formatVisit(s.starts_at)}</span>
        <span className="text-ink-faint">· {duration} min</span>
        <SessionChip status={s.status} />
      </div>
      {s.session_number && <p className="mt-1 text-xs text-ink-faint">Session {s.session_number} of the plan · {formatPeso(s.fee)}</p>}
      {s.cancel_reason && <p className="mt-1 text-xs text-ink-soft">Reason: {s.cancel_reason}</p>}

      <div className="mt-5">
        {mode === 'menu' && (
          <div className="grid gap-2">
            {s.status === 'scheduled' && started && (
              <>
                <Button loading={busy} onClick={() => run(async () => { await completeSession(s.id); return { text: 'Visit marked as done.' } })}>
                  <Icon name="check" className="h-4 w-4" /> Mark as done
                </Button>
                <Button variant="secondary" onClick={() => setMode('noshow')}>Patient was a no-show</Button>
              </>
            )}
            {s.status === 'scheduled' && (
              <>
                <Button variant="secondary" onClick={() => setMode('reschedule')}><Icon name="clock" className="h-4 w-4" /> Move to another time</Button>
                <Button variant="ghost" className="text-danger-600 hover:bg-danger-50 hover:text-danger-600" onClick={() => setMode('cancel')}>Cancel this visit</Button>
              </>
            )}
            {s.status === 'completed' && (
              <Button variant="secondary" onClick={() => setMode('noshow')}>Change to no-show</Button>
            )}
            {s.status === 'no_show' && (
              <Button loading={busy} onClick={() => run(async () => { await completeSession(s.id); return { text: 'Visit changed to done.' } })}>
                Change to done
              </Button>
            )}
            {s.status === 'cancelled' && <p className="text-sm text-ink-soft">Cancelled visits can’t be changed.</p>}
            {s.status === 'scheduled' && !started && (
              <p className="text-center text-xs text-ink-faint">“Done” and “No-show” appear once the visit time has started.</p>
            )}
          </div>
        )}

        {mode === 'noshow' && <NoShowForm session={s} busy={busy} onBack={() => setMode('menu')}
          onSubmit={(charge) => run(async () => { await markNoShow(s.id, charge); return { text: charge ? `Marked as no-show; ${formatPeso(s.fee)} added to the balance.` : 'Marked as no-show (not charged).' } })} />}

        {mode === 'cancel' && <CancelForm busy={busy} isPlanVisit={Boolean(s.care_plan_id)} onBack={() => setMode('menu')}
          onSubmit={(reason) => run(async () => {
            const result = await cancelSession(s.id, reason)
            if (!s.care_plan_id) return { text: 'Visit cancelled.' }
            const d = describeFill(result, 'makeup')
            return { text: d.text, extra: d.skipped }
          })} />}

        {mode === 'reschedule' && <RescheduleForm session={s} duration={duration} busy={busy} onBack={() => setMode('menu')}
          onSubmit={(startsAt, minutes) => run(async () => { await rescheduleSession(s.id, startsAt, minutes); return { text: `Visit moved to ${formatVisit(startsAt)}.` } })} />}

        {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
      </div>
    </div>
  )
}

function NoShowForm({ session, busy, onBack, onSubmit }: { session: Session; busy: boolean; onBack: () => void; onSubmit: (charge: boolean) => void }) {
  const [charge, setCharge] = useState(false)
  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/60 p-3.5 text-sm">
        <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="mt-0.5 h-5 w-5 accent-clay-500" />
        <span>Charge the session fee ({formatPeso(session.fee)})<span className="block text-xs text-ink-faint">Adds it to the patient’s balance.</span></span>
      </label>
      <FormButtons busy={busy} onBack={onBack} label="Mark no-show" onSubmit={() => onSubmit(charge)} />
    </div>
  )
}

function CancelForm({ busy, isPlanVisit, onBack, onSubmit }: { busy: boolean; isPlanVisit: boolean; onBack: () => void; onSubmit: (reason: string | null) => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="space-y-4">
      <Field label="Reason" htmlFor="cancel_reason" optional>
        <input id="cancel_reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
               placeholder="Patient has fever, family event…" className={`${inputClass()} h-12`} />
      </Field>
      {isPlanVisit && <p className="text-xs text-ink-soft">A make-up visit is added automatically at the end of the plan.</p>}
      <FormButtons busy={busy} onBack={onBack} label="Cancel visit" danger onSubmit={() => onSubmit(reason.trim() || null)} />
    </div>
  )
}

function RescheduleForm({ session, duration, busy, onBack, onSubmit }: {
  session: Session; duration: number; busy: boolean; onBack: () => void; onSubmit: (startsAt: string, minutes: number) => void
}) {
  const initial = splitManila(session.starts_at)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [minutes, setMinutes] = useState(String(duration))
  const mins = Number(minutes)
  const valid = Boolean(date && time) && Number.isInteger(mins) && mins >= 15 && mins <= 240
  const startsAt = valid ? manilaIso(date, time) : null
  const slot = useSlotCheck(startsAt, mins, session.id)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" htmlFor="rs_date"><input id="rs_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass()} /></Field>
        <Field label="Time" htmlFor="rs_time"><input id="rs_time" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className={inputClass()} /></Field>
      </div>
      <Field label="Length (minutes)" htmlFor="rs_minutes" error={!valid && minutes ? 'Between 15 and 240 minutes.' : null}>
        <input id="rs_minutes" type="number" inputMode="numeric" min={15} max={240} step={5} value={minutes}
               onChange={(e) => setMinutes(e.target.value)} className={`${inputClass(!valid && Boolean(minutes))} h-12`} />
      </Field>
      {valid && <SlotIssues {...slot} />}
      <FormButtons busy={busy} onBack={onBack} label="Move visit" disabled={!valid || slot.hasOverlap || slot.checking}
                   onSubmit={() => startsAt && onSubmit(startsAt, mins)} />
    </div>
  )
}

function FormButtons({ busy, onBack, label, onSubmit, danger, disabled }: {
  busy: boolean; onBack: () => void; label: string; onSubmit: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <div className="flex gap-2 pt-1">
      <Button variant="ghost" onClick={onBack} disabled={busy}>Back</Button>
      <Button variant={danger ? 'danger' : 'primary'} className="flex-1" loading={busy} disabled={disabled} onClick={onSubmit}>{label}</Button>
    </div>
  )
}
