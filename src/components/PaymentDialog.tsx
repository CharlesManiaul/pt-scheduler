import { useState } from 'react'
import { toFriendlyError } from '../lib/errors'
import { formatPeso, todayIso } from '../lib/format'
import { createPayment, PAYMENT_METHODS, updatePayment, type Payment, type PaymentMethod } from '../lib/payments'
import { PatientPicker, type PickedPatient } from './PatientPicker'
import { inputClass } from './styles'
import { Button, ErrorBanner, Field, Modal } from './ui'

/**
 * Record a new payment (optionally for a known patient, prefilled with their
 * balance) or edit an existing one.
 */
export function PaymentDialog({ patient, balance, payment, onClose, onDone }: {
  patient?: { id: string; full_name: string }
  balance?: number
  payment?: Payment
  onClose: () => void
  onDone: (m: { text: string }) => void
}) {
  const editing = Boolean(payment)
  const [picked, setPicked] = useState<PickedPatient | null>(patient ? { ...patient, default_fee: null } : null)
  const [amount, setAmount] = useState(payment ? String(payment.amount) : balance && balance > 0 ? String(balance) : '')
  const [paidOn, setPaidOn] = useState(payment?.paid_on ?? todayIso())
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? 'cash')
  const [reference, setReference] = useState(payment?.reference ?? '')
  const [notes, setNotes] = useState(payment?.notes ?? '')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const value = Number(amount)
  const amountError = !amount.trim() ? 'Enter the amount received.'
    : !/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(value > 0) ? 'Enter a valid amount (up to 2 decimals).'
    : value > 1_000_000 ? 'That amount is too large.' : null
  const dateError = !paidOn ? 'Pick the date.' : paidOn > todayIso() ? 'A payment can’t be in the future.' : null
  const patientError = !editing && !picked ? 'Pick the patient.' : null
  const valid = !amountError && !dateError && !patientError

  async function save() {
    setTouched(true)
    if (!valid) return
    setBusy(true)
    setError(null)
    const fields = { amount: value, paid_on: paidOn, method, reference: reference.trim() || null, notes: notes.trim() || null }
    try {
      if (payment) await updatePayment(payment.id, fields)
      else await createPayment({ patient_id: picked!.id, ...fields })
      onDone({ text: editing ? 'Payment updated.' : `${formatPeso(value)} received from ${picked!.full_name}.` })
    } catch (e) {
      setError(toFriendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit payment' : 'Record payment'}>
      <div className="space-y-4">
        {!patient && !editing && <PatientPicker value={picked} onChange={setPicked} />}
        {touched && patientError && <p className="-mt-2 text-sm text-danger-600">{patientError}</p>}
        {patient && balance !== undefined && (
          <p className="rounded-xl bg-paper px-3.5 py-2.5 text-sm">
            <b>{patient.full_name}</b> · balance <b className={balance > 0 ? 'text-clay-600' : 'text-moss-600'}>{formatPeso(balance)}</b>
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" htmlFor="pay_amount" error={touched ? amountError : null}>
            <input id="pay_amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount}
                   onChange={(e) => setAmount(e.target.value)} className={`${inputClass(touched && Boolean(amountError))} h-12`} />
          </Field>
          <Field label="Date" htmlFor="pay_date" error={touched ? dateError : null}>
            <input id="pay_date" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)}
                   className={inputClass(touched && Boolean(dateError))} />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium">Method</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Payment method">
            {PAYMENT_METHODS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMethod(m.value)} aria-pressed={method === m.value}
                      className={`h-10 rounded-xl px-3.5 text-sm font-medium transition ${
                        method === m.value ? 'bg-teal-700 text-white' : 'border border-line bg-paper/60 text-ink-soft hover:border-teal-600'
                      }`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {method !== 'cash' && (
          <Field label="Reference no." htmlFor="pay_ref" optional>
            <input id="pay_ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)}
                   placeholder="GCash / bank reference" className={`${inputClass()} h-12`} />
          </Field>
        )}
        <Field label="Notes" htmlFor="pay_notes" optional>
          <input id="pay_notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)}
                 placeholder="e.g. paid for 4 sessions" className={`${inputClass()} h-12`} />
        </Field>
      </div>

      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} onClick={save}>{editing ? 'Save' : 'Record payment'}</Button>
      </div>
    </Modal>
  )
}
