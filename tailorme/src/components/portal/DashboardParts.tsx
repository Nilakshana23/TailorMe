import type { ReactNode } from 'react'
import { PortalIcon } from './PortalLayout'

export function DashboardHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="portal-heading"><p className="text-label-sm uppercase tracking-widest text-secondary mb-3">{eyebrow}</p><h1 className="font-display-lg text-display-lg-mobile md:text-display-lg break-words">{title}</h1><p className="mt-3 text-on-surface-variant text-body-lg">{description}</p></div>
}

export function MetricCard({ label, icon, money = false }: { label: string; icon: string; money?: boolean }) {
  return <div className="portal-card portal-metric"><span className="portal-metric-icon"><PortalIcon name={icon} /></span><p className="mt-6 text-label-sm uppercase tracking-widest text-on-surface-variant">{label}</p><p className="mt-2 font-display-lg text-headline-md">{money ? '$0.00' : '0'}</p><p className="mt-2 text-sm text-on-surface-variant">Not connected yet</p></div>
}

export function DashboardPanel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`portal-card ${className}`}><h2 className="font-display-lg text-headline-sm mb-6">{title}</h2>{children}</section>
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description: string }) {
  return <div className="portal-empty"><span className="portal-empty-icon"><PortalIcon name={icon} /></span><h3 className="mt-4 font-semibold text-body-lg">{title}</h3><p className="mt-2 max-w-md mx-auto text-on-surface-variant leading-relaxed">{description}</p></div>
}
