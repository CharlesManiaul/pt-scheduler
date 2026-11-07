import { Navigate, Outlet, useLocation } from 'react-router'
import { SplashScreen } from '../components/SplashScreen'
import { useAuth } from './authContext'

// Route guard: everything nested under it needs a signed-in user.
// This is a UX guard only; the real protection is Row Level Security.
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <SplashScreen />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
