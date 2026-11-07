import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Button, ErrorBanner, Field, Spinner } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { toFriendlyError } from '../../lib/errors'
import { todayIso } from '../../lib/format'
import {
  emptyPatientForm, formToPatientInput, LIMITS, patientToForm, validatePatient,
  type PatientFormErrors, type PatientFormValues,
} from '../../lib/patientForm'
import { createPatient, getPatient, updatePatient } from '../../lib/patients'

// One form for both "Add patient" (/patients/new) and "Edit" (/patients/:id/edit).
export function PatientFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const [values, setValues] = useState<PatientFormValues>(emptyPatientForm)
  const [errors, setErrors] = useState<PatientFormErrors>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getPatient(id)
      .then((p) => !cancelled && setValues(patientToForm(p)))
      .catch((e) => !cancelled && setLoadError(toFriendlyError(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [id])

  function set<K extends keyof PatientFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validatePatient(values)
    setErrors(found)
    const firstBad = Object.keys(found)[0]
    if (firstBad) {
      document.getElementById(firstBad)?.focus()
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const input = formToPatientInput(values)
      const savedId = isEdit ? (await updatePatient(id!, input), id!) : await createPatient(input)
      navigate(`/patients/${savedId}`, { replace: true })
    } catch (e) {
      setSaveError(toFriendlyError(e))
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>
  }
  if (loadError) return <ErrorBanner message={loadError} />

  // small helpers keep the JSX readable
  const text = (key: keyof PatientFormValues, props: Record<string, unknown> = {}) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (e: { target: { value: string } }) => set(key, e.target.value),
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${key}-error` : undefined,
    className: `${inputClass(Boolean(errors[key]))} h-12`,
    ...props,
  })
  const area = (key: keyof PatientFormValues, max: number, rows = 3) => ({
    ...text(key, { maxLength: max, rows }),
    className: `${inputClass(Boolean(errors[key]))} py-3 leading-relaxed`,
  })

  return (
    <section>
      <Link to={isEdit ? `/patients/${id}` : '/patients'}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-teal-700">
        <Icon name="back" className="h-4 w-4" /> {isEdit ? 'Back to patient' : 'Patients'}
      </Link>
      <h1 className="animate-rise mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {isEdit ? 'Edit patient' : 'New patient'}
      </h1>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
        <Section title="Patient" n={1}>
          <Field label="Full name" htmlFor="full_name" error={errors.full_name}>
            <input {...text('full_name', { autoComplete: 'off', maxLength: LIMITS.full_name, placeholder: 'Juan Dela Cruz' })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Birth date" htmlFor="birth_date" error={errors.birth_date} optional>
              <input {...text('birth_date', { type: 'date', min: '1900-01-01', max: todayIso() })} />
            </Field>
            <Field label="Sex" htmlFor="sex" optional>
              <select {...text('sex')}>
                <option value="">—</option>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Home visit" n={2}>
          <Field label="Address" htmlFor="address" error={errors.address} hint="Used for the Google Maps button.">
            <textarea {...area('address', LIMITS.address, 2)} placeholder="123 Rizal St, Brgy. San Vicente, Tarlac City" />
          </Field>
          <Field label="Landmark" htmlFor="landmark" optional>
            <input {...text('landmark', { maxLength: LIMITS.landmark, placeholder: 'Blue gate beside the sari-sari store' })} />
          </Field>
        </Section>

        <Section title="Contact" n={3}>
          <Field label="Patient phone" htmlFor="phone" error={errors.phone} optional>
            <input {...text('phone', { type: 'tel', inputMode: 'tel', maxLength: LIMITS.phone, placeholder: '0917 123 4567' })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact person" htmlFor="contact_person" optional>
              <input {...text('contact_person', { maxLength: LIMITS.contact_person, placeholder: 'Daughter, caregiver…' })} />
            </Field>
            <Field label="Contact phone" htmlFor="contact_phone" error={errors.contact_phone} optional>
              <input {...text('contact_phone', { type: 'tel', inputMode: 'tel', maxLength: LIMITS.contact_phone })} />
            </Field>
          </div>
        </Section>

        <Section title="Clinical" n={4}>
          <Field label="Diagnosis / condition" htmlFor="diagnosis" optional>
            <textarea {...area('diagnosis', LIMITS.diagnosis, 2)} placeholder="Post-stroke left hemiparesis" />
          </Field>
          <Field label="Referring doctor" htmlFor="referring_doctor" optional>
            <input {...text('referring_doctor', { maxLength: LIMITS.referring_doctor, placeholder: 'Dr. Santos' })} />
          </Field>
          <Field label="Precautions" htmlFor="precautions" optional hint="Shown highlighted on the patient’s page.">
            <textarea {...area('precautions', LIMITS.precautions, 2)} placeholder="Fall risk; hypertensive, check BP before exercise" />
          </Field>
        </Section>

        <Section title="Billing & notes" n={5}>
          <Field label="Default session fee (₱)" htmlFor="default_fee" error={errors.default_fee}
                 hint="Copied to each new plan of care; can be changed per plan.">
            <input {...text('default_fee', { type: 'number', inputMode: 'decimal', min: 0, step: '0.01', placeholder: '800' })} />
          </Field>
          <Field label="Notes" htmlFor="notes" optional>
            <textarea {...area('notes', LIMITS.notes, 3)} />
          </Field>
        </Section>

        {saveError && <ErrorBanner message={saveError} />}

        {/* sticky on phones so Save is always within reach */}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0">
          <Link to={isEdit ? `/patients/${id}` : '/patients'}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-ink-soft hover:bg-card md:flex-none md:px-5">
            Cancel
          </Link>
          <Button type="submit" loading={saving} className="flex-[2] md:flex-none md:px-8">
            {isEdit ? 'Save changes' : 'Add patient'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function Section({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <fieldset className="animate-rise rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6"
              style={{ animationDelay: `${n * 50}ms` }}>
      <legend className="sr-only">{title}</legend>
      <p className="mb-4 flex items-center gap-2 font-display text-lg font-semibold" aria-hidden>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-paper-deep font-sans text-xs text-ink-soft">{n}</span>
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </fieldset>
  )
}
