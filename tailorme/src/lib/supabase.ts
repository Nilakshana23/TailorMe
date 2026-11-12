import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Capture redirect details before the SDK consumes and removes the URL fragment.
const hash = new URLSearchParams(window.location.hash.slice(1))
const query = new URLSearchParams(window.location.search)
export const authRedirect = {
  returnTo: query.get('returnTo'),
  present: hash.has('access_token') || query.has('code'),
  error: hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error'),
}

export const configurationError = !url || !key
  ? 'Authentication is unavailable. Configure the Supabase environment variables and restart the app.'
  : null

export const supabase = configurationError ? null : createClient(url, key)
