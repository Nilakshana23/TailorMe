import { authPath } from '../utils/authNavigation'
import { configurationError, supabase } from '../lib/supabase'

function client() {
  if (!supabase) throw new Error(configurationError!)
  return supabase
}

export const authService = {
  signUp: (fullName: string, email: string, password: string, destination?: string | null) => client().auth.signUp({
    email: email.trim(), password,
    options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin + authPath('/auth/callback', destination) },
  }),
  signIn: (email: string, password: string) => client().auth.signInWithPassword({ email: email.trim(), password }),
  signInWithGoogle: (destination?: string | null) => client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + authPath('/auth/callback', destination) },
  }),
  signOut: () => client().auth.signOut(),
  resetPassword: (email: string) => client().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin + '/reset-password',
  }),
  updatePassword: (password: string) => client().auth.updateUser({ password }),
}

export function authError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
