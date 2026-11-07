import type { DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AddVisitDialog } from '../components/AddVisitDialog'
import { Icon } from '../components/Icon'
import { SessionDialog } from '../components/scheduling'
import { buttonClass } from '../components/styles'
import { Button, ErrorBanner, Notice } from '../components/ui'
import { getTightVisits, listSessionsInRange, type CalendarSession } from '../lib/calendar'
import { toFriendlyError } from '../lib/errors'
import { formatVisit, mapsUrl, splitManila } from '../lib/format'
import { checkTimeSlot, rescheduleSession } from '../lib/sessions'

type ViewType = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek'
type Message = { text: string; extra?: string | null; tone: 'success' | 'warning' }

const VIEWS: Array<{ type: ViewType; label: string }> = [
  { type: 'timeGridDay', label: 'Day' },
  { type: 'timeGridWeek', label: 'Week' },
  { type: 'dayGridMonth', label: 'Month' },
  { type: 'listWeek', label: 'Agenda' },
]

const isPhone = () => window.matchMedia('(max-width: 767px)').matches

export function CalendarPage() {
  const calendarRef = useRef<FullCalendar>(null)
  const [initialView] = useState<ViewType>(() => (isPhone() ? 'timeGridDay' : 'timeGridWeek'))
  const [view, setView] = useState<ViewType>(initialView)
  const [title, setTitle] = useState('')
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [data, setData] = useState<{ key: string; sessions: CalendarSession[]; tight: Map<string, number>; at: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [selected, setSelected] = useState<CalendarSession | null>(null)
  const [newVisit, setNewVisit] = useState<{ date: string; time: string } | null>(null)

  // ---- load visits for the visible range --------------------------------
  const requestKey = range ? `${range.start.toISOString()}|${range.end.toISOString()}|${showCancelled}|${reloadKey}` : null
  useEffect(() => {
    if (!range || !requestKey) return
    let cancelled = false
    Promise.all([listSessionsInRange(range.start, range.end, showCancelled), getTightVisits(range.start, range.end)])
      .then(([sessions, tight]) => { if (!cancelled) { setData({ key: requestKey, sessions, tight, at: Date.now() }); setLoadError(null) } })
      .catch((e) => !cancelled && setLoadError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [range, showCancelled, requestKey])

  const loading = Boolean(requestKey) && data?.key !== requestKey && !loadError
  const sessions = useMemo(() => data?.sessions ?? [], [data])
  const tight = useMemo(() => data?.tight ?? new Map<string, number>(), [data])
  const loadedAt = data?.at ?? 0   // when the visits were loaded; splits past/future

  // ---- visits -> calendar events ------------------------------------------
  const events: EventInput[] = useMemo(() => sessions.map((s) => {
    const start = new Date(s.starts_at).getTime()
    const overdue = s.status === 'scheduled' && start < loadedAt
    return {
      id: s.id,
      title: s.patient_name,
      start: s.starts_at,
      end: s.ends_at,
      // only future, still-scheduled visits can be dragged or resized
      editable: s.status === 'scheduled' && start > loadedAt,
      classNames: [`ev-${s.status}`, overdue ? 'ev-overdue' : '', tight.has(s.id) ? 'ev-tight' : ''],
      extendedProps: { session: s, overdue, gap: tight.get(s.id) },
    }
  }), [sessions, tight, loadedAt])

  const summary = useMemo(() => {
    const active = sessions.filter((s) => s.status !== 'cancelled')
    return {
      visits: active.length,
      done: active.filter((s) => s.status === 'completed').length,
      tight: active.filter((s) => tight.has(s.id)).length,
      overdue: active.filter((s) => s.status === 'scheduled' && new Date(s.starts_at).getTime() < loadedAt).length,
    }
  }, [sessions, tight, loadedAt])

  // ---- handlers -------------------------------------------------------------
  const api = () => calendarRef.current?.getApi()

  function handleDatesSet(arg: DatesSetArg) {
    setTitle(arg.view.title)
    setView(arg.view.type as ViewType)
    setRange((prev) => (prev && prev.start.getTime() === arg.start.getTime() && prev.end.getTime() === arg.end.getTime()
      ? prev : { start: arg.start, end: arg.end }))
  }

  function handleEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault()
    setSelected(arg.event.extendedProps.session as CalendarSession)
  }

  function handleDateClick(arg: DateClickArg) {
    // month view gives a whole day; default to 9:00 there
    const { date, time } = splitManila(arg.date.toISOString())
    setNewVisit({ date, time: arg.allDay ? '09:00' : time })
  }

  /** Drag (move) or resize (change length) → reschedule in the database. */
  async function handleMove(arg: EventDropArg | EventResizeDoneArg) {
    const s = arg.event.extendedProps.session as CalendarSession
    const start = arg.event.start
    const end = arg.event.end
    if (!start || !end) { arg.revert(); return }
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000)
    if (minutes < 15 || minutes > 240) {
      arg.revert()
      setMessage({ tone: 'warning', text: 'A visit must be between 15 and 240 minutes.' })
      return
    }
    try {
      await rescheduleSession(s.id, start.toISOString(), minutes)
      const issues = await checkTimeSlot(start.toISOString(), minutes, s.id).catch(() => [])
      const tightIssue = issues.find((i) => i.issue !== 'overlap')
      setMessage({
        tone: tightIssue ? 'warning' : 'success',
        text: `${s.patient_name}: moved to ${formatVisit(start.toISOString())} (${minutes} min).`,
        extra: tightIssue ? `Only ${tightIssue.gap_minutes} min between this visit and ${tightIssue.patient_name}; you usually allow ${tightIssue.needed_minutes} min to travel.` : null,
      })
      setReloadKey((k) => k + 1)
    } catch (e) {
      arg.revert()
      setMessage({ tone: 'warning', text: toFriendlyError(e) })
    }
  }

  const changed = (m: { text: string; extra?: string | null }) => {
    setSelected(null)
    setNewVisit(null)
    setMessage({ tone: m.extra ? 'warning' : 'success', ...m })
    setReloadKey((k) => k + 1)
  }

  // ---- render ---------------------------------------------------------------
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="animate-rise font-display text-3xl font-semibold tracking-tight sm:text-4xl">Calendar</h1>
          <p className="mt-1 text-sm text-ink-soft" aria-live="polite">
            {loading ? 'Loading…' : (
              <>
                {summary.visits} visit{summary.visits === 1 ? '' : 's'}
                {summary.done > 0 && <> · {summary.done} done</>}
                {summary.overdue > 0 && <> · <span className="font-semibold text-amber-800">{summary.overdue} need update</span></>}
                {summary.tight > 0 && <> · <span className="font-semibold text-clay-600">{summary.tight} tight gap{summary.tight === 1 ? '' : 's'}</span></>}
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setNewVisit({ date: splitManila(new Date().toISOString()).date, time: '09:00' })}>
          <Icon name="plus" className="h-4 w-4" /> Visit
        </Button>
      </div>

      {/* toolbar */}
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => api()?.prev()} aria-label="Previous" className={buttonClass('secondary', 'w-11 px-0')}><Icon name="back" /></button>
          <button onClick={() => api()?.today()} className={buttonClass('secondary')}>Today</button>
          <button onClick={() => api()?.next()} aria-label="Next" className={buttonClass('secondary', 'w-11 px-0')}><Icon name="chevronRight" /></button>
          <h2 className="ml-1 truncate font-display text-lg font-semibold sm:text-xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-xl border border-line bg-card p-1 lg:flex-none" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button key={v.type} onClick={() => api()?.changeView(v.type)} aria-pressed={view === v.type}
                      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-none ${view === v.type ? 'bg-teal-700 text-white' : 'text-ink-soft hover:text-ink'}`}>
                {v.label}
              </button>
            ))}
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-teal-700" />
            <span className="hidden sm:inline">Cancelled</span>
            <span className="sm:hidden">Canc.</span>
          </label>
        </div>
      </div>

      {message && (
        <div className="mt-4">
          <Notice tone={message.tone} onDismiss={() => setMessage(null)}>
            <p>{message.text}</p>
            {message.extra && <p className="mt-1 text-ink-soft">{message.extra}</p>}
          </Notice>
        </div>
      )}
      {loadError && <div className="mt-4"><ErrorBanner message={loadError} onRetry={() => { setLoadError(null); setReloadKey((k) => k + 1) }} /></div>}

      <div className={`pt-cal mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-card transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <FullCalendar
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin]}
          initialView={initialView}
          headerToolbar={false}
          height="auto"
          firstDay={1}
          timeZone="local"
          nowIndicator
          allDaySlot={false}
          slotMinTime="06:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          scrollTime="07:00:00"
          slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          dayHeaderFormat={view === 'timeGridWeek' ? { weekday: 'short', day: 'numeric' } : { weekday: 'long' }}
          dayMaxEvents={3}
          eventLongPressDelay={350}
          selectable={false}
          eventDurationEditable
          eventAllow={(drop) => drop.start.getTime() > Date.now()}
          events={events}
          eventContent={renderEvent}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          eventDrop={handleMove}
          eventResize={handleMove}
          datesSet={handleDatesSet}
          noEventsContent="No visits in this period."
        />
      </div>

      <Legend />

      <SessionDialog
        session={selected}
        patientName={selected?.patient_name}
        onClose={() => setSelected(null)}
        onDone={changed}
        footer={selected && (
          <>
            <Link to={`/patients/${selected.patient_id}`} className={buttonClass('ghost', 'h-9 px-3')}>Open patient</Link>
            {selected.care_plan_id && <Link to={`/plans/${selected.care_plan_id}`} className={buttonClass('ghost', 'h-9 px-3')}>Open plan</Link>}
            {selected.patient_address && (
              <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'h-9 px-3')}>
                <Icon name="map" className="h-4 w-4" /> Directions
              </a>
            )}
          </>
        )}
      />
      {newVisit && <AddVisitDialog initialDate={newVisit.date} initialTime={newVisit.time} onClose={() => setNewVisit(null)} onDone={changed} />}
    </section>
  )
}

