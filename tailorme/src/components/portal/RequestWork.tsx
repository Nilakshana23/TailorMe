import { useEffect, useRef, useState } from 'react'
import type { TailoringRequest } from '../../services/requestService'
import { workService } from '../../services/workService'
import type { DeadlineChange } from '../../services/workService'
import { authError } from '../../services/authService'
import FormButton from '../ui/FormButton'

export default function RequestWork({ request,canManage,onUpdated }: { request: TailoringRequest; canManage: boolean; onUpdated: (request: TailoringRequest) => void }) {
 const [date,setDate]=useState(request.confirmed_date ?? '')
 const [history,setHistory]=useState<DeadlineChange[] | null>(null)
 const [attempt,setAttempt]=useState(0)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [pending,setPending]=useState(false)
 const busy=useRef(false)
 useEffect(()=>{ let active=true; workService.history(request.id).then(rows=>{if(active)setHistory(rows)}).catch(cause=>{if(active)setError(authError(cause))});return()=>{active=false} },[request.id,request.version,attempt])
 async function action() {
  if(busy.current)return; busy.current=true;setPending(true);setError('');setMessage('')
  try { const updated=await workService.confirm(request,date); onUpdated(updated);setMessage('Confirmed completion date saved.') }
  catch(cause){setError(`${authError(cause)} Retry the same action or refresh the request.`)}finally{busy.current=false;setPending(false)}
 }
 return <section className="mt-8 border-t border-outline-variant pt-6"><h3 className="font-display-lg text-headline-sm">Completion and confirmed date</h3>
 <p className="mt-4">Customer preferred date: {request.preferred_date}. This is a preference, not an agreed deadline.</p>
 <p className="mt-3 font-semibold">Tailor-confirmed completion date: {request.confirmed_date ?? 'Not confirmed'}</p>
 <p className="mt-3">Work status: {request.completed_at ? 'Completed' : request.status==='accepted' ? 'Accepted — incomplete' : 'Not started'}</p>
 {request.completed_at && <p className="text-sm mt-2">Completed <time dateTime={request.completed_at}>{new Date(request.completed_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka)</time></p>}
 {canManage && request.status==='accepted' && !request.completed_at && <div className="mt-5 space-y-4"><label htmlFor="confirmed-work-date" className="block">Confirmed completion date (today or later, Sri Lanka time)</label><input id="confirmed-work-date" className="application-select" type="date" value={date} disabled={pending} onChange={event=>setDate(event.target.value)} /><FormButton disabled={pending || !date} onClick={()=>{void action()}}>Save confirmed date</FormButton></div>}
 <h4 className="font-semibold mt-6">Date-change history</h4>{!history ? <p role="status">Loading date history...</p> : !history.length ? <p className="mt-3">No confirmed dates yet.</p> : <ol className="mt-3 space-y-3">{history.map(row=><li key={row.id}>{row.previous_date ?? 'Not confirmed'} → {row.confirmed_date}<p className="text-sm text-on-surface-variant">{new Date(row.changed_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka), by the addressed tailor</p></li>)}</ol>}
 <FormButton variant="secondary" className="mt-4 px-5" disabled={pending} onClick={()=>setAttempt(value=>value+1)}>Refresh date history</FormButton><p role="status" className="mt-3">{pending?'Saving work update...':message}</p><p role="alert" className="text-error mt-3">{error}</p>
 </section>
}
