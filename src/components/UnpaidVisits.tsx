import { formatDay, formatPeso } from '../lib/format'
import type { UnpaidVisit } from '../lib/unpaid'

/** Dates still unpaid, oldest first. Partly paid visits show what's left. */
export function UnpaidVisits({ visits, max = 8, compact }: { visits: UnpaidVisit[]; max?: number; compact?: boolean }) {
  if (visits.length === 0) return null
  const shown = visits.slice(0, max)
  const hidden = visits.length - shown.length
  return (
    <div>
      {!compact && <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Unpaid visits</p>}
      <ul className="flex flex-wrap gap-1.5" aria-label="Unpaid visits">
        {shown.map((v) => {
          const partial = v.owed < v.fee
          return (
            <li key={v.id}
                className="rounded-lg border border-clay-500/30 bg-clay-50 px-2 py-1 text-xs leading-tight"
                title={partial ? `${formatPeso(v.fee - v.owed)} of ${formatPeso(v.fee)} paid` : `${formatPeso(v.fee)} unpaid`}>
              <span className="font-semibold text-ink">{formatDay(v.starts_at)}</span>
              <span className="ml-1 text-clay-600">{formatPeso(v.owed)}</span>
              {partial && <span className="ml-1 text-ink-faint">of {formatPeso(v.fee)}</span>}
            </li>
          )
        })}
        {hidden > 0 && <li className="self-center text-xs text-ink-faint">+{hidden} more</li>}
      </ul>
    </div>
  )
}
