import {revealRequestSection,requestSectionHashes} from '../utils/requestSectionNavigation'
import RequestPayments from '../components/portal/RequestPayments'
import RequestReferences from '../components/portal/RequestReferences'
import RequestMessages from '../components/portal/RequestMessages'
import {messageService} from '../services/messageService'
import { useEffect, useRef, useState } from 'react'
import type {ReactNode} from 'react'
import CustomerRequestCard from '../components/portal/CustomerRequestCard'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { usePortal } from '../auth/portalContext'
import PortalLayout from '../components/portal/PortalLayout'
import { DashboardHeading, DashboardPanel } from '../components/portal/DashboardParts'
import RequestMeasurements from '../components/portal/RequestMeasurements'
import RequestDesignProposals from '../components/portal/RequestDesignProposals'
import RequestQuotations from '../components/portal/RequestQuotations'
import RequestProgress from '../components/portal/RequestProgress'

import RequestWork from '../components/portal/RequestWork'
import RequestStatusBadge from '../components/portal/RequestStatusBadge'
import FormButton from '../components/ui/FormButton'
import { requestService } from '../services/requestService'
import type { RequestFilter, TailoringRequest } from '../services/requestService'
import { authError } from '../services/authService'
import './Applications.css'
import './CustomerRequests.css'

function RequestPagePanel({customerList,title,children}:{customerList:boolean;title:string;children:ReactNode}){
 return customerList?<section className="customer-requests-panel" aria-label="Tailoring requests">{children}</section>:<DashboardPanel title={title}>{children}</DashboardPanel>
}

