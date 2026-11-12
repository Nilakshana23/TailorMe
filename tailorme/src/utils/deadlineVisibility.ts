import type { TailoringRequest } from '../services/requestService'

export function colomboDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = (type: string) => parts.find(part => part.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function formatWorkDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T00:00:00+05:30`))
}

// Date-only values are compared as calendar ordinals, never elapsed local hours.
export function deadlineVisibility(request: Pick<TailoringRequest, 'status' | 'completed_at' | 'confirmed_date'>, today = colomboDate()) {
  if (request.completed_at || request.status !== 'accepted') return null
  if (!request.confirmed_date) return { tone: 'unconfirmed', text: 'Date not confirmed', icon: 'event_busy' }
  const days = Math.round((Date.parse(`${request.confirmed_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  if (days < 0) return { tone: 'overdue', text: `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`, icon: 'warning' }
  if (days === 0) return { tone: 'today', text: 'Due today', icon: 'today' }
  if (days === 1) return { tone: 'soon', text: 'Due tomorrow', icon: 'schedule' }
  if (days === 2) return { tone: 'soon', text: 'Due in 2 days', icon: 'schedule' }
  return { tone: 'future', text: `Due in ${days} days`, icon: 'event' }
}
