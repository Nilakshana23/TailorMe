import { Link, Navigate, useLocation } from 'react-router-dom'
import { afterLogin, authPath, returnDestination, safeReturnDestination } from '../utils/authNavigation'
import AuthLayout from '../components/AuthLayout'
import { useAuth } from '../auth/authContext'
import { authRedirect } from '../lib/supabase'

export default function AuthCallbackPage() {
  const location = useLocation()
  const destination = safeReturnDestination(authRedirect.returnTo) ?? returnDestination(location.search)
  const { session, loading, error } = useAuth()
  const linkError = authRedirect.error
  if (!loading && session && authRedirect.present && !linkError && !error) return <Navigate to={afterLogin(destination)} replace />
  // The shared browser client consumes the redirect session during initialization.
  // Do not exchange a code here: that would duplicate the SDK's work.
  return <AuthLayout title="Completing Sign In" subtitle="Returning to your TailorMe atelier.">
    {loading ? <p role="status">Completing sign-in…</p> : <><p role="alert">{linkError || error || 'Sign-in could not be completed. The link may be invalid or expired. Try signing in again, or request a new email confirmation link if needed.'}</p><Link className="text-primary underline" to={authPath('/login', destination)}>Back to Sign In</Link></>}
  </AuthLayout>
}
