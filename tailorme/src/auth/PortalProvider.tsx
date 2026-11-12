import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './authContext'
import { PortalContext } from './portalContext'
import type { PortalRole, Profile, PortalStatus } from './portalContext'
import { supabase } from '../lib/supabase'
import { authError } from '../services/authService'

type Result = { key: string; profile: Profile | null; role: PortalRole | null; status: PortalStatus; error: string }

export default function PortalProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  // Tag results so a previous user's data cannot render during account changes.
  const userId = session?.user.id
  // Refresh role data when a token rotates, without unmounting the same user's
  // editors/chat drafts. Account switches and explicit retries still mask data.
  const key = `${userId ?? ''}:${attempt}`
  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    let active = true
    async function load() {
      try {
        const [profileResult, roleResult] = await Promise.all([
          client.from('profiles').select('id, full_name, avatar_path, created_at, updated_at').eq('id', userId!).maybeSingle(),
          client.from('user_roles').select('role').eq('user_id', userId!).maybeSingle(),
        ])
        if (profileResult.error) throw new Error(profileResult.error.message)
        if (roleResult.error) throw new Error(roleResult.error.message)
        const profile = profileResult.data as Profile | null
        const value: unknown = roleResult.data?.role
        const role = value === 'customer' || value === 'tailor' || value === 'admin' ? value : null
        if (value != null && !role) throw new Error('Your account has an unsupported role. Contact the project owner.')
        if (active) setResult({ key, profile, role, status: !profile ? 'missing-profile' : !role ? 'missing-role' : 'ready', error: '' })
      } catch (cause) {
        if (active) setResult({ key, profile: null, role: null, status: 'error', error: authError(cause) })
      }
    }
    void load()
    return () => { active = false }
  }, [key, userId, session?.access_token])

  // Refresh the avatar only: do not mask portal access or unmount open drafts.
  useEffect(()=>{
    if(!supabase||!userId)return
    const client=supabase;let active=true,revision=0
    const refresh=()=>{const requestRevision=++revision;void client.from('profiles').select('avatar_path').eq('id',userId).single().then(({data,error})=>{
      if(active&&requestRevision===revision&&!error)setResult(previous=>previous?.key===key&&previous.profile?{...previous,profile:{...previous.profile,avatar_path:data.avatar_path}}:previous)
    },()=>{/* Keep the current avatar and portal access after a failed refresh. */})}
    window.addEventListener('tailorme:avatar-changed',refresh)
    return()=>{active=false;window.removeEventListener('tailorme:avatar-changed',refresh)}
  },[userId,key])
  const current = result?.key === key ? result : null
  return <PortalContext.Provider value={{ profile: current?.profile ?? null, role: current?.role ?? null,
    status: current?.status ?? 'loading', error: current?.error ?? '', retry: () => setAttempt((value) => value + 1) }}>{children}</PortalContext.Provider>
}
