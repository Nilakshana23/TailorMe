import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { authPath } from '../utils/authNavigation'
import AuthLayout from '../components/AuthLayout'
import FormButton from '../components/ui/FormButton'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from './authContext'
import { dashboardPath, usePortal } from './portalContext'
import type { PortalRole } from './portalContext'

export function PortalStatusMessage() {
  const { status, error, retry } = usePortal()
  if (status === 'loading') return <p role="status" aria-live="polite">Loading your profile and portal access…</p>
  if (status === 'ready') return null
  const message = status === 'missing-profile' ? 'Your profile is missing. Ask the project owner to check the account backfill.'
    : status === 'missing-role' ? 'Your portal role is missing. Ask the project owner to check your role assignment.'
    : `Unable to load your portal access. ${error}`
  return <div className="space-y-4"><p role="alert">{message}</p><FormButton onClick={retry}>Retry</FormButton></div>
}

export default function PortalGuard({ role: requiredRole, children, authenticatedOnly = false }: { role?: PortalRole; children?: ReactNode; authenticatedOnly?: boolean }) {
  const location = useLocation()
  const { session, loading, error, recovery } = useAuth()
  const { status, role } = usePortal()
  if (loading) return <AuthLayout title="Your Atelier" subtitle=""><p role="status">Restoring your session…</p></AuthLayout>
  if (!session) return <Navigate to={authPath('/login', location.pathname + location.search + location.hash)} replace />
  if (recovery) return <Navigate to="/reset-password" replace />
  if (authenticatedOnly) return error ? <AuthLayout title="Your Atelier" subtitle="Account access"><p role="alert">{error}</p></AuthLayout> : children
  if (error || status !== 'ready' || !role) return <AuthLayout title="Your Atelier" subtitle="Account access">
    {error ? <p role="alert">{error}</p> : <PortalStatusMessage />}
    <Link className="block my-6 underline" to="/account">View your account</Link><LogoutButton />
  </AuthLayout>
  if (!requiredRole || role !== requiredRole) return <Navigate to={dashboardPath(role)} replace />
  return children
}
