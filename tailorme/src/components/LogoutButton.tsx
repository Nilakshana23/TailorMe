import { useRef, useState } from 'react'
import FormButton from './ui/FormButton'
import { authError, authService } from '../services/authService'

export default function LogoutButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  return <div><FormButton variant="secondary" className="w-full px-5" disabled={pending} onClick={async () => {
    if (busy.current) return
    busy.current = true; setPending(true); setError('')
    try { const { error } = await authService.signOut(); if (error) throw error }
    catch (cause) { setError(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }}>{pending ? 'Signing out…' : 'Log Out'}</FormButton><p role="alert" className="mt-2 text-sm text-error">{error}</p></div>
}
