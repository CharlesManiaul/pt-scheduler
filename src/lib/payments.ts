import { supabase } from './supabase'

export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank' | 'other'

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]

export const methodLabel = (m: PaymentMethod) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m

export interface Payment {
  id: string
  patient_id: string
  amount: number
  paid_on: string          // 'YYYY-MM-DD'
  method: PaymentMethod
  reference: string | null
  notes: string | null
}

export type PaymentWithPatient = Payment & { patient_name: string }
export type PaymentInput = Omit<Payment, 'id'>

const COLUMNS = 'id, patient_id, amount, paid_on, method, reference, notes'

type Row = Payment & { patients?: { full_name: string } | null }
const toPayment = ({ patients, ...p }: Row): PaymentWithPatient =>
  ({ ...p, amount: Number(p.amount), patient_name: patients?.full_name ?? '' })

/** Payments received in [from, to) — dates as 'YYYY-MM-DD'. */
export async function listPaymentsBetween(from: string, to: string): Promise<PaymentWithPatient[]> {
  const { data, error } = await supabase
    .from('payments')
    .select(`${COLUMNS}, patients(full_name)`)
    .gte('paid_on', from).lt('paid_on', to)
    .order('paid_on', { ascending: false }).order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(toPayment)
}

export async function listPaymentsForPatient(patientId: string, limit = 5): Promise<PaymentWithPatient[]> {
  const { data, error } = await supabase
    .from('payments').select(COLUMNS)
    .eq('patient_id', patientId)
    .order('paid_on', { ascending: false }).order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map(toPayment)
}

export async function createPayment(input: PaymentInput): Promise<void> {
  const { error } = await supabase.from('payments').insert(input)
  if (error) throw error
}

export async function updatePayment(id: string, input: Omit<PaymentInput, 'patient_id'>): Promise<void> {
  const { error } = await supabase.from('payments').update(input).eq('id', id)
  if (error) throw error
}

export async function deletePayment(id: string): Promise<void> {
  const { error } = await supabase.from('payments').delete().eq('id', id)
  if (error) throw error
}

export interface Outstanding { patient_id: string; full_name: string; status: string; balance: number; total_paid: number }

/** Patients who still owe money, largest balance first. */
export async function listOutstanding(): Promise<Outstanding[]> {
  const { data, error } = await supabase
    .from('v_patient_balances')
    .select('patient_id, full_name, status, balance, total_paid')
    .gt('balance', 0)
    .order('balance', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r) => ({ ...(r as Outstanding), balance: Number(r.balance), total_paid: Number(r.total_paid) }))
}

/** Fees earned from visits in [from, to): completed visits + charged no-shows. */
export async function chargedBetween(fromIso: string, toIso: string): Promise<number> {
  const { data, error } = await supabase
    .from('sessions')
    .select('fee, status, charge_no_show')
    .gte('starts_at', fromIso).lt('starts_at', toIso)
    .in('status', ['completed', 'no_show'])
    .limit(2000)
  if (error) throw error
  return (data ?? []).reduce((sum, s) => (s.status === 'completed' || s.charge_no_show ? sum + Number(s.fee) : sum), 0)
}
