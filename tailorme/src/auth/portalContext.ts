import { createContext, useContext } from 'react'

export type PortalRole = 'customer' | 'tailor' | 'admin'
export type Profile = { id: string; avatar_path?: string | null; full_name: string; created_at: string; updated_at: string }
export type PortalStatus = 'loading' | 'ready' | 'missing-profile' | 'missing-role' | 'error'
export const dashboardPath = (role: PortalRole) => `/${role}/dashboard`
export const PortalContext = createContext<{
  profile: Profile | null
  role: PortalRole | null
  status: PortalStatus
  error: string
  retry: () => void
} | null>(null)

export function usePortal() {
  const context = useContext(PortalContext)
  if (!context) throw new Error('PortalProvider is required.')
  return context
}
