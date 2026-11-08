import { addDays, manilaIso, todayIso } from './format'
import { supabase } from './supabase'
import type { CarePlan, Session } from './types'

// Data for the Today screen. Every query is bounded by a date range or a limit.

export type TodayVisit = Session & {
  buffer_minutes: number | null
  patient_name: string
  address: string
  landmark: string | null
  phone: string | null
}

type Row = Session & { buffer_minutes: number | null; patients: { full_name: string; address: string; landmark: string | null; phone: string | null } | null }

const VISIT_COLUMNS =
  'id, patient_id, care_plan_id, session_number, starts_at, ends_at, status, charge_no_show, fee, cancel_reason, ' +
  'is_manually_moved, buffer_minutes, patients(full_name, address, landmark, phone)'

const toVisit = ({ patients, ...s }: Row): TodayVisit => ({
  ...s,
  fee: Number(s.fee),
  patient_name: patients?.full_name ?? 'Unknown patient',
  address: patients?.address ?? '',
  landmark: patients?.landmark ?? null,
  phone: patients?.phone ?? null,
})

/** Visits on a Manila calendar day, in route order (cancelled left out). */
export async function listDayVisits(day: string): Promise<TodayVisit[]> {
  const { data, error } = await supabase
    .from('sessions').select(VISIT_COLUMNS)
    .gte('starts_at', manilaIso(day, '00:00')).lt('starts_at', manilaIso(addDays(day, 1), '00:00'))
    .neq('status', 'cancelled')
    .order('starts_at')
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(toVisit)
}

/** Past visits still marked scheduled (before today) — they need done / no-show. */
export async function listOverdue(limit = 20): Promise<TodayVisit[]> {
  const { data, error } = await supabase
    .from('sessions').select(VISIT_COLUMNS)
    .eq('status', 'scheduled')
    .lt('starts_at', manilaIso(todayIso(), '00:00'))
    .order('starts_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(toVisit)
}

/** Monday of the current Manila week. */
export function weekStart(day = todayIso()): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() || 7
  return addDays(day, 1 - dow)
}

export async function weekCounts(): Promise<{ total: number; done: number; remaining: number }> {
  const from = weekStart()
  const { data, error } = await supabase
    .from('sessions').select('status')
    .gte('starts_at', manilaIso(from, '00:00')).lt('starts_at', manilaIso(addDays(from, 7), '00:00'))
    .neq('status', 'cancelled')
  if (error) throw error
  const rows = data ?? []
  return {
    total: rows.length,
    done: rows.filter((r) => r.status === 'completed').length,
    remaining: rows.filter((r) => r.status === 'scheduled').length,
  }
}

/** Active plans that need attention: ≤ 2 sessions left, or re-evaluation within 7 days. */
export async function plansNeedingAttention(): Promise<CarePlan[]> {
  const today = todayIso()
  const { data, error } = await supabase
    .from('v_care_plan_progress')
    .select('care_plan_id, patient_id, patient_name, goal, status, start_date, reevaluation_date, days_of_week, session_time, duration_minutes, fee_per_session, total_sessions, completed, no_show, scheduled, cancelled, remaining, next_session_at, last_session_at')
    .eq('status', 'active')
    .or(`remaining.lte.2,and(reevaluation_date.gte.${today},reevaluation_date.lte.${addDays(today, 7)})`)
    .order('remaining')
    .limit(20)
  if (error) throw error
  return (data ?? []) as unknown as CarePlan[]
}

/** Collected per month for the last `months` months (oldest first), from payments. */
export async function collectedByMonth(months = 6): Promise<Array<{ month: string; total: number }>> {
  const now = todayIso().slice(0, 7)
  const [y, m] = now.split('-').map(Number)
  const keys = Array.from({ length: months }, (_, i) => new Date(Date.UTC(y!, m! - 1 - (months - 1 - i), 1)).toISOString().slice(0, 7))
  const { data, error } = await supabase
    .from('payments').select('amount, paid_on')
    .gte('paid_on', `${keys[0]}-01`)
    .limit(5000)
  if (error) throw error
  const totals = new Map(keys.map((k) => [k, 0]))
  for (const p of data ?? []) {
    const k = (p.paid_on as string).slice(0, 7)
    if (totals.has(k)) totals.set(k, totals.get(k)! + Number(p.amount))
  }
  return keys.map((k) => ({ month: k, total: totals.get(k)! }))
}
