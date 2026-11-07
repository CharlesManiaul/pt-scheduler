import { createHashRouter, Link } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { Placeholder } from './pages/Placeholder'
import { SetupCheckPage } from './pages/SetupCheckPage'
import { TodayPage } from './pages/TodayPage'

// Hash URLs (#/patients) so GitHub Pages never returns 404 on refresh.
const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/setup', element: <SetupCheckPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <TodayPage /> },
          {
            path: 'calendar',
            element: <Placeholder title="Calendar" step="the calendar step"
              description="Day and week views of every visit, with drag-to-reschedule." />,
          },
          {
            path: 'patients',
            element: <Placeholder title="Patients" step="Step 6"
              description="Patient list, profiles, addresses with a Google Maps link, and plans of care." />,
          },
          {
            path: 'payments',
            element: <Placeholder title="Payments" step="the payments step"
              description="Record payments, see balances per patient and monthly earnings." />,
          },
          {
            path: 'settings',
            element: <Placeholder title="Settings" step="a later step"
              description="Default session length, travel buffer and your display name." />,
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFound /> },
])

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-6xl font-semibold text-teal-700">404</p>
        <p className="mt-2 text-ink-soft">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-block font-semibold text-clay-600 underline underline-offset-4">
          Back to today
        </Link>
      </div>
    </main>
  )
}
