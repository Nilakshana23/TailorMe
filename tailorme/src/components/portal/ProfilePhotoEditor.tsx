import { useEffect, useRef, useState } from 'react'
import { usePortal } from '../../auth/portalContext'
import { avatarService, replaceAvatar } from '../../services/avatarService'
import FormButton from '../ui/FormButton'
import ProfileAvatar from './ProfileAvatar'

function SelectedPhoto({file}:{file:File}){
 const ref=useRef<HTMLImageElement>(null)
 useEffect(()=>{const url=URL.createObjectURL(file);if(ref.current)ref.current.src=url;return()=>URL.revokeObjectURL(url)},[file])
 return <img ref={ref} alt="Selected profile photo preview" className="avatar-editor-preview"/>
}
export default function ProfilePhotoEditor(){
 const {profile}=usePortal()
 const input=useRef<HTMLInputElement>(null),busy=useRef(false)
 const [pending,setPending]=useState(false),[file,setFile]=useState<File|null>(null),[progress,setProgress]=useState<number|null>(null)
 const [message,setMessage]=useState(''),[error,setError]=useState('')
 if(!profile)return null
 const path=profile.avatar_path??null
 async function action(work:()=>Promise<void>){
  if(busy.current)return;busy.current=true;setPending(true);setMessage('');setError('')
  try{await work()}catch(cause){setError(cause instanceof Error?cause.message:'Unable to update photo.')}
  finally{busy.current=false;setPending(false);setProgress(null)}
 }
 return <section className="avatar-editor" aria-labelledby="profile-photo-title"><h2 id="profile-photo-title" className="font-semibold mb-3">Personal profile photo (optional)</h2><ProfileAvatar path={path} userId={profile.id} name={profile.full_name}/><p id="profile-photo-help" className="text-sm mt-3">Private to your account, separate from your public shop cover and styling previews. JPEG, PNG or WebP, up to 5 MB.</p>
  <input ref={input} className="sr-only" tabIndex={-1} aria-label="Choose profile photo" aria-describedby="profile-photo-help" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={event=>{setFile(event.target.files?.[0]??null);setError('');setMessage('');event.target.value=''}}/>
  {file&&<SelectedPhoto file={file}/>}
  <div className="avatar-editor-actions"><FormButton variant="secondary" disabled={pending} onClick={()=>input.current?.click()}>{path?'Choose replacement':'Choose photo'}</FormButton>{file&&<><FormButton disabled={pending} onClick={()=>{void action(async()=>{const result=await replaceAvatar({file,userId:profile.id,previous:path,progress:setProgress});setFile(null);setMessage(result.cleanupFailed?'Photo saved. Old-file cleanup could not finish; retry cleanup later.':'Profile photo saved.');})}}>Save photo</FormButton><FormButton variant="secondary" disabled={pending} onClick={()=>setFile(null)}>Cancel selection</FormButton></>}{path&&<FormButton variant="secondary" disabled={pending} onClick={()=>{void action(async()=>{await avatarService.set(null,path);setFile(null);try{await avatarService.removeFile(path,profile.id);setMessage('Profile photo removed.')}catch{setMessage('Photo removed from your profile. Retry unused-file cleanup later.')}})}}>Remove photo</FormButton>}<FormButton variant="secondary" disabled={pending} onClick={()=>{void action(async()=>{await avatarService.cleanup(profile.id);setMessage('Unused photo cleanup complete. Only unreferenced uploads older than one hour are eligible.')})}}>Clean unused photos</FormButton></div>
  <p role="status" aria-live="polite" className="text-sm mt-3">{pending?progress===null?'Updating profile photo...':progress===100?'Saving profile photo...':`Uploading photo: ${progress}%`:message}</p><p role="alert" className="text-sm text-error mt-2">{error}</p>
 </section>
}
