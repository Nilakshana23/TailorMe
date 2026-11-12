import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authError, authService } from '../services/authService'
import { afterLogin, authPath, returnDestination } from '../utils/authNavigation'
import AuthLayout from '../components/AuthLayout'
import FormInput from '../components/ui/FormInput'
import FormButton from '../components/ui/FormButton'
import PasswordInput from '../components/ui/PasswordInput'
import { validateSignup } from '../utils/authValidation'
import type { SignupErrors, SignupValues } from '../utils/authValidation'

export default function SignupPage() {
  const navigate = useNavigate()
  const destination = returnDestination(useLocation().search)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<SignupErrors>({})
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const form = event.currentTarget
    const fields = ['fullName', 'email', 'password', 'confirmPassword'] as const
    const values = Object.fromEntries(fields.map((field) => [field, (form.elements.namedItem(field) as HTMLInputElement).value])) as SignupValues
    const nextErrors = validateSignup(values)
    setErrors(nextErrors)
    setMessage('')
    const firstInvalid = fields.find((field) => nextErrors[field])
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLInputElement).focus()
      return
    }
    busy.current = true; setPending(true)
    try {
      const { data, error } = await authService.signUp(values.fullName, values.email, values.password, destination)
      if (error) throw error
      form.reset()
      if (data.session) navigate(afterLogin(destination), { replace: true })
      else setMessage('Check your email for a confirmation link before signing in. If you already have an account, try signing in or resetting your password.')
    } catch (cause) { setMessage(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }

  return <AuthLayout title="Create an Account" subtitle="Begin your bespoke journey as a customer.">
    <form noValidate className="space-y-8" onSubmit={handleSubmit} onChange={() => setMessage('')}>
      <FormInput id="fullName" name="fullName" label="Full Name" autoComplete="name" required placeholder="Your full name" error={errors.fullName} />
      <FormInput id="email" name="email" label="Email Address" type="email" autoComplete="email" required placeholder="name@artisan.com" error={errors.email} />
      <PasswordInput id="password" label="Password" error={errors.password} />
      <PasswordInput id="confirmPassword" label="Confirm Password" error={errors.confirmPassword} />
      <FormButton type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create Customer Account'}</FormButton>
    </form>
    <p role="status" aria-live="polite" aria-atomic="true" className={message ? 'mt-6 text-sm text-on-surface-variant' : ''}>{message}</p>
    <aside className="mt-8 rounded-lg bg-surface-container-low p-4 text-sm text-on-surface-variant">
      <p className="font-semibold text-secondary">Want to join as a tailor?</p>
      <p className="mt-2">Create your customer account first, then apply to join as a tailor. Your application will be reviewed by an admin.</p>
      <Link className="inline-block mt-3 underline text-primary" to="/become-a-tailor">Learn about becoming a tailor</Link>
    </aside>
    <p className="mt-8 text-center text-on-surface-variant">Already have an account? <Link className="font-bold text-primary hover:underline underline-offset-4" to={authPath('/login', destination)}>Sign In</Link></p>
  </AuthLayout>
}
