import { supabase } from './supabase'
import type { Patient, PatientBalance, PatientInput, PatientListItem, PatientStatus } from './types'

// Data access for patients — the app's equivalent of calling stored procedures.
// Row Level Security limits every query to the signed-in therapist; owner_id is
// filled by the database default, never sent from the browser.

export const PAGE_SIZE = 30

const LIST_COLUMNS = 'id, full_name, birth_date, sex, address, landmark, diagnosis, status'
const DETAIL_COLUMNS =
  'id, full_name, birth_date, sex, phone, contact_person, contact_phone, address, landmark, ' +
  'diagnosis, referring_doctor, precautions, default_fee, status, notes, created_at, updated_at'

export type StatusFilter = PatientStatus | 'all'

/** Escape LIKE wildcards so a search for "50%" matches literally. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export async function listPatients(opts: { search: string; status: StatusFilter; page: number }) {
  const from = opts.page * PAGE_SIZE
  let query = supabase
    .from('patients')
    .select(LIST_COLUMNS)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })            // stable order for paging
    .range(from, from + PAGE_SIZE - 1)

  if (opts.status !== 'all') query = query.eq('status', opts.status)
  const term = opts.search.trim()
  if (term) query = query.ilike('full_name', likePattern(term))

  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as unknown as Omit<PatientListItem, 'balance'>[]

  // balances for just this page, in one extra request
  const balances = new Map<string, number>()
  if (rows.length > 0) {
    const { data: bal, error: balError } = await supabase
      .from('v_patient_balances')
      .select('patient_id, balance')
      .in('patient_id', rows.map((r) => r.id))
    if (balError) throw balError
    for (const b of bal ?? []) balances.set(b.patient_id as string, Number(b.balance))
  }

  const items: PatientListItem[] = rows.map((r) => ({ ...r, balance: balances.get(r.id) ?? 0 }))
  return { items, hasMore: rows.length === PAGE_SIZE }
}

export async function getPatient(id: string): Promise<Patient> {
  const { data, error } = await supabase.from('patients').select(DETAIL_COLUMNS).eq('id', id).single()
  if (error) throw error
  return data as unknown as Patient
}

export async function getPatientBalance(id: string): Promise<PatientBalance> {
  const { data, error } = await supabase
    .from('v_patient_balances')
    .select('patient_id, total_charged, total_paid, balance')
    .eq('patient_id', id)
    .single()
  if (error) throw error
  return {
    patient_id: data.patient_id,
    total_charged: Number(data.total_charged),
    total_paid: Number(data.total_paid),
    balance: Number(data.balance),
  }
}

export async function createPatient(input: PatientInput): Promise<string> {
  const { data, error } = await supabase.from('patients').insert(input).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function updatePatient(id: string, input: PatientInput): Promise<void> {
  const { error } = await supabase.from('patients').update(input).eq('id', id)
  if (error) throw error
}

export async function setPatientStatus(id: string, status: PatientStatus): Promise<void> {
  const { error } = await supabase.from('patients').update({ status }).eq('id', id)
  if (error) throw error
}
