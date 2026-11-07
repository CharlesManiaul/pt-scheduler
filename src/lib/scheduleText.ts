import { formatDay, formatVisit } from './format'
import type { FillResult } from './types'

/** Plain-language summary of what a plan function created or skipped. */
export function describeFill(result: FillResult, verb: 'created' | 'makeup' | 'extended' | 'rescheduled'): {
  text: string
  skipped: string | null
} {
  const n = result.created.length
  const first = result.created[0]
  let text: string
  if (verb === 'makeup') {
    text = first ? `Visit cancelled. Make-up visit added on ${formatVisit(first.starts_at)}.` : 'Visit cancelled.'
  } else if (n === 0) {
    text = verb === 'rescheduled' ? 'Schedule updated. No new visits were needed.' : 'No new visits were needed.'
  } else {
    const label = n === 1 ? 'visit' : 'visits'
    const lead = verb === 'created' ? `Plan created with ${n} ${label}` : verb === 'extended' ? `${n} ${label} added` : `Schedule updated: ${n} ${label} regenerated`
    text = `${lead}, from ${formatVisit(first!.starts_at)}.`
  }
  const skipped = result.skipped_dates.length
    ? `Skipped because another visit was already booked: ${result.skipped_dates.map(formatDay).join(', ')}.`
    : null
  return { text, skipped }
}
