import { supabase } from './supabase'

// SOAP notes + pain scale, one row per visit (session_notes).
// The app may insert, update the note fields, and delete; it can never move
// a note to another visit (session_id/owner_id are not updatable).

export interface SessionNote {
  session_id: string
  subjective: string | null
  objective: string | null
  assessment: string | null
  plan: string | null
  pain_before: number | null
  pain_after: number | null
  updated_at?: string
}

export type NoteFields = Omit<SessionNote, 'session_id' | 'updated_at'>

const NOTE_COLUMNS = 'session_id, subjective, objective, assessment, plan, pain_before, pain_after, updated_at'

export async function getNote(sessionId: string): Promise<SessionNote | null> {
  const { data, error } = await supabase.from('session_notes').select(NOTE_COLUMNS).eq('session_id', sessionId).maybeSingle()
  if (error) throw error
  return data as SessionNote | null
}

/** Insert the first time, update afterwards (no upsert: session_id isn't updatable by design). */
export async function saveNote(sessionId: string, fields: NoteFields, exists: boolean): Promise<void> {
  const { error } = exists
    ? await supabase.from('session_notes').update(fields).eq('session_id', sessionId)
    : await supabase.from('session_notes').insert({ session_id: sessionId, ...fields })
  if (error) throw error
}

export interface NoteSummary extends SessionNote { starts_at: string }

/** All notes for a patient (oldest → newest), for the pain trend and the notes list. */
export async function listPatientNotes(patientId: string): Promise<NoteSummary[]> {
  const { data, error } = await supabase
    .from('session_notes')
    .select(`${NOTE_COLUMNS}, sessions!inner(starts_at, patient_id)`)
    .eq('sessions.patient_id', patientId)
    .limit(500)
  if (error) throw error
  return ((data ?? []) as unknown as Array<SessionNote & { sessions: { starts_at: string } }>)
    .map(({ sessions, ...n }) => ({ ...n, starts_at: sessions.starts_at }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}

/** Which of these visits already have a note (for the 📝 marker in lists). */
export async function sessionsWithNotes(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set()
  const { data, error } = await supabase.from('session_notes').select('session_id').in('session_id', sessionIds)
  if (error) throw error
  return new Set((data ?? []).map((r) => r.session_id as string))
}

/** The most recent note for this patient from a visit before `beforeIso`. */
export async function getPreviousNote(patientId: string, beforeIso: string): Promise<NoteSummary | null> {
  const notes = await listPatientNotes(patientId)
  return notes.filter((n) => n.starts_at < beforeIso).at(-1) ?? null
}
