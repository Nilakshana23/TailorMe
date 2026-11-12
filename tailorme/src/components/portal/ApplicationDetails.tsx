import type { TailorApplication } from '../../services/applicationService'

export function ApplicationStatusBadge({ status }: { status: TailorApplication['status'] }) {
  return <span className="portal-gold-tag capitalize">{status}</span>
}

export default function ApplicationDetails({ application, showApplicant = false }: { application: TailorApplication; showApplicant?: boolean }) {
  const details = [
    ...(showApplicant ? [['Applicant ID', application.applicant_id]] : []),
    ['Shop Name', application.shop_name], ['Phone', application.phone], ['City', application.city],
    ['Address', application.address], ['Description', application.description], ['Specialties', application.specialties],
    ['Years of Experience', application.years_experience?.toString() ?? ''],
    ['Last Updated', new Date(application.updated_at).toLocaleString()],
    ...(application.reviewed_at ? [['Reviewed', new Date(application.reviewed_at).toLocaleString()]] : []),
    ...(showApplicant && application.reviewer_id ? [['Reviewer ID', application.reviewer_id]] : []),
  ]
  return <div><dl className="application-details">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    {application.rejection_reason && <div className="mt-6 rounded-xl bg-error-container p-4 text-on-error-container"><h3 className="font-semibold">Rejection reason</h3><p className="mt-2 whitespace-pre-wrap break-words">{application.rejection_reason}</p></div>}
  </div>
}
