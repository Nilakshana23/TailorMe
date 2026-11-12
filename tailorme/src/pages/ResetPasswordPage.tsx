import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormButton from '../components/ui/FormButton'
import PasswordInput from '../components/ui/PasswordInput'
import { useAuth } from '../auth/authContext'
import { authError, authService } from '../services/authService'
import { authRedirect } from '../lib/supabase'

export default function ResetPasswordPage() {
  const { session, loading, recovery, finishRecovery, error } = useAuth()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [complete, setComplete] = useState(false)
  const busy = useRef(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || !session || !recovery || authRedirect.error) return
    const form = event.currentTarget
    const password = form.elements.namedItem('password') as HTMLInputElement
    const confirm = form.elements.namedItem('confirmPassword') as HTMLInputElement
    if (password.value.length < 8 || password.value !== confirm.value) {
      setMessage('Use at least 8 characters and make sure both passwords match.'); password.focus(); return
    }
    busy.current = true; setPending(true); setMessage('')
    try {
      const { error } = await authService.updatePassword(password.value)
      if (error) throw error
      form.reset(); setComplete(true); finishRecovery()
    } catch (cause) { setMessage(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }
  return <AuthLayout title="Choose a New Password" subtitle="Secure your TailorMe account.">
    {loading ? <p role="status">Checking your reset link…</p> : complete ? <><p role="status">Your password has been updated.</p><Link to="/account" className="text-primary underline">Continue to your account</Link></> : session && recovery && !authRedirect.error ?
      <form className="space-y-8" onSubmit={submit} aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-8"><PasswordInput id="password" label="New Password" /><PasswordInput id="confirmPassword" label="Confirm Password" /><FormButton type="submit" disabled={pending}>{pending ? 'Updating password…' : 'Update Password'}</FormButton></fieldset>
      </form> : <><p role="alert">{error || 'This reset link is invalid or expired. Request a new password reset email. If you refreshed this page, reopen the email link or request a new one.'}</p><Link to="/forgot-password" className="text-primary underline">Request a new reset link</Link></>}
    <p role="alert" className="mt-6 text-sm">{message}</p>
  </AuthLayout>
}
