import { supabase } from './supabase'
import type { CarePlan, FillResult, Settings } from './types'

// Plans of care. Creating and changing a schedule goes through the database
// functions from Step 3 (they generate, skip and renumber sessions);
// the app only has direct write access to goal and re-evaluation date.

const PLAN_COLUMNS =
  'care_plan_id, patient_id, patient_name, goal, status, start_date, reevaluation_date, days_of_week, ' +
  'session_time, duration_minutes, fee_per_session, total_sessions, completed, no_show, scheduled, ' +
  'cancelled, remaining, next_session_at, last_session_at'

function normalize(row: Record<string, unknown>): CarePlan {
  const r = row as unknown as CarePlan
  return { ...r, fee_per_session: Number(r.fee_per_session) }
}

export async function listPlansForPatient(patientId: string): Promise<CarePlan[]> {
  const { data, error } = await supabase
    .from('v_care_plan_progress')
    .select(PLAN_COLUMNS)
    .eq('patient_id', patientId)
    .order('start_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((r) => normalize(r as unknown as Record<string, unknown>))
}

export async function getPlan(planId: string): Promise<CarePlan> {
  const { data, error } = await supabase.from('v_care_plan_progress').select(PLAN_COLUMNS).eq('care_plan_id', planId).single()
  if (error) throw error
  return normalize(data as unknown as Record<string, unknown>)
}

export interface NewPlan {
  patientId: string
  startDate: string
  totalSessions: number
  daysOfWeek: number[]
  sessionTime: string
  durationMinutes: number
  feePerSession: number
  goal: string | null
  reevaluationDate: string | null
}

export async function createPlan(p: NewPlan): Promise<FillResult> {
  const { data, error } = await supabase.rpc('create_care_plan', {
    p_patient_id: p.patientId,
    p_start_date: p.startDate,
    p_total_sessions: p.totalSessions,
    p_days_of_week: p.daysOfWeek,
    p_session_time: p.sessionTime,
    p_duration_minutes: p.durationMinutes,
    p_fee_per_session: p.feePerSession,
    p_goal: p.goal,
    p_reevaluation_date: p.reevaluationDate,
  })
  if (error) throw error
  return data as FillResult
}

export async function extendPlan(planId: string, additional: number): Promise<FillResult> {
  const { data, error } = await supabase.rpc('extend_care_plan', { p_plan_id: planId, p_additional_sessions: additional })
  if (error) throw error
  return data as FillResult
}

export async function updatePlanSchedule(planId: string, s: { days: number[]; time: string; duration: number; fee: number }): Promise<FillResult> {
  const { data, error } = await supabase.rpc('update_care_plan_schedule', {
    p_plan_id: planId, p_days_of_week: s.days, p_session_time: s.time, p_duration_minutes: s.duration, p_fee_per_session: s.fee,
  })
  if (error) throw error
  return data as FillResult
}

export async function setPlanOnHold(planId: string, onHold: boolean): Promise<FillResult> {
  const { data, error } = await supabase.rpc('set_care_plan_on_hold', { p_plan_id: planId, p_on_hold: onHold })
  if (error) throw error
  return data as FillResult
}

export async function cancelPlan(planId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancel_care_plan', { p_plan_id: planId, p_reason: reason })
  if (error) throw error
}

export async function updatePlanDetails(planId: string, goal: string | null, reevaluationDate: string | null): Promise<void> {
  const { error } = await supabase.from('care_plans').update({ goal, reevaluation_date: reevaluationDate }).eq('id', planId)
  if (error) throw error
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings')
    .select('therapist_name, default_session_minutes, default_buffer_minutes, timezone')
    .single()
  if (error) throw error
  return data as Settings
}
