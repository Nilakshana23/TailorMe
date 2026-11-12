import { useRef, useState } from 'react'
import { authError, authService } from '../services/authService'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import FormInput from '../components/ui/FormInput'
import FormButton from '../components/ui/FormButton'
import { validateEmail } from '../utils/authValidation'

export default function ForgotPasswordPage() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const email = event.currentTarget.elements.namedItem('email') as HTMLInputElement
    const nextError = validateEmail(email.value)
    setError(nextError)
    setMessage('')
    if (nextError) {
      email.focus()
      return
    }
    busy.current = true; setPending(true)
    try {
      const { error } = await authService.resetPassword(email.value)
      if (error) throw error
      setMessage('If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.')
    } catch (cause) { setMessage(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }

  return <AuthLayout title="Reset Password" subtitle="Enter your email to request a password reset.">
    <form noValidate className="space-y-8" onSubmit={handleSubmit} onChange={() => setMessage('')}>
      <FormInput id="email" name="email" label="Email Address" type="email" autoComplete="email" required placeholder="name@artisan.com" error={error} />
      <FormButton type="submit" disabled={pending}>{pending ? 'Sending reset email…' : 'Send Reset Email'}</FormButton>
    </form>
    <p role="status" aria-live="polite" aria-atomic="true" className={message ? 'mt-6 text-sm text-on-surface-variant' : ''}>{message}</p>
    <p className="mt-8 text-center"><Link className="font-bold text-primary hover:underline underline-offset-4" to="/login">Back to Sign In</Link></p>
  </AuthLayout>
}
