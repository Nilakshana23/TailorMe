import { useEffect, useState } from 'react'
import { useAuth } from '../auth/authContext'
import PortalLayout from '../components/portal/PortalLayout'
import { DashboardHeading, DashboardPanel, EmptyState } from '../components/portal/DashboardParts'
import { ApplicationStatusBadge } from '../components/portal/ApplicationDetails'
import ApplicationReview from '../components/portal/ApplicationReview'
import FormButton from '../components/ui/FormButton'
import { applicationService } from '../services/applicationService'
import type { ApplicationFilter, TailorApplication } from '../services/applicationService'
import { authError } from '../services/authService'
import './Applications.css'

export default function AdminApplicationsPage() {
  const { session } = useAuth()
  const [filter, setFilter] = useState<ApplicationFilter>('pending')
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ key: string; applications: TailorApplication[]; count: number; error: string } | null>(null)
  const key = `${session?.user.id}:${filter}:${page}:${attempt}`
  useEffect(() => {
    let active = true
    applicationService.list(filter, page).then((data) => { if (active) setResult({ key, ...data, error: '' }) })
      .catch((cause: unknown) => { if (active) setResult({ key, applications: [], count: 0, error: authError(cause) }) })
    return () => { active = false }
  }, [key, filter, page])
  const current = result?.key === key ? result : null
  const application = current?.applications.find((item) => item.applicant_id === selected)
  function reload() { setSelected(null); setAttempt((value) => value + 1) }
  return <PortalLayout>
    <DashboardHeading eyebrow="Control center / Applications" title="Tailor Applications" description="Review the people and businesses behind the craft." />
    <div className="flex flex-wrap items-end justify-between gap-6 mb-8"><div><label htmlFor="application-filter" className="block text-label-md mb-2">Application Status</label><select id="application-filter" className="application-select" value={filter} onChange={(event) => { setFilter(event.target.value as ApplicationFilter); setPage(0); setSelected(null); setMessage('') }}>{(['pending', 'approved', 'rejected', 'draft', 'all'] as const).map((status) => <option value={status} key={status}>{status === 'all' ? 'All statuses' : status[0].toUpperCase() + status.slice(1)}</option>)}</select></div><FormButton variant="secondary" className="px-5" onClick={reload}>Reload Applications</FormButton></div>
    <p role="status" aria-live="polite" className="mb-6">{message}</p>
    {!current ? <p role="status">Loading applications…</p> : current.error ? <DashboardPanel title="Applications unavailable"><p role="alert">{current.error}</p><FormButton className="mt-6" onClick={reload}>Retry</FormButton></DashboardPanel> : <>
      <p className="text-sm text-on-surface-variant mb-4">{current.count} application{current.count === 1 ? '' : 's'} matching this filter.</p>
      {current.applications.length === 0 ? <DashboardPanel title="Applications"><EmptyState icon="content_cut" title="No applications on this page" description="There are no applications to show for this filter and page. Try another status or reload to check for new submissions." /></DashboardPanel> : <div className="application-admin-grid">
        <DashboardPanel title="Applications"><ul className="space-y-3">{current.applications.map((item) => <li key={item.applicant_id}><button type="button" className="application-list-button" aria-pressed={selected === item.applicant_id} onClick={() => setSelected(item.applicant_id)}><span className="block font-semibold break-words">{item.shop_name || 'Untitled draft'}</span><span className="block text-sm text-on-surface-variant mt-1 break-words">{item.city || 'City not provided'}</span><span className="block text-xs text-on-surface-variant mt-2 break-all">{item.applicant_id}</span><span className="block mt-3"><ApplicationStatusBadge status={item.status} /></span></button></li>)}</ul></DashboardPanel>
        <DashboardPanel title="Application Details">{application ? <ApplicationReview key={`${application.applicant_id}:${application.version}`} application={application} onReviewed={(decision) => { setMessage(decision === 'approved' ? 'Application approved. The applicant now has tailor access.' : 'Application rejected. The applicant can edit and resubmit.'); reload() }} /> : <EmptyState icon="assignment" title="Choose an application" description="Select a business to read its application and available review actions." />}</DashboardPanel>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-4 mt-8"><FormButton variant="secondary" className="px-5" disabled={page === 0} onClick={() => { setPage((value) => value - 1); setSelected(null) }}>Previous</FormButton><p>Page {page + 1}</p><FormButton variant="secondary" className="px-5" disabled={(page + 1) * 20 >= current.count} onClick={() => { setPage((value) => value + 1); setSelected(null) }}>Next</FormButton></div>
    </>}
  </PortalLayout>
}