function Timestamp({ value }: { value: string }) { return <time dateTime={value}>{new Date(value).toLocaleString('en-GB',{ timeZone: 'Asia/Colombo' })} (Sri Lanka)</time> }
export default function RequestsPage({orders=false}:{orders?:boolean}) {
  const { id } = useParams()
  const { role } = usePortal()
  const { session } = useAuth()
  const location = useLocation()
  const [params,setParams]=useSearchParams()
  const rawFilter=params.get('filter')
  const filter:RequestFilter=['pending','accepted','rejected','cancelled','active','due','overdue'].includes(rawFilter??'')?rawFilter as RequestFilter:'all'
  function setFilter(value:RequestFilter){const next=new URLSearchParams(params);if(value==='all')next.delete('filter');else next.set('filter',value);setParams(next)}
  const [page,setPage] = useState(0)
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; rows: TailoringRequest[]; error: string } | null>(null)
  const [unread,setUnread]=useState<{key:string;counts:Record<string,number>;error:boolean}|null>(null)
  const [pending,setPending] = useState(false)
  const [designPending,setDesignPending]=useState(false)
  const [reason,setReason] = useState('')
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const busy = useRef(false)
  const reasonInput = useRef<HTMLTextAreaElement>(null)
  const providerView=role==='tailor'&&!orders
  const base = role === 'tailor' ? orders?'/tailor/orders':'/tailor/requests' : '/customer/requests'
  const customerList=!id
  const scope = `${session?.user.id}:${base}:${id ?? 'list'}:${page}:${filter}:`
  const key = `${scope}${attempt}`
  useEffect(() => {
    let active = true
    const request = id ? /^[0-9a-f-]{36}$/i.test(id) ? requestService.get(id).then((row) => row ? [row] : []) : Promise.resolve([]) : session?requestService.list(page,filter,{userId:session.user.id,side:providerView?'provider':'requester'}):Promise.resolve([])
    request.then((rows) => { if (active) setResult({ key,rows,error: '' }) }).catch((cause: unknown) => { if (active) setResult(previous=>({key,rows:previous?.key.startsWith(scope)?previous.rows:[],error:authError(cause)})) })
    return () => { active = false }
  },[key,id,page,filter,scope,session,providerView])
  const current = result?.key.startsWith(scope) ? result : null
  const refreshing=!!current&&current.key!==key
  const request = current?.rows[0]
  const [sectionNotice,setSectionNotice]=useState<{key:string;message:string}|null>(null)
  const sectionKey=`${id}:${location.key}:${location.hash}`
  useEffect(()=>{
    if(!id||!request?.id||!requestSectionHashes.includes(location.hash))return
    return revealRequestSection(request.id,location.hash,()=>setSectionNotice({key:sectionKey,message:'This section could not finish loading. Use the section refresh control, or refresh this request and try again.'}))
  },[id,request?.id,location.hash,location.key,sectionKey])
  useEffect(()=>{
    if(id||!current||current.error)return
    let active=true
    const update=()=>{void messageService.summaries(current.rows.map(row=>row.id)).then(rows=>{if(active)setUnread({key,counts:Object.fromEntries(rows.map(row=>[row.request_id,row.unread])),error:false})}).catch(()=>{if(active)setUnread({key,counts:{},error:true})})}
    update();const timer=setInterval(update,30000);window.addEventListener('focus',update)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update)}
  },[id,current,key])
  async function decide(status: 'accepted' | 'rejected' | 'cancelled') {
    if (busy.current || !request) return
    if (status === 'rejected' && (!reason.trim() || [...reason.trim()].length > 2000)) { setError('Enter a rejection reason (1–2,000 characters).'); reasonInput.current?.focus(); return }
    busy.current = true; setPending(true); setError(''); setMessage('')
    try {
      const updated = await requestService.decide(request,status,status === 'rejected' ? reason : '')
      setResult({ key,rows: [updated],error: '' }); setMessage(`Request ${updated.status}.`)
    } catch (cause) { setError(`${authError(cause)} Retry the same action, or refresh to see the current status.`) }
    finally { busy.current = false; setPending(false) }
  }
  // Preserve old /tailor/requests/:id links and route by actual participation.
  if(role==='tailor'&&request){const requester=request.customer_id===session?.user.id;if(requester!==orders)return <Navigate replace to={`${requester?'/tailor/orders':'/tailor/requests'}/${request.id}${location.search}${location.hash}`} state={location.state}/>}
  return <PortalLayout className={customerList?'customer-requests-page':''}><DashboardHeading eyebrow="Tailoring inquiries" title={id ? orders?'Order details':'Request details' : role === 'tailor' ? orders?'My Orders':'Received Requests' : 'My Requests'} description={customerList?providerView?'Requests addressed to your shop.':'Requests you sent, quotations and tailoring progress.':'Acceptance is an inquiry response, not a price, payment or guaranteed completion date.'} />
    {id && <Link to={base} className="underline inline-block mb-6">{orders?'Back to My Orders':providerView?'Back to Received Requests':'Back to requests'}</Link>}
    <RequestPagePanel customerList={customerList} title={id ? 'Tailoring request' : 'Your requests'}>
      <div className={customerList?'customer-requests-toolbar':undefined}>
      <FormButton variant="secondary" className="px-5 mb-6" disabled={pending||refreshing} onClick={() => { setError(''); setAttempt((value) => value+1) }}>Refresh requests</FormButton>
      {!id && <div className="request-filters"><label htmlFor="request-status-filter">Filter by status</label><select id="request-status-filter" className="application-select" value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setPage(0) }}>
        <option value="all">All</option>{providerView&&<><option value="active">Active accepted work</option><option value="due">Due today (Sri Lanka)</option><option value="overdue">Overdue</option></>}<option value="pending">Pending</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
      </select></div>}
      </div>
      {customerList&&unread?.key===key&&unread.error&&<p role="status" className="mb-4">Unread counts are unavailable. You can still open any conversation.</p>}
      {refreshing&&<p role="status">Refreshing requests?</p>}{current?.error&&current.rows.length>0&&<p role="alert">Refresh failed. Showing previously loaded requests. {current.error}</p>}
      {!current ? <p role="status" className={customerList?"customer-requests-state":undefined}>Loading requests...</p> : current.error && !current.rows.length ? <p role="alert" className={customerList?"customer-requests-state":undefined}>Unable to load requests. {current.error} Use Refresh requests to retry.</p> : !current.rows.length ? <p role={id?'alert':undefined} className={customerList?"customer-requests-state":undefined}>{id ? 'Request not found or unavailable to your account.' : customerList ? page>0?'No more requests on this page. Use Previous page to go back.':filter==='all'?providerView?'No received requests yet.':'No orders yet. Find a tailor to send your first request.':`No ${filter} requests. Choose All to see your other requests.` : filter==='all'?'No tailoring requests yet.':`No ${filter} requests.`}</p> : id && request ? <div data-request-detail={request.id}>
        {location.state?.sent && <p role="status" className="mb-6">Your tailoring request was sent.</p>}
        <p className="text-sm mb-4">{request.customer_id===session?.user.id?'You are the requester. Your service provider manages this work.':'You are the service provider for this request.'}</p><div className="request-detail-status"><RequestStatusBadge status={request.status} /></div>
        <dl className="application-details mt-6">{[['Shop',request.shop_name],['Requester',request.customer_name || 'Requester'],['Garment type',request.garment_type],['Description',request.description],['Quantity',String(request.quantity)],['Preferred completion date',request.preferred_date],['Rejection reason',request.rejection_reason ?? '']].filter(([,value]) => value).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div className="request-timestamps"><dt>Created</dt><dd><Timestamp value={request.created_at} /></dd></div><div className="request-timestamps"><dt>Last updated</dt><dd><Timestamp value={request.updated_at} /></dd></div>{request.responded_at && <div className="request-timestamps"><dt>Tailor responded</dt><dd><Timestamp value={request.responded_at} /></dd></div>}{request.cancelled_at && <div className="request-timestamps"><dt>Cancelled</dt><dd><Timestamp value={request.cancelled_at} /></dd></div>}</dl>
        <RequestMessages key={`chat:${session?.user.id}:${request.id}`} request={request} />
        <RequestDesignProposals key={`proposals:${session?.user.id}:${request.id}`} request={request} onPendingChange={setDesignPending}/>
        <RequestReferences key={`references:${session?.user.id}:${request.id}`} requestId={request.id} />
        <RequestMeasurements key={`measurements:${request.id}`} requestId={request.id} />
        <RequestPayments key={`payments:${session?.user.id}:${request.id}`} request={request}/><RequestQuotations key={`quotes:${request.id}`} request={request} />
        <RequestProgress key={`progress:${request.id}`} request={request} designPending={designPending} canManage={role === 'tailor' && request.tailor_id === session?.user.id} onUpdated={updated=>setResult({key,rows:[updated],error:''})} />
        <RequestWork key={request.id} request={request} canManage={role === 'tailor' && request.tailor_id === session?.user.id} onUpdated={(updated) => setResult({key,rows:[updated],error:''})} />
        <p className="mt-6 text-sm">The preferred date is subject to tailor confirmation. This request does not create an order.</p>
        {request.status === 'pending' && request.customer_id === session?.user.id && <FormButton variant="secondary" className="mt-6 w-full" disabled={pending} onClick={() => { void decide('cancelled') }}>Cancel pending request</FormButton>}
        {request.status === 'pending' && request.tailor_id === session?.user.id && role === 'tailor' && <div className="mt-6 space-y-5"><FormButton disabled={pending} onClick={() => { void decide('accepted') }}>Accept inquiry</FormButton><form onSubmit={(event) => { event.preventDefault(); void decide('rejected') }}><label htmlFor="request-rejection" className="block mb-2">Rejection reason (required to reject)</label><textarea ref={reasonInput} id="request-rejection" className="application-textarea" maxLength={2000} disabled={pending} value={reason} onChange={(event) => setReason(event.target.value)} /><FormButton type="submit" variant="secondary" className="w-full mt-3" disabled={pending}>Reject request</FormButton></form></div>}
      </div> : <><ul className="customer-requests-list">{current.rows.map(row=><li key={row.id}><CustomerRequestCard request={row} tailor={providerView} base={base} unread={unread?.key===key&&!unread.error?unread.counts[row.id]??0:0}/></li>)}</ul><div className={customerList?"customer-requests-pagination":"flex gap-4 mt-6"} aria-label="Request pagination"><FormButton variant="secondary" className="px-5" disabled={page === 0} onClick={() => setPage((value) => value-1)}>Previous</FormButton><FormButton variant="secondary" className="px-5" disabled={current.rows.length < 20} onClick={() => setPage((value) => value+1)}>Next</FormButton></div></>}
      {!id && current && !current.error && current.rows.length === 0 && page > 0 && <FormButton variant="secondary" className="mt-5 px-5" onClick={() => setPage((value) => value-1)}>Previous page</FormButton>}
      {sectionNotice?.key===sectionKey&&<p role="status">{sectionNotice.message}</p>}
      <p role="status" aria-live="polite" className="mt-4">{pending ? 'Updating request...' : message}</p><p role="alert" className="text-error mt-4">{error}</p>
    </RequestPagePanel></PortalLayout>
}
