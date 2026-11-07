import { supabase } from './supabase'
import type { Session } from './types'

// Calendar reads: only the visits inside the visible date range, with just
// the patient fields the calendar shows (name + address for Directions).

export type CalendarSession = Session & { patient_name: string; patient_address: string }

const COLUMNS =
  'id, patient_id, care_plan_id, session_number, starts_at, ends_at, status, charge_no_show, fee, cancel_reason, ' +
  'is_manually_moved, patients(full_name, address)'

type Row = Session & { patients: { full_name: string; address: string } | null }

export async function listSessionsInRange(start: Date, end: Date, includeCancelled: boolean): Promise<CalendarSession[]> {
  let query = supabase
    .from('sessions')
    .select(COLUMNS)
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at')
    .limit(1000)                                  // a month of visits is far below this
  if (!includeCancelled) query = query.neq('status', 'cancelled')

  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(({ patients, ...s }) => ({
    ...s,
    fee: Number(s.fee),
    patient_name: patients?.full_name ?? 'Unknown patient',
    patient_address: patients?.address ?? '',
  }))
}

/** IDs of visits that start too soon after the previous one (travel buffer). */
export async function getTightVisits(start: Date, end: Date): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('get_schedule_warnings', {
    p_from: start.toISOString(),
    p_to: end.toISOString(),
  })
  if (error) throw error
  const tight = new Map<string, number>()
  for (const w of (data ?? []) as Array<{ session_id: string; gap_minutes: number }>) tight.set(w.session_id, w.gap_minutes)
  return tight
}
