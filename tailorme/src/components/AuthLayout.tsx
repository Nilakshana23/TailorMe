import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type AuthLayoutProps = { title: string; subtitle: string; children: ReactNode }

export default function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const [message, setMessage] = useState('')
  function unavailable(feature: string) {
    setMessage(`${feature} is temporarily unavailable. Please check back later.`)
  }
  return (
    <main className="min-h-screen flex flex-col md:flex-row text-body-md antialiased">
      <section aria-label="About TailorMe" className="hidden md:flex w-1/2 relative bg-surface-container-low overflow-hidden items-center justify-center p-8 lg:p-margin-desktop">
        <div className="z-10 text-center max-w-lg">
          <h1 className="font-display-lg text-display-lg text-primary mb-6"><Link to="/">TailorMe</Link></h1>
          <p className="font-headline-sm text-headline-sm italic text-on-surface-variant mb-8">Luxury awaits the discerning artisan.</p>
          <div className="w-24 h-px bg-outline mx-auto mb-8" />
          <p className="text-body-lg text-on-surface-variant leading-relaxed">Step into a world where digital precision meets the soul of craftsmanship. Every stitch, every fold, every detail is crafted specifically for you.</p>
        </div>
        <div aria-hidden="true" className="absolute inset-0 opacity-20 pointer-events-none bg-cover bg-center" style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCXxENimAicIPQGnuNOAOrsHyNnB6NO2w1JcVQALlsMMRlw7zhfdZn5TWWv6QINcD2dzb85YwRHfr1d7BUuVFkhOZhLMgYpLKexql6iT_yWSw2Fr9pcpdrWmI5T1UZdeiUKbLw0gWnunM_FNb5-ASNcrGI11RmGtnW3txABm3FjkIjjlPCQ3UsJwyWbD6kk13vKruYcAjOcaqbTQKSynm-dkiuVBjZ13YxZbZ0gP8psiOZ7Fvd8QwXZ9LlAn_ARrAJaOYcMOKQdTLE")' }} />
      </section>
      <section aria-label={title} className="flex-1 min-w-0 flex flex-col justify-center items-center px-margin-mobile py-12 md:p-8 lg:p-margin-desktop bg-surface">
        <div className="w-full max-w-md">
          <div className="md:hidden text-center mb-12">
            <Link to="/" className="font-display-lg-mobile text-display-lg-mobile text-primary tracking-tighter">TailorMe</Link>
            <p className="text-label-md text-on-surface-variant uppercase tracking-widest mt-2">Luxury Awaits</p>
          </div>
          <div className="bg-surface-container-lowest luxury-shadow rounded-2xl p-6 sm:p-8 lg:p-12 border border-outline-variant/20">
            <header className="mb-10">
              <h2 className="font-headline-md text-headline-md text-primary mb-2">{title}</h2>
              <p className="text-label-md text-on-surface-variant">{subtitle}</p>
            </header>
            {children}

          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-6">
            <button type="button" className="text-label-sm text-on-surface-variant/60 hover:text-primary" onClick={() => unavailable('Privacy Policy')}>Privacy Policy</button>
            <button type="button" className="text-label-sm text-on-surface-variant/60 hover:text-primary" onClick={() => unavailable('Terms of Service')}>Terms of Service</button>
          </div>
          <p role="status" aria-live="polite" className="mt-4 text-center text-sm text-on-surface-variant">{message}</p>
        </div>
      </section>
    </main>
  )
}
