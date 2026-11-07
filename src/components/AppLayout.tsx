import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/authContext'
import { supabase } from '../lib/supabase'
import { Icon, type IconName } from './Icon'

const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/patients', label: 'Patients', icon: 'patients' },
  { to: '/payments', label: 'Payments', icon: 'payments' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

// App shell: side rail on desktop, top bar + bottom tabs on phones.
export function AppLayout() {
  const { session } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    // AuthProvider sees SIGNED_OUT and RequireAuth sends us to /login
    await supabase.auth.signOut()
    setSigningOut(false)
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop side rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper-deep/60 p-5 md:flex">
        <Wordmark />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-medium transition ${
                  isActive ? 'bg-teal-700 text-white shadow-card' : 'text-ink-soft hover:bg-card hover:text-ink'
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="truncate text-xs text-ink-faint" title={session?.user.email}>{session?.user.email}</p>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-2 flex items-center gap-2 text-sm font-medium text-ink-soft hover:text-clay-600 disabled:opacity-60"
          >
            <Icon name="logout" className="h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:hidden">
        <Wordmark />
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-card"
          aria-label="Sign out"
        >
          <Icon name="logout" />
        </button>
      </header>

      <main className="px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-10">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>

      {/* Phone bottom tabs (thumb reach) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        aria-label="Main"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-medium transition ${
                isActive ? 'text-clay-600' : 'text-ink-faint'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${isActive ? 'bg-clay-50' : ''}`}>
                  <Icon name={item.icon} />
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="./favicon.svg" alt="" className="h-8 w-8" />
      <span className="font-display text-lg font-semibold tracking-tight text-ink">
        PT <span className="italic font-normal text-teal-600">Scheduler</span>
      </span>
    </div>
  )
}
