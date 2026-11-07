import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { ButtonLink, Button, ErrorBanner, StatusBadge } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { toFriendlyError } from '../../lib/errors'
import { ageFrom, formatPeso, initials } from '../../lib/format'
import { listPatients, type StatusFilter } from '../../lib/patients'
import type { PatientListItem } from '../../lib/types'

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'all', label: 'All' },
]

export function PatientsPage() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [page, setPage] = useState(0)
  type Result = { key: string; items: PatientListItem[]; hasMore: boolean; error: string | null }
  const [result, setResult] = useState<Result | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // wait until typing pauses before querying
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(t)
  }, [search])

  // new search/filter starts again from page 0
  const [queryKey, setQueryKey] = useState(`${debounced}|${status}`)
  if (queryKey !== `${debounced}|${status}`) {
    setQueryKey(`${debounced}|${status}`)
    setPage(0)
  }

  // each distinct request has a key; "loading" = the latest result isn't for it yet
  const requestKey = `${debounced}|${status}|${page}|${reloadKey}`

  useEffect(() => {
    let cancelled = false
    listPatients({ search: debounced, status, page })
      .then((res) => {
        if (cancelled) return
        setResult((prev) => ({
          key: requestKey,
          items: page === 0 ? res.items : [...(prev?.items ?? []), ...res.items],
          hasMore: res.hasMore,
          error: null,
        }))
      })
      .catch((e) => {
        if (!cancelled) setResult((prev) => ({ key: requestKey, items: prev?.items ?? [], hasMore: false, error: toFriendlyError(e) }))
      })
    return () => { cancelled = true }
  }, [debounced, status, page, reloadKey, requestKey])

  const loading = result?.key !== requestKey
  const items = result?.items ?? []
  const hasMore = result?.hasMore ?? false
  const error = loading ? null : (result?.error ?? null)
  const firstLoad = loading && page === 0

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="animate-rise font-display text-3xl font-semibold tracking-tight sm:text-4xl">Patients</h1>
          <p className="animate-rise mt-1 text-sm text-ink-soft [animation-delay:60ms]">Everyone you visit, in one place.</p>
        </div>
        <ButtonLink to="/patients/new" className="shrink-0">
          <Icon name="plus" className="h-4 w-4" />
          <span className="hidden sm:inline">Add patient</span>
          <span className="sm:hidden">Add</span>
        </ButtonLink>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            aria-label="Search patients by name"
            maxLength={120}
            className={`${inputClass()} h-11 pl-11`}
          />
        </div>
        <div className="flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              aria-pressed={status === f.value}
              className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium transition sm:flex-none ${
                status === f.value ? 'bg-teal-700 text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {error && <ErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} />}

        {firstLoad && !error && <ListSkeleton />}

        {!firstLoad && !error && items.length === 0 && (
          <EmptyState searching={Boolean(debounced.trim())} status={status} />
        )}

        {!firstLoad && items.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((p, i) => (
              <li key={p.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <PatientCard patient={p} />
              </li>
            ))}
          </ul>
        )}

        {hasMore && !error && (
          <div className="mt-5 flex justify-center">
            <Button variant="secondary" loading={loading && page > 0} onClick={() => setPage((n) => n + 1)}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function PatientCard({ patient: p }: { patient: PatientListItem }) {
  const age = ageFrom(p.birth_date)
  const meta = [age !== null ? `${age} y` : null, p.sex].filter(Boolean).join(' · ')

  return (
    <Link
      to={`/patients/${p.id}`}
      className="group flex items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:border-teal-600/40"
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-display text-base font-semibold ${
        p.status === 'active' ? 'bg-teal-700 text-white' : 'bg-paper-deep text-ink-soft'
      }`}>
        {initials(p.full_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-ink">{p.full_name}</span>
          {p.status === 'discharged' && <StatusBadge status="discharged" />}
        </span>
        <span className="mt-0.5 block truncate text-sm text-ink-soft">
          {[meta, p.diagnosis].filter(Boolean).join(' — ') || 'No diagnosis recorded'}
        </span>
        <span className="mt-1 flex items-center gap-1 text-xs text-ink-faint">
          <Icon name="map" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{p.landmark ? `${p.address} · ${p.landmark}` : p.address}</span>
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        {p.balance > 0 && (
          <span className="rounded-full bg-clay-50 px-2 py-0.5 text-xs font-semibold text-clay-600" title="Unpaid balance">
            {formatPeso(p.balance)}
          </span>
        )}
        <Icon name="chevronRight" className="h-5 w-5 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
      </span>
    </Link>
  )
}

function ListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Loading patients">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex animate-pulse gap-3 rounded-2xl border border-line bg-card p-4">
          <span className="h-11 w-11 rounded-full bg-paper-deep" />
          <span className="flex-1 space-y-2 py-1">
            <span className="block h-4 w-2/3 rounded bg-paper-deep" />
            <span className="block h-3 w-1/2 rounded bg-paper-deep" />
          </span>
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ searching, status }: { searching: boolean; status: StatusFilter }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card/70 px-6 py-12 text-center">
      <p className="font-display text-xl font-semibold">
        {searching ? 'No one by that name.' : status === 'discharged' ? 'No discharged patients.' : 'No patients yet.'}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {searching ? 'Check the spelling, or switch the filter to “All”.' : 'Add your first patient to start planning visits.'}
      </p>
      {!searching && status !== 'discharged' && (
        <ButtonLink to="/patients/new" className="mt-5">
          <Icon name="plus" className="h-4 w-4" /> Add patient
        </ButtonLink>
      )}
    </div>
  )
}
