import { todayIso } from './format'
import type { Patient, PatientInput } from './types'

// Form values are always strings while typing; converted to PatientInput on save.
// Limits match the CHECK constraints in 01_schema.sql so the database never
// has to reject what the form accepted.

export type PatientFormValues = Record<keyof PatientInput, string>
export type PatientFormErrors = Partial<Record<keyof PatientInput, string>>

export const emptyPatientForm: PatientFormValues = {
  full_name: '', birth_date: '', sex: '', phone: '', contact_person: '', contact_phone: '',
  address: '', landmark: '', diagnosis: '', referring_doctor: '', precautions: '',
  default_fee: '', notes: '',
}

export const LIMITS = {
  full_name: 120, phone: 30, contact_person: 120, contact_phone: 30, address: 300, landmark: 300,
  diagnosis: 500, referring_doctor: 120, precautions: 1000, notes: 2000,
} as const

const PHONE = /^\+?[\d\s\-()]{7,20}$/

export function patientToForm(p: Patient): PatientFormValues {
  return {
    full_name: p.full_name, birth_date: p.birth_date ?? '', sex: p.sex ?? '', phone: p.phone ?? '',
    contact_person: p.contact_person ?? '', contact_phone: p.contact_phone ?? '', address: p.address,
    landmark: p.landmark ?? '', diagnosis: p.diagnosis ?? '', referring_doctor: p.referring_doctor ?? '',
    precautions: p.precautions ?? '', default_fee: p.default_fee ? String(p.default_fee) : '', notes: p.notes ?? '',
  }
}

export function validatePatient(v: PatientFormValues): PatientFormErrors {
  const e: PatientFormErrors = {}
  const name = v.full_name.trim()
  if (name.length < 2) e.full_name = 'Enter the patient’s full name.'

  if (v.birth_date) {
    if (v.birth_date > todayIso()) e.birth_date = 'Birth date can’t be in the future.'
    else if (v.birth_date < '1900-01-01') e.birth_date = 'Check the year.'
  }

  if (v.phone.trim() && !PHONE.test(v.phone.trim())) e.phone = 'Use digits only, e.g. 0917 123 4567.'
  if (v.contact_phone.trim() && !PHONE.test(v.contact_phone.trim())) e.contact_phone = 'Use digits only, e.g. 0917 123 4567.'

  if (v.address.trim().length < 5) e.address = 'Enter the home address for visits.'

  if (v.default_fee.trim()) {
    const fee = Number(v.default_fee)
    if (!Number.isFinite(fee) || fee < 0) e.default_fee = 'Enter a valid amount.'
    else if (fee > 99_999_999) e.default_fee = 'That amount is too large.'
    else if (!/^\d+(\.\d{1,2})?$/.test(v.default_fee.trim())) e.default_fee = 'Use at most 2 decimal places.'
  }
  return e
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

export function formToPatientInput(v: PatientFormValues): PatientInput {
  return {
    full_name: v.full_name.trim().replace(/\s+/g, ' '),
    birth_date: v.birth_date || null,
    sex: v.sex === 'M' || v.sex === 'F' ? v.sex : null,
    phone: orNull(v.phone),
    contact_person: orNull(v.contact_person),
    contact_phone: orNull(v.contact_phone),
    address: v.address.trim(),
    landmark: orNull(v.landmark),
    diagnosis: orNull(v.diagnosis),
    referring_doctor: orNull(v.referring_doctor),
    precautions: orNull(v.precautions),
    default_fee: v.default_fee.trim() ? Number(v.default_fee) : 0,
    notes: orNull(v.notes),
  }
}
