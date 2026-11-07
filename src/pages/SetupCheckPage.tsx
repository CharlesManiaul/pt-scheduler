import { useEffect, useState } from 'react'
import { checkSupabaseConnection, isSupabaseConfigured } from '../lib/supabase'

type CheckState = { status: 'checking' } | { status: 'ok' | 'error'; message: string }

// Step 4 setup page: proves the build, the deploy pipeline and the
// Supabase connection all work. Public page: open it at #/setup
export function SetupCheckPage() {
  const [check, setCheck] = useState<CheckState>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    checkSupabaseConnection().then((result) => {
      if (!cancelled) setCheck({ status: result.ok ? 'ok' : 'error', message: result.message })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows: Array<{ label: string; ok: boolean | null; detail: string }> = [
    { label: 'App build', ok: true, detail: `Built ${__BUILD_TIME__}` },
    {
      label: 'Supabase settings',
      ok: isSupabaseConfigured,
      detail: isSupabaseConfigured ? 'URL and publishable key found' : 'Missing environment variables',
    },
    {
      label: 'Supabase connection',
      ok: check.status === 'checking' ? null : check.status === 'ok',
      detail: check.status === 'checking' ? 'Checking…' : check.message,
    },
  ]

  return (
    <main className="min-h-dvh px-4 py-10 text-ink">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="font-display text-2xl font-semibold">PT Scheduler</h1>
            <p className="text-sm text-ink-soft">Setup check</p>
          </div>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line bg-card shadow-sm">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-3 p-4">
              <StatusDot ok={row.ok} />
              <div>
                <p className="font-medium">{row.label}</p>
                <p className="text-sm text-ink-soft">{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-center text-xs text-ink-faint">All green = the app can reach its database. <a href="#/login" className="underline">Go to sign in</a></p>
      </div>
    </main>
  )
}

function StatusDot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? 'bg-amber-400 animate-pulse' : ok ? 'bg-teal-600' : 'bg-red-500'
  return <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden />
}
