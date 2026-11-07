import { createHashRouter, Link } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SplashScreen } from './components/SplashScreen'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { Placeholder } from './pages/Placeholder'
import { PatientDetailPage } from './pages/patients/PatientDetailPage'
import { PatientFormPage } from './pages/patients/PatientFormPage'
import { PatientsPage } from './pages/patients/PatientsPage'
import { SetupCheckPage } from './pages/SetupCheckPage'
import { TodayPage } from './pages/TodayPage'
import { PlanDetailPage } from './pages/plans/PlanDetailPage'
import { PlanFormPage } from './pages/plans/PlanFormPage'

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
            // loaded on first visit: keeps the calendar library out of the initial download
            path: 'calendar',
            lazy: async () => ({ Component: (await import('./pages/CalendarPage')).CalendarPage }),
            HydrateFallback: SplashScreen,
          },
          { path: 'patients', element: <PatientsPage /> },
          { path: 'patients/new', element: <PatientFormPage /> },
          { path: 'patients/:id', element: <PatientDetailPage /> },
          { path: 'patients/:id/edit', element: <PatientFormPage /> },
          { path: 'patients/:id/plans/new', element: <PlanFormPage /> },
          { path: 'plans/:id', element: <PlanDetailPage /> },
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
