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
