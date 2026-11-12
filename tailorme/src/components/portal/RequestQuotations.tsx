import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { usePortal } from '../../auth/portalContext'
import type { TailoringRequest } from '../../services/requestService'
import { quoteService, quoteFields, lkr } from '../../services/quoteService'
import type { QuoteFields, Quotation } from '../../services/quoteService'
import { authError } from '../../services/authService'
import FormButton from '../ui/FormButton'

export default function RequestQuotations({request}:{request:TailoringRequest}) {
 const {session}=useAuth();const {role}=usePortal()
 const [result,setResult]=useState<{key:string;rows:Quotation[];error:string}|null>(null)
 const [fields,setFields]=useState<QuoteFields>({stitching:'0.00',material:'0.00',other:'0.00',other_explanation:'',notes:''})
 const [pending,setPending]=useState(false);const [locked,setLocked]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('')
 const busy=useRef(false);const submission=useRef<{id:string;fields:QuoteFields}|null>(null)
 const key=`${request.id}:${request.version}`
 useEffect(()=>{let active=true;quoteService.list(request.id).then(rows=>{if(active)setResult({key,rows,error:''})}).catch(cause=>{if(active)setResult({key,rows:[],error:authError(cause)})});return()=>{active=false}},[key,request.id])
 const current=result?.key===key?result:null
 const agreed=current?.rows.find(row=>row.status==='accepted');const outstanding=current?.rows.find(row=>row.status==='outstanding')
 const tailor=request.tailor_id===session?.user.id&&role==='tailor';const customer=request.customer_id===session?.user.id
 async function action(work:()=>Promise<void>){if(busy.current)return;busy.current=true;setPending(true);setError('');setMessage('');try{await work()}catch(cause){setError(`${authError(cause)} Refresh quotations or retry the same action.`)}finally{busy.current=false;setPending(false)}}
 async function refresh(){const rows=await quoteService.list(request.id);setResult({key,rows,error:''});if(submission.current&&rows.some(row=>row.id===submission.current!.id)){submission.current=null;setLocked(false)}}
 async function send(){await action(async()=>{
  if(!submission.current){submission.current={id:crypto.randomUUID(),fields:quoteFields(fields)}}
  setLocked(true)
  try{await quoteService.send(submission.current.id,request,submission.current.fields)}catch(cause){if(cause&&typeof cause==='object'&&'code'in cause&&['22023','23514','23502','40001','42501'].includes(String(cause.code))){submission.current=null;setLocked(false)}throw cause}
  await refresh();submission.current=null;setLocked(false);setFields({stitching:'0.00',material:'0.00',other:'0.00',other_explanation:'',notes:''});setMessage('Quotation sent. The customer has an in-app notification.')
 })}
 async function answer(quote:Quotation,status:'accepted'|'declined'|'withdrawn'){await action(async()=>{await quoteService.answer(quote,status);window.dispatchEvent(new CustomEvent('tailorme:quotation-changed',{detail:{requestId:request.id}}));await refresh();setMessage(`Quotation ${status}.`);if(status==='withdrawn'){submission.current=null;setLocked(false)}})}
 return <section className="mt-8 border-t border-outline-variant pt-6" aria-label="Quotations"><h3 className="font-display-lg text-headline-sm">Quotations</h3><p className="mt-4">All charges are in LKR for the whole request quantity ({request.quantity}), not per item. Accepting a quotation does not make a payment. Request acceptance and quotation acceptance are separate.</p>
 <FormButton variant="secondary" className="px-5 mt-4" disabled={pending} onClick={()=>{void action(refresh)}}>Refresh quotations</FormButton>
 {!current?<p role="status" className="mt-4">Loading quotations...</p>:current.error?<p role="alert">{current.error}</p>:<>
 <p className="font-semibold mt-5">Quotation status: {agreed?'Accepted':outstanding?'Awaiting requester response':current.rows.length?current.rows[0].status:'No quotation yet'}</p>{agreed&&<p className="font-semibold mt-2">Agreed total: {lkr(agreed.total)}</p>}
 {!current.rows.length&&<p className="mt-4">No quotations have been sent.</p>}
 <ol className="space-y-5 mt-5">{current.rows.map(quote=><li key={quote.id} className="portal-card"><div className="flex flex-wrap justify-between gap-3"><h4 className="font-semibold">Quotation {quote.quote_number}</h4><span className="portal-gold-tag capitalize">{quote.status}</span></div><dl className="application-details mt-4">{[['Stitching charge',lkr(quote.stitching)],['Material charge',lkr(quote.material)],['Other charge',lkr(quote.other)],['Other charges explained',quote.other_explanation],['Notes',quote.notes]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="font-semibold mt-4">Total for all {request.quantity} items: {lkr(quote.total)}</p><p className="text-sm text-on-surface-variant mt-3">Sent {new Date(quote.created_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka){quote.answered_at&&` · Updated ${new Date(quote.answered_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})}`}</p>
 {quote.status==='outstanding'&&<div className="mt-4 space-y-3">{tailor&&<FormButton variant="secondary" className="w-full" disabled={pending} onClick={()=>{void answer(quote,'withdrawn')}}>Withdraw unanswered quotation</FormButton>}{customer&&<><FormButton disabled={pending||!!request.completed_at||request.status!=='accepted'} onClick={()=>{void answer(quote,'accepted')}}>Accept quotation — no payment</FormButton><FormButton variant="secondary" className="w-full" disabled={pending} onClick={()=>{void answer(quote,'declined')}}>Decline quotation</FormButton></>}</div>}</li>)}</ol>
 {tailor&&request.status==='accepted'&&!request.completed_at&&!outstanding&&!agreed&&<form className="mt-6 space-y-4" onSubmit={event=>{event.preventDefault();void send()}}><h4 className="font-semibold">Send {current.rows.length?'a revised':'a'} quotation</h4><p className="text-sm">Whole-request charges, with up to 2 decimal places. The total is calculated when saved.</p><fieldset disabled={pending||locked} className="space-y-4">{(['stitching','material','other'] as const).map(name=><div key={name}><label htmlFor={`quote-${name}`} className="block mb-2 capitalize">{name} charge (LKR)</label><input id={`quote-${name}`} className="application-textarea qualification-input" inputMode="decimal" maxLength={12} value={fields[name]} onChange={event=>setFields({...fields,[name]:event.target.value})}/></div>)}<div><label htmlFor="quote-explanation" className="block mb-2">Explanation of other charges (required when charged)</label><textarea id="quote-explanation" className="application-textarea" maxLength={1000} value={fields.other_explanation} onChange={event=>setFields({...fields,other_explanation:event.target.value})}/></div><div><label htmlFor="quote-notes" className="block mb-2">Notes (optional)</label><textarea id="quote-notes" className="application-textarea" maxLength={2000} value={fields.notes} onChange={event=>setFields({...fields,notes:event.target.value})}/></div></fieldset><FormButton type="submit" disabled={pending}>{locked?'Retry sending quotation':'Send quotation'}</FormButton>{locked&&<p className="text-sm">Original amounts are kept while confirming this submission to prevent duplicates.</p>}</form>}
 {agreed&&<p className="mt-4">Accepted charges are preserved. This quotation cannot be revised or replaced. Check Direct payments for receipt confirmations and the outstanding balance.</p>}
 </>}
 <p role="status" aria-live="polite" className="mt-4">{pending?'Saving quotation...':message}</p><p role="alert" className="text-error mt-3">{error}</p></section>
}
