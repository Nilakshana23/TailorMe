import { afterLogin, authPath, returnDestination } from '../utils/authNavigation'
import AuthLayout from '../components/AuthLayout'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { authError, authService } from '../services/authService'
import FormInput from '../components/ui/FormInput'
import FormButton from '../components/ui/FormButton'

type Errors = { email?: string; password?: string }

export default function LoginPage() {
  const navigate = useNavigate()
  const destination = returnDestination(useLocation().search)
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [googlePending, setGooglePending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')

  async function handleGoogleSignIn() {
    if (busy.current) return
    busy.current = true; setGooglePending(true); setMessage(''); setErrors({})
    try {
      const { data, error } = await authService.signInWithGoogle(destination)
      if (error) throw error
      if (!data.url) throw new Error('Google sign-in did not provide a redirect. Please try again.')
      // The SDK navigates to Google. Keep both submit actions locked until navigation.
    } catch (cause) {
      setMessage(`Unable to start Google sign-in. ${authError(cause)}`)
      busy.current = false; setGooglePending(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const form = event.currentTarget
    const emailInput = form.elements.namedItem('email') as HTMLInputElement
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement
    const nextErrors: Errors = {}
    if (!emailInput.value.trim()) nextErrors.email = 'Enter your email address.'
    else if (emailInput.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!passwordInput.value) nextErrors.password = 'Enter your password.'
    setErrors(nextErrors)
    setMessage('')
    if (nextErrors.email || nextErrors.password) {
      if (nextErrors.email) emailInput.focus()
      else passwordInput.focus()
      return
    }
    busy.current = true; setPending(true)
    try {
      const { error } = await authService.signIn(emailInput.value, passwordInput.value)
      if (error) throw error
      passwordInput.value = ''; setShowPassword(false)
      navigate(afterLogin(destination), { replace: true })
    } catch (cause) { setMessage(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }

  return (
    <AuthLayout title="Welcome Back" subtitle="Sign in to your private atelier.">
            <form className="space-y-8" noValidate onSubmit={handleSubmit} onChange={() => { setErrors({}); setMessage('') }}>
              <FormInput id="email" name="email" label="Email Address" type="email" autoComplete="email" required placeholder="name@artisan.com" error={errors.email} />
              <FormInput id="password" name="password" label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="••••••••" error={errors.password}
                labelAction={<Link to="/forgot-password" className="text-label-sm text-secondary hover:text-primary">Forgot Password?</Link>}
                trailingControl={<button type="button" className="absolute right-0 top-0 min-w-11 min-h-11 flex items-center justify-center" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword((visible) => !visible)}><span aria-hidden="true" className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span></button>} />
              <FormButton type="submit" disabled={pending || googlePending} className="group">{pending ? 'Signing in…' : 'Continue to Collection'}<span aria-hidden="true" className="material-symbols-outlined text-[20px] group-hover:translate-x-1 transition-transform">arrow_forward</span></FormButton>
            </form>
            <div className="relative my-10 text-center">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-outline-variant/30" /></div>
              <span className="relative px-4 bg-surface-container-lowest text-label-sm text-on-surface-variant uppercase tracking-widest">or continue with</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormButton type="button" variant="secondary" disabled={pending || googlePending} aria-busy={googlePending} onClick={handleGoogleSignIn}><svg aria-hidden="true" focusable="false" className="w-5 h-5" viewBox="0 0 24 24">
<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 1.16-4.53z" fill="#EA4335"></path>
</svg><span>{googlePending ? 'Opening Google…' : 'Google'}</span></FormButton>
            </div>
            <footer className="mt-12 text-center">
              <p className="text-body-md text-on-surface-variant">New to TailorMe? <Link to={authPath('/signup', destination)} className="font-bold text-primary hover:underline underline-offset-4 ml-1">Create an account</Link></p>
            </footer>
            <p role="status" aria-live="polite" aria-atomic="true" className={message || googlePending ? 'mt-6 text-sm text-on-surface-variant' : ''}>{message || (googlePending ? 'Redirecting to Google to sign in…' : '')}</p>
    </AuthLayout>
  )
}
