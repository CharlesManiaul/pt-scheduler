import { AuthError } from '@supabase/supabase-js'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/authContext'
import { Icon } from '../components/Icon'
import { RouteMotif } from '../components/RouteMotif'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Turn Supabase / network errors into plain language.
function toFriendlyMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code === 'invalid_credentials') return 'Email or password is incorrect.'
    if (error.code === 'email_not_confirmed') return 'This account is not confirmed yet. Confirm it in Supabase → Authentication → Users.'
    if (error.status === 429) return 'Too many attempts. Wait a minute, then try again.'
    if (error.name === 'AuthRetryableFetchError') return "Can't reach the server. Check your internet connection."
    return error.message
  }
  return "Can't reach the server. Check your internet connection."
}

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState({ email: false, password: false })

  if (session) return <Navigate to={from} replace />

  const emailError = touched.email && !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : null
  const passwordError = touched.password && password.length < 6 ? 'Password must be at least 6 characters.' : null
  const canSubmit = EMAIL_PATTERN.test(email.trim()) && password.length >= 6 && !submitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTouched({ email: true, password: true })
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (signInError) setError(toFriendlyMessage(signInError))
      // on success, AuthProvider receives SIGNED_IN and <Navigate> above takes over
    } catch (caught) {
      setError(toFriendlyMessage(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:px-10">
      {/* Left / top: the story */}
      <section className="px-6 pt-10 text-teal-700 lg:px-0 lg:pt-0">
        <p className="animate-rise font-sans text-xs font-semibold uppercase tracking-[0.22em] text-clay-600">
          PT Scheduler
        </p>
        <h1 className="animate-rise mt-3 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-ink [animation-delay:80ms] sm:text-6xl">
          Your rounds,
          <br />
          <span className="italic font-normal text-teal-600">in order.</span>
        </h1>
        <p className="animate-rise mt-4 max-w-sm text-base text-ink-soft [animation-delay:160ms]">
          Home visits, plans of care and notes, ready on your phone before the first doorbell.
        </p>
        <RouteMotif className="mt-6 w-full max-w-md lg:mt-12" />
      </section>

      {/* Right / bottom: the form */}
      <section className="px-4 pt-4 pb-10 lg:px-0 lg:pb-0">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="animate-rise rounded-3xl border border-line bg-card p-6 shadow-card [animation-delay:240ms] sm:p-8"
        >
          <h2 className="font-display text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-ink-soft">Use the account set up for this app.</p>

          {!isSupabaseConfigured && (
            <p className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">
              The app is missing its Supabase settings. Check <code>.env.local</code> or the GitHub variables.
            </p>
          )}

          <div className="mt-6 space-y-4">
            <Field label="Email" error={emailError} htmlFor="email">
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? 'email-error' : undefined}
                className={inputClass(Boolean(emailError))}
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password" error={passwordError} htmlFor="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  className={`${inputClass(Boolean(passwordError))} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink-faint hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>
            </Field>
          </div>

          {error && (
            <div role="alert" className="mt-5 flex gap-2 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-clay-500 font-semibold text-white shadow-[0_6px_16px_-6px_var(--color-clay-600)] transition hover:bg-clay-600 active:translate-y-px disabled:cursor-wait disabled:opacity-70"
          >
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-5 text-center text-xs text-ink-faint">
            Forgot your password? Ask the app admin to reset it in Supabase.
          </p>
        </form>
      </section>
    </main>
  )
}

function inputClass(hasError: boolean) {
  return [
    'h-12 w-full rounded-xl border bg-paper/60 px-4 text-base text-ink placeholder:text-ink-faint',
    'transition outline-none focus:bg-card focus:ring-4',
    hasError
      ? 'border-danger-600 focus:ring-danger-50'
      : 'border-line focus:border-teal-600 focus:ring-teal-600/15',
  ].join(' ')
}

function Field({ label, error, htmlFor, children }: {
  label: string
  error: string | null
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {error && <p id={`${htmlFor}-error`} className="mt-1.5 text-sm text-danger-600">{error}</p>}
    </div>
  )
}
