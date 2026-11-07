import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { ButtonLink, ConfirmDialog, ErrorBanner, Spinner, StatusBadge } from '../../components/ui'
import { buttonClass } from '../../components/styles'
import { toFriendlyError } from '../../lib/errors'
import { ageFrom, formatDate, formatPeso, initials, mapsUrl, telHref } from '../../lib/format'
import { getPatient, getPatientBalance, setPatientStatus } from '../../lib/patients'
import type { Patient, PatientBalance } from '../../lib/types'

export function PatientDetailPage() {
  const { id } = useParams()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [balance, setBalance] = useState<PatientBalance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([getPatient(id), getPatientBalance(id)])
      .then(([p, b]) => {
        if (cancelled) return
        setPatient(p)
        setBalance(b)
      })
      .catch((e) => !cancelled && setError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [id, reloadKey])

  async function toggleStatus() {
    if (!patient) return
    setStatusBusy(true)
    setStatusError(null)
    const next = patient.status === 'active' ? 'discharged' : 'active'
    try {
      await setPatientStatus(patient.id, next)
      setPatient({ ...patient, status: next })
      setConfirmOpen(false)
    } catch (e) {
      setStatusError(toFriendlyError(e))
    } finally {
      setStatusBusy(false)
    }
  }

  if (error) {
    return (
      <section className="space-y-4">
        <BackLink />
        <ErrorBanner message={error} onRetry={() => { setError(null); setReloadKey((k) => k + 1) }} />
      </section>
    )
  }
  if (!patient) {
    return <div className="grid place-items-center py-24 text-teal-700"><Spinner className="h-8 w-8" /></div>
  }

  const p = patient
  const age = ageFrom(p.birth_date)
  const sex = p.sex === 'F' ? 'Female' : p.sex === 'M' ? 'Male' : null
  const discharged = p.status === 'discharged'

  return (
    <section>
      <BackLink />

      {/* Header */}
      <div className="animate-rise mt-3 flex items-start gap-4">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl font-display text-2xl font-semibold ${
          discharged ? 'bg-paper-deep text-ink-soft' : 'bg-teal-700 text-white'
        }`}>
          {initials(p.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">{p.full_name}</h1>
            <StatusBadge status={p.status} />
          </div>
          <p className="mt-1 text-ink-soft">
            {[age !== null ? `${age} years old` : null, sex].filter(Boolean).join(' · ') || 'Age not recorded'}
          </p>
        </div>
      </div>

      {/* Quick actions — big targets for use on the doorstep */}
      <div className="animate-rise mt-5 grid grid-cols-3 gap-2 [animation-delay:60ms] sm:flex">
        <a href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm:px-5')}>
          <Icon name="map" className="h-4 w-4" /> Directions
        </a>
        {p.phone ? (
          <a href={telHref(p.phone)} className={buttonClass('secondary', 'sm:px-5')}>
            <Icon name="phone" className="h-4 w-4" /> Call
          </a>
        ) : (
          <span className={buttonClass('secondary', 'pointer-events-none opacity-50 sm:px-5')} aria-disabled>
            <Icon name="phone" className="h-4 w-4" /> No phone
          </span>
        )}
        <ButtonLink to={`/patients/${p.id}/edit`} variant="secondary" className="sm:px-5">
          <Icon name="edit" className="h-4 w-4" /> Edit
        </ButtonLink>
      </div>

      {p.precautions && (
        <div className="animate-rise mt-5 flex gap-3 rounded-2xl border border-clay-500/30 bg-clay-50 p-4 [animation-delay:100ms]">
          <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-clay-600" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-clay-600">Precautions</p>
            <p className="mt-1 whitespace-pre-line text-ink">{p.precautions}</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Home visit" delay={140}>
            <Row label="Address" value={p.address} multiline />
            <Row label="Landmark" value={p.landmark} />
          </Card>
          <Card title="Clinical" delay={180}>
            <Row label="Diagnosis" value={p.diagnosis} multiline />
            <Row label="Referring doctor" value={p.referring_doctor} />
          </Card>
          <Card title="Plans of care" delay={220}>
            <p className="text-sm text-ink-soft">Plans and the visit schedule are added in Step 7.</p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Billing" delay={160}>
            <Row label="Default fee" value={formatPeso(p.default_fee)} />
            {balance && (
              <>
                <Row label="Charged" value={formatPeso(balance.total_charged)} />
                <Row label="Paid" value={formatPeso(balance.total_paid)} />
                <div className="mt-2 flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
                  <span className="text-sm font-medium">Balance</span>
                  <span className={`font-display text-xl font-semibold ${balance.balance > 0 ? 'text-clay-600' : 'text-moss-600'}`}>
                    {formatPeso(balance.balance)}
                  </span>
                </div>
              </>
            )}
          </Card>
          <Card title="Contact" delay={200}>
            <Row label="Phone" value={p.phone} href={p.phone ? telHref(p.phone) : undefined} />
            <Row label="Contact person" value={p.contact_person} />
            <Row label="Contact phone" value={p.contact_phone} href={p.contact_phone ? telHref(p.contact_phone) : undefined} />
          </Card>
          {p.notes && (
            <Card title="Notes" delay={240}>
              <p className="whitespace-pre-line text-sm text-ink">{p.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {/* Discharge / reactivate */}
      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-faint">Added {formatDate(p.created_at)} · Updated {formatDate(p.updated_at)}</p>
        <button
          onClick={() => setConfirmOpen(true)}
          className={buttonClass(discharged ? 'secondary' : 'ghost', discharged ? '' : 'text-danger-600 hover:bg-danger-50 hover:text-danger-600')}
        >
          {discharged ? 'Reactivate patient' : 'Discharge patient'}
        </button>
      </div>
      {statusError && <div className="mt-3"><ErrorBanner message={statusError} /></div>}

      <ConfirmDialog
        open={confirmOpen}
        title={discharged ? `Reactivate ${p.full_name}?` : `Discharge ${p.full_name}?`}
        body={discharged
          ? 'They’ll appear in your active list again and new plans can be created.'
          : 'They’ll move to the Discharged list. History, notes and payments are kept, and you can reactivate them anytime.'}
        confirmLabel={discharged ? 'Reactivate' : 'Discharge'}
        variant={discharged ? 'primary' : 'danger'}
        busy={statusBusy}
        onConfirm={toggleStatus}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  )
}

function BackLink() {
  return (
    <Link to="/patients" className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-teal-700">
      <Icon name="back" className="h-4 w-4" /> Patients
    </Link>
  )
}

function Card({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl border border-line bg-card p-5 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      <dl className="space-y-2.5">{children}</dl>
    </div>
  )
}

function Row({ label, value, multiline, href }: { label: string; value: string | null; multiline?: boolean; href?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className={`text-ink ${multiline ? 'whitespace-pre-line' : ''}`}>
        {value ? (href ? <a href={href} className="font-medium text-teal-700 underline underline-offset-2">{value}</a> : value)
               : <span className="text-ink-faint">—</span>}
      </dd>
    </div>
  )
}
