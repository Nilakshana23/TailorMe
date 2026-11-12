import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../../auth/authContext'
import {paymentReceiptService,uploadReceipt} from '../../services/paymentReceiptService'
import type {ReceiptUpload} from '../../services/paymentReceiptService'
import {authError} from '../../services/authService'
import FormButton from '../ui/FormButton'

export function ReceiptView({path}:{path:string}){
 const {session}=useAuth(),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;url:string;error:boolean}|null>(null),key=`${session?.user.id}:${path}:${attempt}`
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>|undefined;void paymentReceiptService.preview(path).then(url=>{if(active){setResult({key,url,error:false});timer=setTimeout(()=>setAttempt(n=>n+1),90000)}}).catch(()=>{if(active)setResult({key,url:'',error:true})});return()=>{active=false;clearTimeout(timer)}},[key,path])
 const current=result?.key===key?result:null
 return <div className="payment-receipt">{!current?<p role="status">Loading private receipt...</p>:current.error?<p role="alert">Private receipt unavailable or expired.</p>:<>{!path.endsWith('.pdf')&&<img src={current.url} alt="Private payment receipt" referrerPolicy="no-referrer" onError={()=>setResult({key,url:'',error:true})}/>}<a href={current.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open private {path.endsWith('.pdf')?'PDF receipt':'receipt image'} in a new tab</a></>}<FormButton variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Refresh receipt</FormButton></div>
}
type Draft={id:string;file:File;upload?:ReceiptUpload;ready:boolean}
export default function PaymentReceiptEditor({requestId,draftId,disabled,onReady,onBusy}:{requestId:string;draftId:string;disabled:boolean;onReady:(upload:ReceiptUpload|null)=>void;onBusy:(busy:boolean)=>void}){
 const {session}=useAuth(),user=session?.user.id
 const [draft,setDraft]=useState<Draft|null>(null),[pending,setPending]=useState(false),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),busy=useRef(false),active=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function upload(item:Draft){
  if(!user||busy.current||disabled)return;busy.current=true;setPending(true);onBusy(true);setError('');setProgress(0);setDraft(item);let reserved=item.upload
  try{const row=await uploadReceipt({id:item.id,file:item.file,userId:user,requestId,draftId,onReserved:u=>{reserved=u},progress:n=>{if(active.current)setProgress(n)}});if(active.current){setDraft({...item,upload:row,ready:true});onReady(row);onBusy(false)}}
  catch(cause){if(active.current){setDraft({...item,upload:reserved,ready:false});onReady(null);setError(authError(cause));onBusy(true)}}finally{busy.current=false;if(active.current){setPending(false);setProgress(null)}}
 }
 async function remove(){if(!user||busy.current||disabled||!draft)return;busy.current=true;setPending(true);onBusy(true);setError('');try{if(draft.upload)await paymentReceiptService.remove(draft.upload,user);if(active.current){setDraft(null);onReady(null);onBusy(false)}}catch(cause){if(active.current){setError(`${authError(cause)} Your receipt selection is kept.`);onBusy(!draft.ready)}}finally{busy.current=false;if(active.current)setPending(false)}}
 return <section className="payment-receipt-editor" aria-label="Private transfer receipt"><fieldset disabled={disabled||pending||!user}><label htmlFor={`payment-receipt-${draftId}`}>Upload one receipt (JPEG, PNG, WebP or PDF; maximum 5 MB)</label><input id={`payment-receipt-${draftId}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={!!draft||disabled||pending} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload({id:crypto.randomUUID(),file,ready:false})}}/>{draft?.ready&&draft.upload&&<ReceiptView path={draft.upload.image_path}/>}<p>A receipt upload is evidence for review. It does not confirm receipt of money.</p>{draft&&!draft.ready&&<FormButton variant="secondary" onClick={()=>void upload(draft)}>Retry same receipt</FormButton>}{draft&&<FormButton variant="secondary" onClick={()=>void remove()}>Remove receipt</FormButton>}</fieldset>{progress!==null&&<div><label htmlFor={`receipt-progress-${draftId}`}>Uploading receipt: {progress}%</label><progress id={`receipt-progress-${draftId}`} value={progress} max={100}/></div>}<FormButton variant="secondary" disabled={disabled||pending||!user} onClick={()=>{if(!user||busy.current)return;busy.current=true;setPending(true);onBusy(true);void paymentReceiptService.cleanup(user,draftId).then(n=>{if(active.current)setNotice(`Cleaned ${n} of your unused receipts older than one hour. Submitted receipts are protected.`)}).catch(cause=>{if(active.current)setError(authError(cause))}).finally(()=>{busy.current=false;if(active.current){setPending(false);onBusy(!!draft&&!draft.ready)}})}}>Clean my unused receipt uploads</FormButton>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</section>
}
