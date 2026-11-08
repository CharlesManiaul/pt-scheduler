import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/authContext'
import { Icon } from '../components/Icon'
import { inputClass } from '../components/styles'
import { Button, ErrorBanner, Field, Notice, Spinner } from '../components/ui'
import { downloadBackup, lastBackupAt } from '../lib/backup'
import { toFriendlyError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { getSettings, updateSettings } from '../lib/plans'
import { supabase } from '../lib/supabase'

export function SettingsPage() {
  const { session } = useAuth()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('60')
  const [buffer, setBuffer] = useState('30')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        setName(s.therapist_name ?? '')
        setMinutes(String(s.default_session_minutes))
        setBuffer(String(s.default_buffer_minutes))
        setLoaded(true)
      })
      .catch((e) => !cancelled && setLoadError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [])

  const mins = Number(minutes), buf = Number(buffer)
  const minutesError = Number.isInteger(mins) && mins >= 15 && mins <= 240 ? null : 'Between 15 and 240 minutes.'
  const bufferError = Number.isInteger(buf) && buf >= 0 && buf <= 180 ? null : 'Between 0 and 180 minutes.'

  async function save() {
    if (!session || minutesError || bufferError) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateSettings(session.user.id, {
        therapist_name: name.trim().replace(/\s+/g, ' ') || null,
        default_session_minutes: mins,
        default_buffer_minutes: buf,
      })
      setMessage('Settings saved.')
    } catch (e) {
      setSaveError(toFriendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h1 className="animate-rise font-display text-3xl font-semibold tracking-tight sm:text-4xl">Settings</h1>
      {message && <div className="mt-4"><Notice onDismiss={() => setMessage(null)}><p>{message}</p></Notice></div>}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card title="Scheduling" delay={0}>
          {loadError ? <ErrorBanner message={loadError} /> : !loaded ? (
            <div className="grid place-items-center py-8 text-teal-700"><Spinner className="h-6 w-6" /></div>
          ) : (
            <div className="space-y-4">
              <Field label="Your name" htmlFor="set_name" optional hint="Used in the greeting on the Today screen.">
                <input id="set_name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
                       placeholder="e.g. Anna Reyes, PTRP" className={`${inputClass()} h-12`} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Visit length (min)" htmlFor="set_min" error={minutesError}>
                  <input id="set_min" type="number" inputMode="numeric" min={15} max={240} step={5} value={minutes}
                         onChange={(e) => setMinutes(e.target.value)} className={`${inputClass(Boolean(minutesError))} h-12`} />
                </Field>
                <Field label="Travel buffer (min)" htmlFor="set_buf" error={bufferError}>
                  <input id="set_buf" type="number" inputMode="numeric" min={0} max={180} step={5} value={buffer}
                         onChange={(e) => setBuffer(e.target.value)} className={`${inputClass(Boolean(bufferError))} h-12`} />
                </Field>
              </div>
              <p className="text-xs text-ink-faint">
                Visit length is the default for new plans and one-off visits. The travel buffer is the gap you want between visits;
                shorter gaps get a warning. Times are always Philippine time (Asia/Manila).
              </p>
              {saveError && <ErrorBanner message={saveError} />}
              <Button loading={saving} disabled={Boolean(minutesError || bufferError)} onClick={save}>Save settings</Button>
            </div>
          )}
        </Card>

        <BackupCard />

        <PasswordCard onDone={(text) => setMessage(text)} />

        <Card title="Account" delay={180}>
          <p className="text-sm text-ink-soft">Signed in as</p>
          <p className="font-semibold">{session?.user.email}</p>
          <Button variant="secondary" className="mt-4" onClick={() => supabase.auth.signOut()}>
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </Button>
          <p className="mt-6 text-xs text-ink-faint">
            Your data is stored in your private Supabase database and only this account can read it.
          </p>
        </Card>
      </div>
    </section>
  )
}

function BackupCard() {
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(() => lastBackupAt())
  const [openedAt] = useState(() => Date.now())
  const stale = !last || openedAt - new Date(last).getTime() > 7 * 86_400_000

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await downloadBackup((table) => setStep(table.replace('_', ' ')))
      const c = r.counts
      setResult(`${r.fileName}: ${c.patients} patients, ${c.care_plans} plans, ${c.sessions} visits, ${c.session_notes} notes, ${c.payments} payments.`)
      setLast(lastBackupAt())
    } catch (e) {
      setError(toFriendlyError(e))
    } finally {
      setBusy(false)
      setStep(null)
    }
  }

  return (
    <Card title="Backup" delay={60}>
      <p className="text-sm text-ink-soft">
        Downloads everything (patients, plans, visits, notes, payments) as one file. The free database has no automatic
        backups, so keep a copy somewhere safe, like Google Drive.
      </p>
      <p className={`mt-3 text-sm font-medium ${stale ? 'text-clay-600' : 'text-moss-600'}`}>
        {last ? `Last backup on this device: ${formatDate(last)}` : 'No backup downloaded on this device yet.'}
        {last && stale && ' (over a week ago)'}
      </p>
      {error && <div className="mt-3"><ErrorBanner message={error} /></div>}
      {result && <p className="mt-3 rounded-xl bg-moss-600/10 px-3.5 py-2.5 text-sm text-ink">{result}</p>}
      <Button className="mt-4" loading={busy} onClick={run}>
        {busy ? `Exporting ${step ?? ''}…` : 'Download backup'}
      </Button>
      <p className="mt-2 text-xs text-ink-faint">The file contains patient health information: store it privately.</p>
    </Card>
  )
}

function PasswordCard({ onDone }: { onDone: (text: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const tooShort = password.length < 8
  const mismatch = password !== confirm
  async function save() {
    setTouched(true)
    if (tooShort || mismatch) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (e) { setError(toFriendlyError(e)); return }
    setPassword(''); setConfirm(''); setTouched(false)
    onDone('Password changed. Use the new password next time you sign in.')
  }

  return (
    <Card title="Change password" delay={120}>
      <div className="space-y-3">
        <Field label="New password" htmlFor="pw_new" error={touched && tooShort ? 'At least 8 characters.' : null}>
          <input id="pw_new" type={show ? 'text' : 'password'} autoComplete="new-password" maxLength={72} value={password}
                 onChange={(e) => setPassword(e.target.value)} className={`${inputClass(touched && tooShort)} h-12`} />
        </Field>
        <Field label="Repeat new password" htmlFor="pw_confirm" error={touched && !tooShort && mismatch ? 'Passwords don’t match.' : null}>
          <input id="pw_confirm" type={show ? 'text' : 'password'} autoComplete="new-password" maxLength={72} value={confirm}
                 onChange={(e) => setConfirm(e.target.value)} className={`${inputClass(touched && !tooShort && mismatch)} h-12`} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-teal-700" /> Show passwords
        </label>
        {error && <ErrorBanner message={error} />}
        <Button variant="secondary" loading={busy} onClick={save}>Change password</Button>
      </div>
    </Card>
  )
}

function Card({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl border border-line bg-card p-5 shadow-card sm:p-6" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="mb-4 font-display text-xl font-semibold">{title}</h2>
      {children}
    </div>
  )
}
