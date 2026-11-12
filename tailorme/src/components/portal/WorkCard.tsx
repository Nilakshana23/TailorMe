import { Link } from 'react-router-dom'
import type { TailoringRequest } from '../../services/requestService'
import { colomboDate, deadlineVisibility, formatWorkDate } from '../../utils/deadlineVisibility'
import { stageLabel } from '../../services/progressService'
import RequestStatusBadge from './RequestStatusBadge'
import './WorkCard.css'

export default function WorkCard({ request, today = colomboDate() }: { request: TailoringRequest; today?: string }) {
  const deadline = deadlineVisibility(request, today)
  return <Link to={`/tailor/requests/${request.id}`} className={`work-card work-card-${deadline?.tone ?? 'neutral'}`}>
    <div className="work-card-heading"><h3 className="font-semibold break-words">{request.garment_type} · {request.customer_name || 'Customer'}</h3><RequestStatusBadge status={request.status} /></div>
    <p className="mt-3 font-semibold">Work stage: {stageLabel(request.completed_at ? 'completed' : request.work_stage)}</p>
    {deadline && <span className={`work-deadline work-deadline-${deadline.tone}`}><span className="material-symbols-outlined" aria-hidden="true">{deadline.icon}</span>{deadline.text}</span>}
    <p className="work-confirmed">Confirmed completion: {request.confirmed_date ? <time dateTime={request.confirmed_date}>{formatWorkDate(request.confirmed_date)}</time> : 'Not confirmed'}</p>
    <p className="work-preferred">Customer preferred: <time dateTime={request.preferred_date}>{formatWorkDate(request.preferred_date)}</time></p>
    <span className="work-detail-link">View request <span aria-hidden="true">→</span></span>
  </Link>
}
