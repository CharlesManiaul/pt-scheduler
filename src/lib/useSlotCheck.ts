import { useEffect, useState } from 'react'
import { checkTimeSlot } from './sessions'
import type { SlotIssue } from './types'

/**
 * Live "is this time free?" check while the user edits a visit time.
 * Asks the database (check_time_slot) 300 ms after the last change.
 */
export function useSlotCheck(startsAt: string | null, durationMinutes: number, excludeSessionId?: string) {
  const key = startsAt && durationMinutes >= 15 ? `${startsAt}|${durationMinutes}|${excludeSessionId ?? ''}` : null
  const [result, setResult] = useState<{ key: string; issues: SlotIssue[]; failed: boolean } | null>(null)

  useEffect(() => {
    if (!key || !startsAt) return
    let cancelled = false
    const timer = setTimeout(() => {
      checkTimeSlot(startsAt, durationMinutes, excludeSessionId)
        .then((issues) => !cancelled && setResult({ key, issues, failed: false }))
        .catch(() => !cancelled && setResult({ key, issues: [], failed: true }))
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, startsAt, durationMinutes, excludeSessionId])

  const current = result && result.key === key ? result : null
  const issues = current?.issues ?? []
  return {
    checking: Boolean(key) && !current,
    failed: current?.failed ?? false,
    issues,
    hasOverlap: issues.some((i) => i.issue === 'overlap'),
  }
}