/** Custom event body: time, name, session number, travel warning. */
function renderEvent(arg: EventContentArg) {
  const s = arg.event.extendedProps.session as CalendarSession
  const gap = arg.event.extendedProps.gap as number | undefined
  const overdue = arg.event.extendedProps.overdue as boolean
  return (
    <div className="ev-body">
      <span className="ev-time">{arg.timeText}</span>
      <span className="ev-title">
        {gap !== undefined && <span className="ev-warn" title={`Only ${gap} min after the previous visit`}>⚠ </span>}
        {arg.event.title}
      </span>
      <span className="ev-meta">
        {s.session_number ? `#${s.session_number}` : s.care_plan_id ? '' : 'One-off'}
        {overdue ? ' · needs update' : s.status === 'no_show' ? ' · no-show' : s.status === 'cancelled' ? ' · cancelled' : ''}
      </span>
    </div>
  )
}

function Legend() {
  const items = [
    ['ev-dot ev-scheduled', 'Scheduled'], ['ev-dot ev-completed', 'Done'], ['ev-dot ev-no_show', 'No-show'],
    ['ev-dot ev-overdue', 'Needs update'], ['ev-dot ev-cancelled', 'Cancelled'],
  ]
  return (
    <div className="pt-cal mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
      {items.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5"><span className={cls} />{label}</span>
      ))}
      <span className="flex items-center gap-1.5"><span className="text-clay-600">⚠</span>Tight travel gap</span>
      <span className="hidden text-ink-faint md:inline">· Drag a future visit to move it; drag its bottom edge to change its length.</span>
      <span className="text-ink-faint md:hidden">· Press and hold a visit to drag it.</span>
    </div>
  )
}
