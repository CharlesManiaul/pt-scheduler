// Mirrors the database tables (Step 3). Numbers come back as JSON numbers.

export type PatientStatus = 'active' | 'discharged'
export type Sex = 'M' | 'F'

export interface Patient {
  id: string
  full_name: string
  birth_date: string | null        // 'YYYY-MM-DD'
  sex: Sex | null
  phone: string | null
  contact_person: string | null
  contact_phone: string | null
  address: string
  landmark: string | null
  diagnosis: string | null
  referring_doctor: string | null
  precautions: string | null
  default_fee: number
  status: PatientStatus
  notes: string | null
  created_at: string
  updated_at: string
}

/** Fields the user can edit (id/owner/timestamps/status are managed elsewhere). */
export type PatientInput = Omit<Patient, 'id' | 'status' | 'created_at' | 'updated_at'>

/** Slim row for the list screen: only what the cards show (no over-fetching). */
export type PatientListItem = Pick<
  Patient,
  'id' | 'full_name' | 'birth_date' | 'sex' | 'address' | 'landmark' | 'diagnosis' | 'status'
> & { balance: number }

export interface PatientBalance {
  patient_id: string
  total_charged: number
  total_paid: number
  balance: number
}

export type PlanStatus = 'active' | 'on_hold' | 'completed' | 'cancelled'
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

/** Row of v_care_plan_progress */
export interface CarePlan {
  care_plan_id: string
  patient_id: string
  patient_name: string
  goal: string | null
  status: PlanStatus
  start_date: string
  reevaluation_date: string | null
  days_of_week: number[]          // ISO: 1 = Mon … 7 = Sun
  session_time: string            // 'HH:MM:SS'
  duration_minutes: number
  fee_per_session: number
  total_sessions: number
  completed: number
  no_show: number
  scheduled: number
  cancelled: number
  remaining: number
  next_session_at: string | null
  last_session_at: string | null
}

export interface Session {
  id: string
  patient_id: string
  care_plan_id: string | null
  session_number: number | null
  starts_at: string
  ends_at: string
  status: SessionStatus
  charge_no_show: boolean
  fee: number
  cancel_reason: string | null
  is_manually_moved: boolean
}

/** Result returned by plan functions that generate sessions */
export interface FillResult {
  care_plan_id?: string
  created: Array<{ id: string; starts_at: string }>
  skipped_dates: string[]
}

export interface SlotIssue {
  issue: 'overlap' | 'tight_before' | 'tight_after'
  session_id: string
  patient_name: string
  starts_at: string
  ends_at: string
  gap_minutes: number | null
  needed_minutes: number | null
}

export interface Settings {
  therapist_name: string | null
  default_session_minutes: number
  default_buffer_minutes: number
  timezone: string
}
