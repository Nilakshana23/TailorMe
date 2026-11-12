import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { applicationService } from '../../services/applicationService'
import type { TailorApplication } from '../../services/applicationService'
import { authError } from '../../services/authService'
import ApplicationDetails, { ApplicationStatusBadge } from './ApplicationDetails'
import FormButton from '../ui/FormButton'
import ApplicationQualifications from './ApplicationQualifications'
import ApplicationEvidence from './ApplicationEvidence'

export default function ApplicationReview({ application, onReviewed }: {
  application: TailorApplication; onReviewed: (decision: 'approved' | 'rejected') => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [qualificationCount,setQualificationCount] = useState<number | null>(null)
  const [evidenceCount,setEvidenceCount] = useState<number | null>(null)
  const busy = useRef(false)
  const reasonInput = useRef<HTMLTextAreaElement>(null)
  async function decide(decision: 'approved' | 'rejected') {
    if (busy.current || application.status !== 'pending') return
    if ((evidenceCount === null || qualificationCount === null)) { setError('Wait for work photos and qualifications to load, or retry their sections.'); return }
    if (decision === 'rejected' && (!reason.trim() || [...reason.trim()].length > 2000)) {
      setError('Enter a rejection reason of 1–2,000 characters.'); reasonInput.current?.focus(); return
    }
    busy.current = true; setPending(true); setError('')
    try {
      await applicationService.review(application, decision, reason)
      onReviewed(decision)
    } catch (cause) { setError(authError(cause)) }
    finally { busy.current = false; setPending(false) }
  }
  function reject(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void decide('rejected') }
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8"><h3 className="font-display-lg text-headline-sm break-words">{application.shop_name || 'Untitled draft'}</h3><ApplicationStatusBadge status={application.status} /></div>
    <ApplicationDetails application={application} showApplicant />
    <ApplicationQualifications application={application} applicantId={application.applicant_id} review disabled={pending} onCount={setQualificationCount} />
    <ApplicationEvidence application={application} applicantId={application.applicant_id} review disabled={pending} onCount={setEvidenceCount} />
    {application.status === 'pending' && <div className="mt-8 border-t border-outline-variant pt-8">
      <p className="mb-6 text-on-surface-variant">Approval gives this customer tailor access immediately. Review the business details before making a decision.</p>
      <FormButton type="button" disabled={pending || (evidenceCount === null || qualificationCount === null)} onClick={() => { void decide('approved') }}>{pending ? 'Recording decision…' : 'Approve Application'}</FormButton>
      <form className="mt-8" noValidate onSubmit={reject} aria-busy={pending}><label className="block text-label-md mb-3" htmlFor="rejection-reason">Rejection Reason (required to reject)</label><textarea ref={reasonInput} id="rejection-reason" className="application-textarea" rows={4} maxLength={2000} required value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} aria-describedby="review-error" /><FormButton type="submit" variant="secondary" className="w-full mt-4" disabled={pending || (evidenceCount === null || qualificationCount === null)}>{pending ? 'Recording decision…' : 'Reject Application'}</FormButton></form>
    </div>}
    <p role="status" className="mt-4">{pending ? 'Recording your decision…' : ''}</p><p role="alert" id="review-error" className="mt-4 text-error">{error}</p>
  </div>
}
