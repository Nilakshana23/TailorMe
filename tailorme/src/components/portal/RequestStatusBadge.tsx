import type { TailoringRequest } from '../../services/requestService'
import './RequestStatusBadge.css'

const appearances = {
  pending: { text: 'Pending', icon: 'schedule' },
  accepted: { text: 'Accepted', icon: 'check' },
  rejected: { text: 'Rejected', icon: 'close' },
  cancelled: { text: 'Cancelled', icon: null },
} as const

export default function RequestStatusBadge({ status, completed = false }: { completed?: boolean; status: TailoringRequest['status'] }) {
  const appearance = completed ? { text: 'Completed',icon: 'check' } : appearances[status]
  return <span className={`request-status-badge request-status-${status}`}>
    {appearance.icon && <span className="material-symbols-outlined" aria-hidden="true">{appearance.icon}</span>}
    {appearance.text}
  </span>
}
