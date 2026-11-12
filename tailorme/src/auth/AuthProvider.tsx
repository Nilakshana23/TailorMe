import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { configurationError, supabase } from '../lib/supabase'
import { AuthContext } from './authContext'
import { authError } from '../services/authService'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(configurationError)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let changed = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      changed = true
      setSession(nextSession)
      if (nextSession) setError(null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setLoading(false)
    })
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || changed) return
      setSession(data.session)
      if (sessionError) setError(sessionError.message)
      setLoading(false)
    }).catch((cause: unknown) => {
      if (active && !changed) { setError(authError(cause)); setLoading(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  return <AuthContext.Provider value={{ session, loading, error, recovery, finishRecovery: () => setRecovery(false) }}>{children}</AuthContext.Provider>
}
