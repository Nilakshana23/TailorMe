import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../../auth/authContext'
import {requestReferenceService,uploadRequestReference} from '../../services/requestReferenceService'
import type {ReferenceUpload,ReferenceSelection,RequestImageReference} from '../../services/requestReferenceService'
import FormButton from '../ui/FormButton'
import {authError} from '../../services/authService'
import './RequestReferences.css'

export function ReferenceImage({path,number}:{path:string;number:number}){
 const {session}=useAuth(),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;url:string;error:boolean}|null>(null)
 const key=`${session?.user.id}:${path}:${attempt}`
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>|undefined
  requestReferenceService.preview(path).then(url=>{if(active){setResult({key,url,error:false});timer=setTimeout(()=>setAttempt(n=>n+1),90000)}}).catch(()=>{if(active)setResult({key,url:'',error:true})})
  return()=>{active=false;clearTimeout(timer)}
 },[key,path])
 const current=result?.key===key?result:null
 return <div>{!current?<p role="status">Loading private reference {number}...</p>:current.error?<p role="alert">Private image unavailable or expired.</p>:<img src={current.url} alt={`Private inspiration reference ${number}`} referrerPolicy="no-referrer" onError={()=>setResult({key,url:'',error:true})}/>}
 <FormButton variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Refresh image {number}</FormButton></div>
}
type DraftImage={id:string;file:File;upload?:ReferenceUpload;note:string;ready:boolean;error:string}
export function RequestReferenceEditor({disabled,onChange,onBusy}:{disabled:boolean;onChange:(selection:ReferenceSelection|null)=>void;onBusy:(busy:boolean)=>void}){
 const {session}=useAuth(),userId=session?.user.id
 const [batch]=useState(()=>crypto.randomUUID()),[items,setItems]=useState<DraftImage[]>([]),[pending,setPending]=useState(false),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('')
 const busy=useRef(false),active=useRef(false)
 useEffect(()=>{active.current=true;onChange(null);onBusy(false);return()=>{active.current=false}},[userId,onChange,onBusy])
 function publish(next:DraftImage[]){setItems(next);const ready=next.filter(row=>row.ready);onChange(ready.length?{batch,items:ready.map(row=>({id:row.id,note:row.note})),previews:ready.map(row=>({image_path:row.upload!.image_path,note:row.note}))}:null)}
 async function upload(item:DraftImage){
  if(!userId||busy.current||disabled)return
  busy.current=true;setPending(true);onBusy(true);setError('');setMessage('');setProgress(0)
  let reserved=item.upload
  const current=items.some(row=>row.id===item.id)?items:[...items,item]
  publish(current)
  try{
   const row=await uploadRequestReference({file:item.file,userId,batchId:batch,id:item.id,progress:n=>{if(active.current)setProgress(n)},onReserved:row=>{reserved=row}})
   if(active.current){publish(current.map(candidate=>candidate.id===item.id?{...candidate,upload:row,ready:true,error:''}:candidate));setMessage('Reference uploaded. The ready images and notes shown below will be shared with this tailor.')}
  }catch(cause){if(active.current){publish(current.map(candidate=>candidate.id===item.id?{...candidate,upload:reserved,ready:false,error:authError(cause)}:candidate));setError('This image is not included. Retry or remove it; you can send without failed images.')}}
  finally{busy.current=false;if(active.current){setPending(false);setProgress(null);onBusy(false)}}
 }
 async function remove(item:DraftImage){
  if(!userId||busy.current||disabled)return
  busy.current=true;setPending(true);onBusy(true);setError('')
  try{if(item.upload)await requestReferenceService.remove(item.upload,userId);if(active.current){publish(items.filter(row=>row.id!==item.id));setMessage('Reference removed from this request draft.')}}catch(cause){if(active.current)setError(`${authError(cause)} The image is kept until removal is confirmed.`)}finally{busy.current=false;if(active.current){setPending(false);onBusy(false)}}
 }
 return <section className="request-references" aria-label="Optional private reference images"><h3 className="font-display-lg text-headline-sm">Reference images (optional)</h3>
  <p>Share up to 5 JPEG, PNG or WebP images, up to 5 MB each. References communicate inspiration; identical reproduction is not guaranteed. Your tailor confirms feasibility.</p>
  <p>Only ready images and their notes listed here will be shared with this selected tailor. Files remain private. Submitted images and notes are fixed copies and cannot be removed or replaced. Styling-preview photos are never added automatically.</p>
  <fieldset disabled={disabled||pending||!userId}><legend className="sr-only">Choose reference images to share</legend>
   <label htmlFor="request-reference-upload" className="request-reference-upload-label">Add a private reference image</label><input id="request-reference-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={items.length>=5||disabled||pending||!userId} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&items.length<5)void upload({id:crypto.randomUUID(),file,note:'',ready:false,error:''})}}/>
   <div className="request-reference-grid">{items.map((item,index)=><article key={item.id}><h4>Reference {index+1} · {item.ready?'Will be shared':'Not included yet'}</h4>{item.ready&&item.upload?<ReferenceImage path={item.upload.image_path} number={index+1}/>:<p>{item.error||'Preparing private upload...'}</p>}
    <label htmlFor={`reference-note-${item.id}`}>Note for reference {index+1} (optional)</label><textarea id={`reference-note-${item.id}`} maxLength={500} rows={2} placeholder="Use this neckline" value={item.note} onChange={e=>publish(items.map(row=>row.id===item.id?{...row,note:e.target.value}:row))}/>
    {!item.ready&&<FormButton variant="secondary" onClick={()=>void upload(item)}>Retry reference {index+1}</FormButton>}<FormButton variant="secondary" onClick={()=>void remove(item)}>Remove reference {index+1}</FormButton>
   </article>)}</div>
  </fieldset>
  {!items.some(row=>row.ready)&&<p>No reference images will be shared. You can submit without them.</p>}
  {progress!==null&&<div><label htmlFor="reference-upload-progress">Uploading reference: {progress}%</label><progress id="reference-upload-progress" value={progress} max={100}/></div>}
  <FormButton variant="secondary" disabled={disabled||pending||!userId} onClick={()=>{if(!userId||busy.current)return;busy.current=true;setPending(true);onBusy(true);setError('');void requestReferenceService.cleanup(userId,batch).then(count=>{if(active.current)setMessage(`Cleaned ${count} of your unused upload slots older than one hour. Submitted files are protected.`)}).catch(cause=>{if(active.current)setError(authError(cause))}).finally(()=>{busy.current=false;if(active.current){setPending(false);onBusy(false)}})}}>Clean my unused reference uploads</FormButton>
  <p role="status">{message|| (pending?'Updating private references...':'')}</p>{error&&<p role="alert" className="text-error">{error}</p>}
 </section>
}

