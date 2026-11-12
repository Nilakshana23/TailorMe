// Only browsing, request views and customer designer routes are eligible authentication return destinations.
// Parse untrusted values again at every entry point, including auth callbacks.
export function safeReturnDestination(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(value, 'https://tailorme.invalid')
    if (url.origin !== 'https://tailorme.invalid' || !/^\/(?:tailors|customer\/designer|customer\/requests|tailor\/(?:requests|orders))(?:\/[a-zA-Z0-9_-]+)?$/.test(url.pathname)) return null
    return url.pathname + url.search + url.hash
  } catch { return null }
}

export function returnDestination(search: string): string | null {
  return safeReturnDestination(new URLSearchParams(search).get('returnTo'))
}

export function authPath(path: '/login' | '/signup' | '/auth/callback', destination: unknown): string {
  const safe = safeReturnDestination(destination)
  return safe ? `${path}?${new URLSearchParams({ returnTo: safe })}` : path
}

export function afterLogin(destination: unknown): string {
  return safeReturnDestination(destination) ?? '/dashboard'
}
