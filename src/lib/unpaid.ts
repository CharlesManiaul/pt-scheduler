import { supabase } from './supabase'

// Which visits are still unpaid?
// Payments belong to the patient, not to a visit, so we apply them to the
// oldest charged visits first. What isn't covered is unpaid, and the amounts
// always add up to the patient's balance.

export interface ChargedVisit { id: string; patient_id: string; starts_at: string; fee: number }
export interface UnpaidVisit extends ChargedVisit { owed: number }   // owed < fee = partly paid

/** Oldest-first allocation of the total paid across charged visits. */
export function allocateUnpaid(visits: ChargedVisit[], totalPaid: number): UnpaidVisit[] {
  let credit = Math.round(totalPaid * 100)                     // work in centavos: no float drift
  const unpaid: UnpaidVisit[] = []
  for (const v of [...visits].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const fee = Math.round(v.fee * 100)
    if (credit >= fee) { credit -= fee; continue }
    unpaid.push({ ...v, owed: (fee - credit) / 100 })
    credit = 0
  }
  return unpaid
}

/** Charged visits (completed, or no-show with the fee charged) for these patients. */
export async function listChargedVisits(patientIds: string[]): Promise<ChargedVisit[]> {
  if (patientIds.length === 0) return []
  const { data, error } = await supabase
    .from('sessions')
    .select('id, patient_id, starts_at, fee, status, charge_no_show')
    .in('patient_id', patientIds)
    .in('status', ['completed', 'no_show'])
    .order('starts_at')
    .limit(5000)
  if (error) throw error
  return (data ?? [])
    .filter((s) => s.status === 'completed' || s.charge_no_show)
    .map((s) => ({ id: s.id as string, patient_id: s.patient_id as string, starts_at: s.starts_at as string, fee: Number(s.fee) }))
}

/** Unpaid visits per patient, given each patient's total paid. */
export async function unpaidByPatient(paid: Map<string, number>): Promise<Map<string, UnpaidVisit[]>> {
  const visits = await listChargedVisits([...paid.keys()])
  const byPatient = new Map<string, ChargedVisit[]>()
  for (const v of visits) byPatient.set(v.patient_id, [...(byPatient.get(v.patient_id) ?? []), v])
  const result = new Map<string, UnpaidVisit[]>()
  for (const [patientId, total] of paid) result.set(patientId, allocateUnpaid(byPatient.get(patientId) ?? [], total))
  return result
}
