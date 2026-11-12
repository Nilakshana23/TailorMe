import { Link, Navigate } from 'react-router-dom'
import ProfilePhotoEditor from '../components/portal/ProfilePhotoEditor'
import AuthLayout from '../components/AuthLayout'
import LogoutButton from '../components/LogoutButton'
import { useAuth } from '../auth/authContext'
import { dashboardPath, usePortal } from '../auth/portalContext'
import { PortalStatusMessage } from '../auth/PortalGuard'

export default function AccountPage() {
  const { session, loading, error } = useAuth()
  const { profile, role, status } = usePortal()
  if (loading) return <AuthLayout title="Your Account" subtitle=""><p role="status">Loading your account…</p></AuthLayout>
  if (!session) return <Navigate to="/login" replace />
  return <AuthLayout title="Your Account" subtitle="Your TailorMe profile.">
    <PortalStatusMessage />
    <dl className="space-y-3 my-6"><dt className="font-bold">Full Name</dt><dd>{profile?.full_name || 'Name not provided'}</dd><dt className="font-bold">Email Address</dt><dd className="break-words">{session.user.email}</dd></dl>
    {status === 'ready' && role && <Link className="block mb-6 font-semibold underline" to={dashboardPath(role)}>Go to your {role} dashboard</Link>}
    {status==='ready'&&(role==='customer'||role==='tailor')&&<ProfilePhotoEditor key={session.user.id}/>}
    <LogoutButton /><p role="alert" className="mt-6 text-sm">{error}</p>
  </AuthLayout>
}
