import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../../auth/authContext'
import {chatImageService,uploadChatImage} from '../../services/chatImageService'
import type {ChatImage,ChatUpload} from '../../services/chatImageService'
import {authError} from '../../services/authService'
import FormButton from '../ui/FormButton'
import './ChatImages.css'

export function ChatImageView({image,number,kind='message'}:{image:ChatImage;number:number;kind?:'message'|'design-reference'}){
 const imageLabel=kind==='design-reference'?'design reference':'message image'
 const {session}=useAuth(),[attempt,setAttempt]=useState(0),[result,setResult]=useState<{key:string;url:string}|null>(null),[error,setError]=useState('')
 const modal=useRef<HTMLDialogElement>(null),key=`${session?.user.id}:${image.image_path}:${attempt}`
 useEffect(()=>{let active=true;let timer:ReturnType<typeof setTimeout>|undefined
  chatImageService.preview(image.image_path).then(url=>{if(active){setResult({key,url});setError('');timer=setTimeout(()=>setAttempt(n=>n+1),90000)}}).catch(()=>{if(active){setResult({key,url:''});setError('Private image unavailable. Refresh to retry.')}})
  return()=>{active=false;clearTimeout(timer)}
 },[image.image_path,key])
 const url=result?.key===key?result.url:''
 return <div className="chat-image-view">{url?<button type="button" className="chat-image-open" aria-label={`Enlarge ${imageLabel} ${number}`} onClick={()=>modal.current?.showModal()}><img src={url} alt={`${imageLabel} ${number}`} referrerPolicy="no-referrer" onError={()=>{setResult({key,url:''});setError('Image expired or unavailable. Refresh to retry.')}}/></button>:<p role="status">{result?.key===key?error:'Loading private image...'}</p>}
 <FormButton variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Refresh image {number}</FormButton>
 <dialog ref={modal} className="chat-image-dialog" aria-label={`Enlarged ${imageLabel} ${number}`} onClick={e=>{if(e.target===e.currentTarget)modal.current?.close()}}><FormButton variant="secondary" autoFocus onClick={()=>modal.current?.close()}>Close image</FormButton>{url&&<img src={url} alt={`Enlarged ${imageLabel} ${number}`} referrerPolicy="no-referrer"/>}</dialog></div>
}

type Draft={id:string;file:File;upload?:ChatUpload;ready:boolean;error:string}
export default function ChatImageComposer({requestId,draftId,disabled,onChange,onBusy,purpose='chat'}:{requestId:string;draftId:string;disabled:boolean;onChange:(images:ChatImage[])=>void;onBusy:(busy:boolean)=>void;purpose?:'chat'|'proposal'}){
 const {session}=useAuth(),userId=session?.user.id
 const [items,setItems]=useState<Draft[]>([]),[pending,setPending]=useState(false),[progress,setProgress]=useState<number|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('')
 const active=useRef(false),busy=useRef(false),picker=useRef<HTMLInputElement>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 function publish(next:Draft[]){setItems(next);onChange(next.filter(item=>item.ready).map(item=>({id:item.id,image_path:item.upload!.image_path})));onBusy(next.some(item=>!item.ready))}
 async function upload(item:Draft){
  if(!userId||disabled||busy.current)return
  busy.current=true;setPending(true);setProgress(0);setError('');setMessage('');onBusy(true)
  const current=items.some(row=>row.id===item.id)?items:[...items,item];let reserved=item.upload
  publish(current)
  try{const saved=await uploadChatImage({id:item.id,requestId,draftId,file:item.file,userId,onReserved:u=>{reserved=u},progress:n=>{if(active.current)setProgress(n)}})
   if(active.current)publish(current.map(row=>row.id===item.id?{...row,upload:saved,ready:true,error:''}:row))
  }catch(cause){if(active.current)publish(current.map(row=>row.id===item.id?{...row,upload:reserved,ready:false,error:authError(cause)}:row))}
  finally{busy.current=false;if(active.current){setPending(false);setProgress(null)}}
 }
 async function remove(item:Draft){
  if(!userId||disabled||busy.current)return
  busy.current=true;setPending(true);onBusy(true);setError('')
  try{if(item.upload)await chatImageService.remove(item.upload,userId);if(active.current)publish(items.filter(row=>row.id!==item.id))}
  catch(cause){if(active.current){setError(`${authError(cause)} Your image is kept.`);onBusy(items.some(row=>!row.ready))}}
  finally{busy.current=false;if(active.current)setPending(false)}
 }
 return <section className="chat-image-composer" aria-label={purpose==='proposal'?'Design reference images':'Message images'}><fieldset disabled={disabled||pending||!userId}>
 <FormButton variant="secondary" disabled={items.length>=3} onClick={()=>picker.current?.click()}>{purpose==='proposal'?'Attach design reference':'Attach image'}</FormButton><input ref={picker} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label={purpose==='proposal'?'Choose private design reference':'Choose private message image'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file&&items.length<3)void upload({id:crypto.randomUUID(),file,ready:false,error:''})}}/>
 <p>Up to 3 JPEG, PNG or WebP images, 5 MB each. Only this request’s participants can view sent images. Sent images cannot be removed or replaced.</p>
 <div className="chat-image-grid">{items.map((item,index)=><article key={item.id}>{item.ready&&item.upload?<ChatImageView image={item.upload} number={index+1} kind={purpose==='proposal'?'design-reference':'message'}/>:<p role="status">{item.error||'Preparing upload...'}</p>}{!item.ready&&<FormButton variant="secondary" onClick={()=>void upload(item)}>Retry image {index+1}</FormButton>}<FormButton variant="secondary" onClick={()=>void remove(item)}>Remove image {index+1}</FormButton></article>)}</div>
 </fieldset>{progress!==null&&<div><label htmlFor={`chat-upload-${draftId}`}>Uploading image: {progress}%</label><progress id={`chat-upload-${draftId}`} value={progress} max={100}/></div>}
 <FormButton variant="secondary" disabled={disabled||pending||!userId} onClick={()=>{if(!userId||busy.current)return;busy.current=true;setPending(true);onBusy(true);void chatImageService.cleanup(userId,draftId).then(count=>{if(active.current)setMessage(`Cleaned ${count} unused uploads older than one hour. Sent images are protected.`)}).catch(cause=>{if(active.current)setError(authError(cause))}).finally(()=>{busy.current=false;if(active.current){setPending(false);onBusy(items.some(item=>!item.ready))}})}}>Clean my unused chat uploads</FormButton>
 {pending&&<p role="status">Updating private images...</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
 </section>
}
