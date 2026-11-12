import {Link} from 'react-router-dom'
import type {TailoringRequest} from '../../services/requestService'
import {stageLabel} from '../../services/progressService'
import {colomboDate,deadlineVisibility,formatWorkDate} from '../../utils/deadlineVisibility'
import RequestStatusBadge from './RequestStatusBadge'
import './WorkCard.css'

export default function CustomerRequestCard({request,unread=0,tailor=false,base}:{request:TailoringRequest;unread?:number;tailor?:boolean;base?:string}){
 const target=`${base??(tailor?'/tailor/requests':'/customer/requests')}/${request.id}`,deadline=deadlineVisibility(request,colomboDate())
 return <article className="customer-request-card">
  <header className="customer-request-card-header"><div><h2 className="font-display-lg">{request.garment_type}</h2><p className="customer-request-shop">{tailor?request.customer_name||'Requester':request.shop_name}</p></div><RequestStatusBadge status={request.status}/></header>
  <dl className="customer-request-metadata">
   {request.status==='accepted'&&<div className="customer-request-confirmed"><dt>Confirmed date</dt><dd>{request.confirmed_date?<time dateTime={request.confirmed_date}>{formatWorkDate(request.confirmed_date)}</time>:'Not confirmed'}</dd></div>}
   <div><dt>Quantity</dt><dd>{request.quantity}</dd></div>
   <div><dt>Requested on</dt><dd><time dateTime={request.created_at}>{new Date(request.created_at).toLocaleDateString('en-GB',{timeZone:'Asia/Colombo',day:'numeric',month:'short',year:'numeric'})}</time></dd></div>
   <div><dt>Preferred date</dt><dd><time dateTime={request.preferred_date}>{formatWorkDate(request.preferred_date)}</time><span className="request-date-note">Customer preference</span></dd></div>
   {request.status!=='accepted'&&request.confirmed_date&&<div><dt>Confirmed date</dt><dd><time dateTime={request.confirmed_date}>{formatWorkDate(request.confirmed_date)}</time></dd></div>}
  </dl>
  <div className="customer-request-progress">{request.status==='pending'?<p className="request-stage-badge">{tailor?'Awaiting your response':'Awaiting tailor response'}</p>:request.status==='accepted'?<p className="request-stage-badge">Work stage: <strong>{stageLabel(request.completed_at?'completed':request.work_stage)}</strong></p>:null}{deadline&&<span className={`work-deadline work-deadline-${deadline.tone}`}><span className="material-symbols-outlined" aria-hidden="true">{deadline.icon}</span>{deadline.text}</span>}</div>
  <footer className="customer-request-actions"><Link className="customer-request-view" to={target}>View request</Link><Link className="customer-request-message" to={`${target}#messages`}>Message {tailor?'requester':'tailor'}{unread>0&&<span className="customer-request-unread" aria-label={`${unread} unread messages`}>{unread}<span className="sr-only"> unread messages</span></span>}</Link></footer>
 </article>
}
