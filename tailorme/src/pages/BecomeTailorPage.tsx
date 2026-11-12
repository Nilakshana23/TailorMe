import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext'
import { usePortal } from '../auth/portalContext'
import PortalLayout from '../components/portal/PortalLayout'
import { DashboardHeading, DashboardPanel } from '../components/portal/DashboardParts'
import ApplicationDetails, { ApplicationStatusBadge } from '../components/portal/ApplicationDetails'
import ApplicationWorkspace from '../components/portal/ApplicationWorkspace'
import ApplicationQualifications from '../components/portal/ApplicationQualifications'
import ApplicationEvidence from '../components/portal/ApplicationEvidence'
import FormButton from '../components/ui/FormButton'
import { applicationService } from '../services/applicationService'
import type { TailorApplication } from '../services/applicationService'
import { authError } from '../services/authService'
import { canEditApplication } from '../utils/applicationValidation'
import './Applications.css'

export default function BecomeTailorPage() {
  const { session } = useAuth()
  const { retry: refreshRole } = usePortal()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; application: TailorApplication | null; error: string } | null>(null)
  const [pending, setPending] = useState(false)
  const userId = session?.user.id ?? ''
  const key = `${userId}:${attempt}`
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    applicationService.own(userId).then((application) => { if (active) setResult({ key,application,error: '' }) })
      .catch((cause: unknown) => { if (active) setResult({ key,application: null,error: authError(cause) }) })
    return () => { active = false }
  },[key,userId])
  const current = result?.key === key ? result : null
  const application = current?.application ?? null
  return <PortalLayout>
    <DashboardHeading eyebrow="Grow with TailorMe" title="Become a Tailor" description="Bring your craft to a community that values the details." />
    <DashboardPanel title="Your Application">
      {!current ? <p role="status">Loading your application...</p> : current.error ? <div><p role="alert">Unable to load your application. {current.error}</p><FormButton className="mt-4" onClick={() => setAttempt((value) => value+1)}>Retry</FormButton></div> : <>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8"><ApplicationStatusBadge status={application?.status ?? 'draft'} /></div>
        {application?.rejection_reason && <div className="mb-8 rounded-xl bg-error-container p-5 text-on-error-container"><h3 className="font-semibold">Rejection reason</h3><p className="mt-2 whitespace-pre-wrap break-words">{application.rejection_reason}</p><p className="mt-3 text-sm">Edit and resubmit below. Saving a draft clears the previous decision.</p></div>}
        {canEditApplication(application?.status) ? <ApplicationWorkspace key={key} application={application} applicantId={userId} onApplication={(saved) => setResult({ key,application: saved,error: '' })} onBusy={(value) => { busy.current = value; setPending(value) }} /> : <>
          <p className="mb-6 text-on-surface-variant">{application?.status === 'approved' ? 'Your application was approved. Refresh your portal access to enter your tailor dashboard.' : 'Your application is pending review. Details and attachments cannot be edited until a decision is made.'}</p>
          {application && <ApplicationDetails application={application} />}
          <ApplicationQualifications application={application} applicantId={userId} />
          <ApplicationEvidence application={application} applicantId={userId} />
        </>}
        <div className="mt-8"><FormButton variant="secondary" className="px-5" disabled={pending} onClick={() => { if (!busy.current) refreshRole() }}>Refresh Role & Portal Access</FormButton><p className="mt-3 text-sm text-on-surface-variant">After approval, this loads your database role and takes you to your tailor dashboard. You keep the same account.</p></div>
      </>}
    </DashboardPanel>
  </PortalLayout>
}
