import { supabase } from './supabase'
import type { FillResult, Session, SlotIssue } from './types'

// Visits. Reads are direct; every change goes through a database function
// (the app has no direct write access to the sessions table).

const SESSION_COLUMNS =
  'id, patient_id, care_plan_id, session_number, starts_at, ends_at, status, charge_no_show, fee, cancel_reason, is_manually_moved'

const normalize = (rows: unknown[] | null): Session[] =>
  ((rows ?? []) as Session[]).map((s) => ({ ...s, fee: Number(s.fee) }))

export async function listPlanSessions(planId: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions').select(SESSION_COLUMNS).eq('care_plan_id', planId).order('starts_at')
  if (error) throw error
  return normalize(data)
}

/** Next scheduled visits for a patient (any plan or one-off). */
export async function listUpcomingForPatient(patientId: string, limit = 5): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions').select(SESSION_COLUMNS)
    .eq('patient_id', patientId).eq('status', 'scheduled')
    .gte('starts_at', new Date(Date.now() - 12 * 3600_000).toISOString())   // include today's earlier visits
    .order('starts_at').limit(limit)
  if (error) throw error
  return normalize(data)
}

export async function completeSession(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_session', { p_session_id: id })
  if (error) throw error
}

export async function markNoShow(id: string, charge: boolean): Promise<void> {
  const { error } = await supabase.rpc('mark_no_show', { p_session_id: id, p_charge: charge })
  if (error) throw error
}

export async function cancelSession(id: string, reason: string | null): Promise<FillResult> {
  const { data, error } = await supabase.rpc('cancel_session', { p_session_id: id, p_reason: reason })
  if (error) throw error
  return data as FillResult
}

export async function rescheduleSession(id: string, startsAt: string, durationMinutes: number): Promise<void> {
  const { error } = await supabase.rpc('reschedule_session', {
    p_session_id: id, p_new_starts_at: startsAt, p_duration_minutes: durationMinutes,
  })
  if (error) throw error
}

export async function createSingleSession(p: { patientId: string; startsAt: string; durationMinutes: number; fee: number }): Promise<string> {
  const { data, error } = await supabase.rpc('create_single_session', {
    p_patient_id: p.patientId, p_starts_at: p.startsAt, p_duration_minutes: p.durationMinutes, p_fee: p.fee,
  })
  if (error) throw error
  return data as string
}

/** Overlaps (blocking) and too-tight travel gaps (warning) for a proposed slot. */
export async function checkTimeSlot(startsAt: string, durationMinutes: number, excludeSessionId?: string): Promise<SlotIssue[]> {
  const { data, error } = await supabase.rpc('check_time_slot', {
    p_starts_at: startsAt,
    p_duration_minutes: durationMinutes,
    p_exclude_session_id: excludeSessionId ?? null,
  })
  if (error) throw error
  return (data ?? []) as SlotIssue[]
}