export default function RequestReferences({requestId}:{requestId:string}){
 const [attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;rows:RequestImageReference[];error:boolean}|null>(null)
 const {session}=useAuth(),key=`${session?.user.id}:${requestId}:${attempt}`
 useEffect(()=>{let active=true;requestReferenceService.list(requestId).then(rows=>{if(active)setResult({key,rows,error:false})}).catch(()=>{if(active)setResult({key,rows:[],error:true})});return()=>{active=false}},[key,requestId])
 const current=result?.key===key?result:null
 return <section className="request-references" aria-label="Submitted private reference images"><h3 className="font-display-lg text-headline-sm">Reference images shared with this request</h3><p>Inspiration references; your tailor confirms feasibility. These images and notes are fixed for this request.</p>
 {!current?<p role="status">Loading reference images...</p>:current.error?<><p role="alert">Unable to load private references.</p><FormButton variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Retry reference images</FormButton></>:current.rows.length?<div className="request-reference-grid">{current.rows.map(row=><article key={row.upload_id}><ReferenceImage path={row.image_path} number={row.ordinal}/><p className="request-reference-note">{row.note||'No note supplied.'}</p></article>)}</div>:<p>No reference images were shared with this request.</p>}
 </section>
}

export function FrozenRequestReferences({selection}:{selection:ReferenceSelection|null}){
 return <section className="request-references" aria-label="Frozen reference selection"><h3 className="font-semibold">References kept for this submission</h3><p>Retries use these same images and notes. They communicate inspiration; your tailor confirms feasibility.</p>{selection?.items.length?<div className="request-reference-grid">{selection.previews?.map((row,index)=><article key={row.image_path}><ReferenceImage path={row.image_path} number={index+1}/><p className="request-reference-note">{row.note||'No note supplied.'}</p></article>)}</div>:<p>No reference images are included.</p>}</section>
}
