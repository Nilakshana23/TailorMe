import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import { workService } from '../../services/workService'
import CustomerRequestCard from './CustomerRequestCard'
import { colomboDate } from '../../utils/deadlineVisibility'
import FormButton from '../ui/FormButton'
import '../../pages/CustomerRequests.css'
const summaries=[['Pending requests','pending'],['Active accepted work','active'],['Due today','due'],['Overdue','overdue']] as const
export default function AcceptedWork() {
 const {session}=useAuth(), userId=session?.user.id
 const [attempt,setAttempt]=useState(0),[today,setToday]=useState(()=>colomboDate())
 const [result,setResult]=useState<{userId:string;data:Awaited<ReturnType<typeof workService.overview>>|null;error:string}|null>(null)
 const [loading,setLoading]=useState(true)
 useEffect(()=>{const refresh=()=>setToday(colomboDate());const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}},[])
 useEffect(()=>{if(!userId)return;let active=true;workService.overview(userId).then(data=>{if(active)setResult({userId,data,error:''})}).catch(()=>{if(active)setResult(previous=>({userId,data:previous?.userId===userId?previous.data:null,error:'Unable to refresh work. Please retry.'}))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[userId,attempt,today])
 const current=result?.userId===userId?result:null
 return <section className="tailor-overview" aria-label="Request overview"><div className="overview-toolbar"><p>Confirmed deadlines in Sri Lanka time.</p><FormButton variant="secondary" className="px-4" disabled={loading} onClick={()=>{setLoading(true);setAttempt(value=>value+1)}}>Refresh overview</FormButton></div>{loading&&<p role="status">{current?.data?'Refreshing overview?':'Loading overview?'}</p>}{current?.error&&<p role="alert">{current.error}{current.data?' Showing previously loaded data.':''}</p>}{current?.data&&<><div className="request-summary-grid">{summaries.map(([label,filter],index)=><Link key={filter} className="request-summary" to={'/tailor/requests?filter='+filter}><span>{label}</span><strong>{current.data!.counts[index]}</strong></Link>)}</div><h2 className="font-display-lg text-headline-sm mb-4">Priority work</h2><p className="text-sm mb-4">Overdue work first, then nearest confirmed deadlines. Preferred dates are shown separately.</p>{current.data.priority.length?<ul className="customer-requests-list">{current.data.priority.map(request=><li key={request.id}><CustomerRequestCard request={request} tailor/></li>)}</ul>:<p className="customer-requests-state">No active work with confirmed deadlines.</p>}</>}</section>
}
