import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../../auth/authContext'
import {usePortal} from '../../auth/portalContext'
import {designProposalService} from '../../services/designProposalService'
import type {AgreedDesign,DesignProposal,ProposalSubmission} from '../../services/designProposalService'
import type {TailoringRequest} from '../../services/requestService'
import type {ChatImage} from '../../services/chatImageService'
import {authError} from '../../services/authService'
import ChatImageComposer,{ChatImageView} from './ChatImages'
import RequestDesign from './RequestDesign'
import FormButton from '../ui/FormButton'
import './RequestDesignProposals.css'

function rolledBack(cause:unknown){return !!cause&&typeof cause==='object'&&'code' in cause&&['22023','23514','23502','42501','40001'].includes(String(cause.code))}

function References({images}:{images:ChatImage[]}){return <div className="chat-image-grid">{images.map((image,index)=><ChatImageView key={image.id} image={image} number={index+1} kind="design-reference"/>)}</div>}
function Agreed({design,requestId}:{design?:AgreedDesign;requestId:string}){
 return design&&design.version>0?<><h4 className="font-semibold">Agreed design version {design.version}</h4><p className="proposal-explanation">{design.explanation}</p><p>Accepted reference images; these are not editable garment geometry.</p><References images={design.images}/><time dateTime={design.agreed_at}>{new Date(design.agreed_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka)</time></>:<RequestDesign requestId={requestId} title="Current agreed design (original)"/>
}
export default function RequestDesignProposals({request,onPendingChange}:{request:TailoringRequest;onPendingChange:(pending:boolean)=>void}){
 const {session}=useAuth(),{role}=usePortal(),userId=session?.user.id
 const participant=!!userId&&[request.customer_id,request.tailor_id].includes(userId),tailor=role==='tailor'&&userId===request.tailor_id,customer=userId===request.customer_id
 const [result,setResult]=useState<{key:string;proposals:DesignProposal[];designs:AgreedDesign[]}|null>(null),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[attempt,setAttempt]=useState(0),[pending,setPending]=useState(false)
 const [draftId,setDraftId]=useState(()=>crypto.randomUUID()),[explanation,setExplanation]=useState(''),[images,setImages]=useState<ChatImage[]>([]),[uploadBusy,setUploadBusy]=useState(false)
 const [frozen,setFrozen]=useState<ProposalSubmission|null>(null),[decision,setDecision]=useState<{id:string;status:'accepted'|'declined'|'withdrawn';version:number}|null>(null),[confirmId,setConfirmId]=useState<string|null>(null)
 const busy=useRef(false),mounted=useRef(false),key=`${userId}:${request.id}`
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  if(!participant)return
  let active=true
  const load=()=>{void designProposalService.load(request.id).then(value=>{if(active){setResult({key,...value});onPendingChange(value.proposals.some(p=>p.status==='pending'));setLoadError('')
   if(frozen&&value.proposals.some(p=>p.id===frozen.id)){setFrozen(null);setImages([]);setExplanation('');setUploadBusy(false);setDraftId(crypto.randomUUID());setNotice('Proposal submission confirmed in history.')}
   if(decision){const saved=value.proposals.find(p=>p.id===decision.id);if(saved&&saved.status!=='pending'){setDecision(null);setConfirmId(null);setNotice(`Proposal is ${saved.status}. Review the recorded decision in history.`)}}
  }}).catch(cause=>{if(active)setLoadError(authError(cause))})}
  load();const update=()=>{if(document.visibilityState==='visible')load()},timer=setInterval(update,15000);window.addEventListener('focus',update)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',update)}
 },[key,request.id,request.version,attempt,participant,onPendingChange,frozen,decision])
 const current=result?.key===key?result:null,latest=current?.designs[0],proposal=current?.proposals.find(p=>p.status==='pending'),writable=request.status==='accepted'&&!request.completed_at
 async function action(fn:()=>Promise<unknown>,success:string){
  if(busy.current)return
  busy.current=true;setPending(true);setError('');setNotice('')
  try{await fn();if(mounted.current){setNotice(success);setAttempt(n=>n+1);window.dispatchEvent(new Event('tailorme:notifications-changed'))}}
  catch(cause){if(mounted.current)setError(`${authError(cause)} Your original submission is kept. Retry the same action or refresh history.`)}
  finally{busy.current=false;if(mounted.current)setPending(false)}
 }
 function propose(){
  if(uploadBusy||!current||busy.current)return
  if(!frozen&&(!explanation.trim()||[...explanation.trim()].length>2000||images.length<1||images.length>3)){setError('Explain the change (1–2,000 characters) and upload 1–3 reference images.');return}
  const submission=frozen??{id:draftId,requestId:request.id,explanation:explanation.trim(),images:structuredClone(images),requestVersion:request.version,designVersion:latest?.version??0}
  setFrozen(submission)
  void action(async()=>{try{await designProposalService.propose(submission)}catch(cause){if(mounted.current&&rolledBack(cause)){setFrozen(null);setAttempt(n=>n+1)}throw cause}if(mounted.current){setFrozen(null);setImages([]);setExplanation('');setUploadBusy(false);setDraftId(crypto.randomUUID())}},'Design change proposed. The agreed design is unchanged until the requester accepts.')
 }
 function decide(p:DesignProposal,status:'accepted'|'declined'|'withdrawn'){
  if(busy.current)return
  if(status==='accepted'&&confirmId!==p.id){setConfirmId(p.id);return}
  const chosen=decision??{id:p.id,status,version:p.version};setDecision(chosen)
  void action(async()=>{try{await designProposalService.decide(chosen.id,chosen.status,chosen.version,chosen.status==='accepted')}catch(cause){if(mounted.current&&rolledBack(cause)){setDecision(null);setConfirmId(null);setAttempt(n=>n+1)}throw cause}if(mounted.current){setDecision(null);setConfirmId(null)}},`Proposal ${chosen.status}. Price and confirmed deadline have not changed.`)
 }
 if(!participant)return null
 return <section id="design-proposals" data-request-section aria-busy={!current&&!loadError} className="request-design-proposals" aria-labelledby="design-proposals-title"><h3 id="design-proposals-title" className="font-display-lg text-headline-sm">Agreed design and change proposals</h3>
 <p>Only accepting a design-change proposal changes the agreed design. Ordinary chat images do not. Acceptance does not change the price or confirmed completion date; quotations and dates are handled separately.</p>
 <FormButton variant="secondary" disabled={pending} onClick={()=>{setError('');setAttempt(n=>n+1)}}>Refresh design history</FormButton>
 {!current?<p role="status">{loadError?'Design history unavailable. Use Refresh design history to retry.':'Loading agreed design and proposals...'}</p>:<>
 <div className="proposal-comparison"><div className="proposal-design"><Agreed design={latest} requestId={request.id}/></div>{proposal&&<div className="proposal-design"><h4 className="font-semibold">Proposed change · Pending</h4><p className="proposal-explanation">{proposal.explanation}</p><p>Private design references, not editable garment geometry. Compared with agreed version {proposal.base_version}.</p><References images={proposal.images}/><p role="status">Completion is blocked until this proposal is accepted, declined or withdrawn.</p>
 {writable&&<div className="proposal-actions">{customer?<><FormButton disabled={pending||!!decision} onClick={()=>setConfirmId(proposal.id)}>Review acceptance</FormButton><FormButton variant="secondary" disabled={pending||!!decision} onClick={()=>decide(proposal,'declined')}>Decline proposal</FormButton></>:tailor?<FormButton variant="secondary" disabled={pending||!!decision} onClick={()=>decide(proposal,'withdrawn')}>Withdraw proposal</FormButton>:null}</div>}
 {customer&&writable&&confirmId===proposal.id&&<div className="proposal-confirm" role="group" aria-label="Confirm design acceptance"><p>Accept these reference images as the new agreed design? The original and all previous versions remain in history. Price and confirmed deadline stay unchanged.</p><FormButton disabled={pending||!!decision} onClick={()=>decide(proposal,'accepted')}>Confirm accept design change</FormButton><FormButton variant="secondary" disabled={pending||!!decision} onClick={()=>setConfirmId(null)}>Keep current design</FormButton></div>}</div>}</div>
 {latest&&latest.version>0&&<details><summary>Original design and previous agreed versions</summary><RequestDesign requestId={request.id} title="Original request design (preserved)"/>{current.designs.filter(d=>d.version>0&&d.version!==latest.version).map(design=><article key={design.version}><Agreed design={design} requestId={request.id}/></article>)}</details>}
 {!proposal&&<p>No pending design proposal.</p>}
 {tailor&&writable&&<form hidden={!!proposal&&!frozen} onSubmit={e=>{e.preventDefault();propose()}} aria-busy={pending}><h4 className="font-semibold">Propose a design change</h4><p>Explain the requested change and attach 1–3 private design-reference images. Images are references, not editable garment geometry. The customer must explicitly accept before these replace the agreed design.</p><fieldset disabled={pending||!!frozen}><label htmlFor="proposal-explanation">Explanation (required)</label><textarea id="proposal-explanation" rows={3} maxLength={4000} value={explanation} onChange={e=>setExplanation(e.target.value)}/><ChatImageComposer purpose="proposal" key={draftId} requestId={request.id} draftId={draftId} disabled={pending||!!frozen} onChange={setImages} onBusy={setUploadBusy}/></fieldset>{frozen&&<><p>Your original explanation and references are fixed for this retry.</p><p className="proposal-explanation">{frozen.explanation}</p><References images={frozen.images}/></>}<FormButton type="submit" disabled={pending||uploadBusy}>{pending?'Submitting proposal...':frozen?'Retry same proposal':'Send design proposal'}</FormButton></form>}
 <details><summary>Complete proposal and decision history ({current.proposals.length})</summary>{current.proposals.length?current.proposals.map(p=><article key={p.id}><h4 className="font-semibold">{p.status[0].toUpperCase()+p.status.slice(1)} · Based on agreed version {p.base_version}</h4><p className="proposal-explanation">{p.explanation}</p><References images={p.images}/><p>Proposed by the addressed tailor · <time dateTime={p.created_at}>{new Date(p.created_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka)</time></p>{p.decided_at&&<p>{p.status} by {p.decided_by===request.customer_id?'customer':'tailor'} · <time dateTime={p.decided_at}>{new Date(p.decided_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka)</time></p>}</article>):<p>No design-change proposals yet.</p>}</details>
 </>}
 {decision&&<FormButton disabled={pending} onClick={()=>{if(!current)return;const p=current.proposals.find(p=>p.id===decision.id);if(p)decide(p,decision.status)}}>Retry same proposal decision</FormButton>}
 {!writable&&<p>This request is not open for design changes. History remains available.</p>}{loadError&&<p role="alert">{loadError}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>
}
