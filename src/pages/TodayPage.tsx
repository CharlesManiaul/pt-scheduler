import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { PlanProgress, SessionChip, SessionDialog } from '../components/scheduling'
import { buttonClass } from '../components/styles'
import { ErrorBanner, Notice, Spinner } from '../components/ui'
import {
  collectedByMonth, listDayVisits, listOverdue, plansNeedingAttention, weekCounts, type TodayVisit,
} from '../lib/dashboard'
import { toFriendlyError } from '../lib/errors'
import { addDays, formatDate, formatDay, formatPeso, formatTime, mapsUrl, telHref, TIME_ZONE, todayIso } from '../lib/format'
import { listOutstanding } from '../lib/payments'
import { getSettings } from '../lib/plans'
import type { CarePlan, Settings } from '../lib/types'

const EarningsChart = lazy(() => import('../components/EarningsChart').then((m) => ({ default: m.EarningsChart })))

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-PH', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(now))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

interface Data {
  day: string
  visits: TodayVisit[]
  overdue: TodayVisit[]
  week: { total: number; done: number; remaining: number }
  plans: CarePlan[]
  earnings: Array<{ month: string; total: number }>
  owed: number
  owedCount: number
  settings: Settings
  at: number
}

export function TodayPage() {
  const [day, setDay] = useState(todayIso())
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TodayVisit | null>(null)
  const [message, setMessage] = useState<{ text: string; extra?: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([listDayVisits(day), listOverdue(), weekCounts(), plansNeedingAttention(), collectedByMonth(6), listOutstanding(), getSettings()])
      .then(([visits, overdue, week, plans, earnings, outstanding, settings]) => {
        if (cancelled) return
        setData({
          day, visits, overdue, week, plans, earnings, settings,
          owed: outstanding.reduce((s, o) => s + o.balance, 0), owedCount: outstanding.length, at: Date.now(),
        })
        setError(null)
      })
      .catch((e) => !cancelled && setError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [day, reloadKey])

  const changed = (m: { text: string; extra?: string | null }) => {
    setSelected(null)
    setMessage(m)
    setReloadKey((k) => k + 1)
  }

  const isToday = day === todayIso()
  const name = data?.settings.therapist_name?.split(' ')[0]
  const dateLabel = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))

  return (
    <section>
      <p className="animate-rise text-sm font-semibold uppercase tracking-[0.18em] text-clay-600">{dateLabel}</p>
      <h1 className="animate-rise mt-1 font-display text-4xl font-semibold tracking-tight [animation-delay:60ms] sm:text-5xl">
        {isToday ? <>{data ? greeting(new Date(data.at)) : 'Hello'}{name ? `, ${name}` : ''}.</> : formatDay(day)}
      </h1>

      {message && (
        <div className="mt-4">
          <Notice tone={message.extra ? 'warning' : 'success'} onDismiss={() => setMessage(null)}>
            <p>{message.text}</p>
            {message.extra && <p className="mt-1 text-ink-soft">{message.extra}</p>}
          </Notice>
        </div>
      )}
      {error && <div className="mt-4"><ErrorBanner message={error} onRetry={() => { setError(null); setReloadKey((k) => k + 1) }} /></div>}
      {!data && !error && <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>}

      {data && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* ---------------- route for the day ---------------- */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold">
                {isToday ? 'Today’s route' : 'Route'} <span className="font-sans text-sm font-normal text-ink-faint">{data.visits.length} visit{data.visits.length === 1 ? '' : 's'}</span>
              </h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setDay((d) => addDays(d, -1))} aria-label="Previous day" className={buttonClass('ghost', 'h-9 w-9 px-0')}><Icon name="back" className="h-4 w-4" /></button>
                {!isToday && <button onClick={() => setDay(todayIso())} className={buttonClass('ghost', 'h-9 px-2.5')}>Today</button>}
                <button onClick={() => setDay((d) => addDays(d, 1))} aria-label="Next day" className={buttonClass('ghost', 'h-9 w-9 px-0')}><Icon name="chevronRight" className="h-4 w-4" /></button>
              </div>
            </div>
            <RouteList visits={data.visits} defaultBuffer={data.settings.default_buffer_minutes} now={data.at} onSelect={setSelected} />
          </div>

          {/* ---------------- side column ---------------- */}
          <div className="space-y-4">
            {data.overdue.length > 0 && (
              <div className="animate-rise rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900">{data.overdue.length}{data.overdue.length === 20 ? '+' : ''} past visit{data.overdue.length === 1 ? '' : 's'} need an update</p>
                <p className="text-xs text-amber-900/80">Mark each one done or no-show so plans and balances stay right.</p>
                <ul className="mt-2 space-y-1">
                  {data.overdue.slice(0, 5).map((v) => (
                    <li key={v.id}>
                      <button onClick={() => setSelected(v)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-amber-100">
                        <span className="truncate font-medium">{v.patient_name}</span>
                        <span className="shrink-0 text-xs text-amber-900/80">{formatDay(v.starts_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Stat label="This week" value={`${data.week.done}/${data.week.total}`} note={`${data.week.remaining} still to go`} />
              <Link to="/payments" className="block">
                <Stat label="Unpaid" value={formatPeso(data.owed)} note={`${data.owedCount} patient${data.owedCount === 1 ? '' : 's'}`} tone={data.owed > 0 ? 'clay' : undefined} />
              </Link>
            </div>

            <div className="animate-rise rounded-2xl border border-line bg-card p-4 shadow-card">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-display text-lg font-semibold">Collected per month</h2>
                <span className="text-xs text-ink-faint">this month {formatPeso(data.earnings.at(-1)?.total ?? 0)}</span>
              </div>
              <Suspense fallback={<div className="h-44 animate-pulse rounded-xl bg-paper" />}>
                <EarningsChart data={data.earnings} />
              </Suspense>
            </div>

            {data.plans.length > 0 && (
              <div className="animate-rise rounded-2xl border border-line bg-card p-4 shadow-card">
                <h2 className="font-display text-lg font-semibold">Plans to review</h2>
                <p className="text-xs text-ink-faint">Ending soon, or due for re-evaluation this week.</p>
                <ul className="mt-3 space-y-3">
                  {data.plans.map((p) => (
                    <li key={p.care_plan_id}>
                      <Link to={`/plans/${p.care_plan_id}`} className="block rounded-xl border border-line p-3 transition hover:border-teal-600/40 hover:bg-paper/60">
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{p.patient_name}</span>
                          <span className="shrink-0 text-xs font-medium text-clay-600">
                            {p.remaining <= 2 ? `${p.remaining} left` : `Re-eval ${formatDate(p.reevaluation_date!)}`}
                          </span>
                        </div>
                        <PlanProgress done={p.completed} noShow={p.no_show} total={p.total_sessions} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <SessionDialog
        session={selected}
        patientName={selected?.patient_name}
        onClose={() => setSelected(null)}
        onDone={changed}
        footer={selected && (
          <>
            <Link to={`/patients/${selected.patient_id}`} className={buttonClass('ghost', 'h-9 px-3')}>Open patient</Link>
            {selected.care_plan_id && <Link to={`/plans/${selected.care_plan_id}`} className={buttonClass('ghost', 'h-9 px-3')}>Open plan</Link>}
          </>
        )}
      />
    </section>
  )
}

/** Visits in order, with the travel gap between each pair. */
function RouteList({ visits, defaultBuffer, now, onSelect }: {
  visits: TodayVisit[]; defaultBuffer: number; now: number; onSelect: (v: TodayVisit) => void
}) {
  const gaps = useMemo(() => visits.map((v, i) => {
    if (i === 0) return null
    const prev = visits[i - 1]!
    const minutes = Math.round((new Date(v.starts_at).getTime() - new Date(prev.ends_at).getTime()) / 60000)
    return { minutes, needed: v.buffer_minutes ?? defaultBuffer }
  }), [visits, defaultBuffer])

  if (visits.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-dashed border-line bg-card/70 px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold">No visits.</p>
        <p className="mt-1 text-sm text-ink-soft">Nothing scheduled for this day.</p>
        <Link to="/calendar" className="mt-4 inline-block text-sm font-semibold text-clay-600 hover:underline">Open the calendar</Link>
      </div>
    )
  }

  return (
    <ol className="mt-3">
      {visits.map((v, i) => {
        const gap = gaps[i]
        const tight = gap && gap.minutes < gap.needed
        const overdue = v.status === 'scheduled' && new Date(v.starts_at).getTime() < now
        const current = v.status === 'scheduled' && new Date(v.starts_at).getTime() <= now && new Date(v.ends_at).getTime() > now
        return (
          <li key={v.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
            {gap && (
              <div className="flex items-center gap-2 py-1.5 pl-[1.35rem]">
                <span className={`h-6 border-l-2 border-dotted ${tight ? 'border-clay-500' : 'border-line'}`} />
                <span className={`text-xs ${tight ? 'font-semibold text-clay-600' : 'text-ink-faint'}`}>
                  {gap.minutes < 0 ? 'Overlaps!' : `${gap.minutes} min to travel`}{tight && gap.minutes >= 0 ? ` · you usually allow ${gap.needed}` : ''}
                </span>
              </div>
            )}
            <div className={`flex gap-3 rounded-2xl border bg-card p-3.5 shadow-card ${current ? 'border-clay-500 ring-2 ring-clay-500/20' : 'border-line'}`}>
              <div className="flex w-14 shrink-0 flex-col items-center">
                <span className={`grid h-11 w-11 place-items-center rounded-full font-display text-lg font-semibold ${
                  v.status === 'completed' ? 'bg-moss-600/15 text-moss-600' : current ? 'bg-clay-500 text-white' : 'bg-teal-700 text-white'
                }`}>
                  {v.status === 'completed' ? <Icon name="check" className="h-5 w-5" /> : i + 1}
                </span>
                <span className="mt-1 text-xs font-semibold">{formatTime(v.starts_at)}</span>
              </div>
              <button onClick={() => onSelect(v)} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{v.patient_name}</span>
                  {(v.status !== 'scheduled' || overdue) && <SessionChip status={v.status} overdue={overdue && !current} />}
                  {current && <span className="rounded-full bg-clay-500 px-2 py-0.5 text-xs font-semibold text-white">Now</span>}
                </span>
                <span className="mt-0.5 block truncate text-sm text-ink-soft">{v.address}</span>
                {v.landmark && <span className="block truncate text-xs text-ink-faint">{v.landmark}</span>}
                <span className="mt-0.5 block text-xs text-ink-faint">
                  until {formatTime(v.ends_at)}{v.session_number ? ` · session ${v.session_number}` : v.care_plan_id ? '' : ' · one-off'}
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-1.5">
                <a href={mapsUrl(v.address)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${v.patient_name}`}
                   className="grid h-10 w-10 place-items-center rounded-xl bg-clay-500 text-white hover:bg-clay-600">
                  <Icon name="map" className="h-5 w-5" />
                </a>
                {v.phone && (
                  <a href={telHref(v.phone)} aria-label={`Call ${v.patient_name}`}
                     className="grid h-10 w-10 place-items-center rounded-xl border border-line text-ink-soft hover:border-teal-600 hover:text-teal-700">
                    <Icon name="phone" className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'clay' }) {
  return (
    <div className="animate-rise h-full rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold tracking-tight ${tone === 'clay' ? 'text-clay-600' : 'text-ink'}`}>{value}</p>
      <p className="truncate text-xs text-ink-soft">{note}</p>
    </div>
  )
}
