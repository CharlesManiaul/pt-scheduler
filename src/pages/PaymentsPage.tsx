import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/Icon'
import { PaymentDialog } from '../components/PaymentDialog'
import { buttonClass } from '../components/styles'
import { Button, ConfirmDialog, ErrorBanner, Notice, Spinner } from '../components/ui'
import { toFriendlyError } from '../lib/errors'
import { formatDate, formatPeso, manilaIso, todayIso } from '../lib/format'
import {
  chargedBetween, deletePayment, listOutstanding, listPaymentsBetween, methodLabel,
  type Outstanding, type PaymentWithPatient,
} from '../lib/payments'

/** 'YYYY-MM' ± n months */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))

export function PaymentsPage() {
  const thisMonth = todayIso().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<{ key: string; payments: PaymentWithPatient[]; charged: number; outstanding: Outstanding[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | { mode: 'new' } | { mode: 'patient'; o: Outstanding } | { mode: 'edit'; p: PaymentWithPatient }>(null)
  const [deleting, setDeleting] = useState<PaymentWithPatient | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const key = `${month}|${reloadKey}`
  useEffect(() => {
    let cancelled = false
    const from = `${month}-01`, to = `${shiftMonth(month, 1)}-01`
    Promise.all([
      listPaymentsBetween(from, to),
      chargedBetween(manilaIso(from, '00:00'), manilaIso(to, '00:00')),
      listOutstanding(),
    ])
      .then(([payments, charged, outstanding]) => { if (!cancelled) { setData({ key, payments, charged, outstanding }); setError(null) } })
      .catch((e) => !cancelled && setError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [month, key])

  const loading = data?.key !== key && !error
  const payments = useMemo(() => data?.payments ?? [], [data])
  const outstanding = useMemo(() => data?.outstanding ?? [], [data])
  const collected = payments.reduce((s, p) => s + p.amount, 0)
  const owed = outstanding.reduce((s, o) => s + o.balance, 0)
  const byMethod = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of payments) m.set(methodLabel(p.method), (m.get(methodLabel(p.method)) ?? 0) + p.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [payments])

  const done = (m: { text: string }) => {
    setDialog(null)
    setMessage(m.text)
    setReloadKey((k) => k + 1)
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await deletePayment(deleting.id)
      done({ text: `Payment of ${formatPeso(deleting.amount)} from ${deleting.patient_name} deleted.` })
    } catch (e) {
      setError(toFriendlyError(e))
    } finally {
      setDeleteBusy(false)
      setDeleting(null)
    }
  }

  return (
    <section>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="animate-rise font-display text-3xl font-semibold tracking-tight sm:text-4xl">Payments</h1>
          <p className="mt-1 text-sm text-ink-soft">What came in, and who still owes.</p>
        </div>
        <Button onClick={() => setDialog({ mode: 'new' })}><Icon name="plus" className="h-4 w-4" /> Payment</Button>
      </div>

      {/* month switcher */}
      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className={buttonClass('secondary', 'w-11 px-0')}><Icon name="back" /></button>
        <button onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month" disabled={month >= thisMonth} className={buttonClass('secondary', 'w-11 px-0')}><Icon name="chevronRight" /></button>
        <h2 className="ml-1 font-display text-xl font-semibold">{monthLabel(month)}</h2>
        {month !== thisMonth && <button onClick={() => setMonth(thisMonth)} className="ml-auto text-sm font-medium text-teal-700 hover:underline">This month</button>}
      </div>

      {message && <div className="mt-4"><Notice onDismiss={() => setMessage(null)}><p>{message}</p></Notice></div>}
      {error && <div className="mt-4"><ErrorBanner message={error} onRetry={() => { setError(null); setReloadKey((k) => k + 1) }} /></div>}

      {/* headline numbers */}
      <div className={`mt-4 grid gap-3 sm:grid-cols-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        <Tile label="Collected" value={formatPeso(collected)} note={byMethod.length ? byMethod.map(([m, v]) => `${m} ${formatPeso(v)}`).join(' · ') : 'No payments yet'} tone="moss" />
        <Tile label="Earned from visits" value={formatPeso(data?.charged ?? 0)} note="Completed visits + charged no-shows" />
        <Tile label="Outstanding (all time)" value={formatPeso(owed)} note={`${outstanding.length} patient${outstanding.length === 1 ? '' : 's'} with a balance`} tone={owed > 0 ? 'clay' : undefined} />
      </div>

      {!data && !error ? (
        <div className="grid place-items-center py-16 text-teal-700"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          {/* who owes */}
          <div>
            <h3 className="font-display text-lg font-semibold">Unpaid balances</h3>
            {outstanding.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line bg-card/70 p-5 text-sm text-ink-soft">Everyone is paid up.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {outstanding.map((o) => (
                  <li key={o.patient_id} className="flex items-center gap-3 px-4 py-3">
                    <Link to={`/patients/${o.patient_id}`} className="min-w-0 flex-1">
                      <span className="block truncate font-semibold hover:text-teal-700">{o.full_name}</span>
                      {o.status === 'discharged' && <span className="text-xs text-ink-faint">Discharged</span>}
                    </Link>
                    <span className="font-display text-lg font-semibold text-clay-600">{formatPeso(o.balance)}</span>
                    <button onClick={() => setDialog({ mode: 'patient', o })} className={buttonClass('secondary', 'h-9 px-3')}>Record</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* received this month */}
          <div>
            <h3 className="font-display text-lg font-semibold">Received in {monthLabel(month).split(' ')[0]}</h3>
            {payments.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line bg-card/70 p-5 text-sm text-ink-soft">No payments recorded this month.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-3">
                    <button onClick={() => setDialog({ mode: 'edit', p })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="w-16 shrink-0 text-sm text-ink-soft">{formatDate(p.paid_on).replace(/, \d{4}$/, '')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{p.patient_name}</span>
                        <span className="block truncate text-xs text-ink-faint">{methodLabel(p.method)}{p.reference ? ` · ${p.reference}` : ''}{p.notes ? ` · ${p.notes}` : ''}</span>
                      </span>
                      <span className="font-semibold text-moss-600">{formatPeso(p.amount)}</span>
                    </button>
                    <button onClick={() => setDeleting(p)} aria-label={`Delete payment from ${p.patient_name}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-danger-50 hover:text-danger-600">
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {dialog?.mode === 'new' && <PaymentDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.mode === 'patient' && (
        <PaymentDialog patient={{ id: dialog.o.patient_id, full_name: dialog.o.full_name }} balance={dialog.o.balance}
                       onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.mode === 'edit' && (
        <PaymentDialog patient={{ id: dialog.p.patient_id, full_name: dialog.p.patient_name }} payment={dialog.p}
                       onClose={() => setDialog(null)} onDone={done} />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this payment?"
        body={deleting ? `${formatPeso(deleting.amount)} from ${deleting.patient_name} on ${formatDate(deleting.paid_on)}. Their balance goes back up by this amount.` : ''}
        confirmLabel="Delete" variant="danger" busy={deleteBusy}
        onConfirm={confirmDelete} onCancel={() => setDeleting(null)}
      />
    </section>
  )
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'moss' | 'clay' }) {
  const color = tone === 'moss' ? 'text-moss-600' : tone === 'clay' ? 'text-clay-600' : 'text-ink'
  return (
    <div className="animate-rise rounded-2xl border border-line bg-card p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold tracking-tight ${color}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-ink-soft" title={note}>{note}</p>
    </div>
  )
}
