export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your email address.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
}

export type SignupValues = { fullName: string; email: string; password: string; confirmPassword: string }
export type SignupErrors = Partial<Record<keyof SignupValues, string>>

export function validateSignup(values: SignupValues): SignupErrors {
  const errors: SignupErrors = {}
  if (!values.fullName.trim()) errors.fullName = 'Enter your full name.'
  const emailError = validateEmail(values.email)
  if (emailError) errors.email = emailError
  if (!values.password) errors.password = 'Enter a password.'
  else if (values.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (!values.confirmPassword) errors.confirmPassword = 'Confirm your password.'
  else if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords must match.'
  return errors
}
