import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import { avatarService, ownsAvatarPath } from '../../services/avatarService'
import './ProfileAvatar.css'

export default function ProfileAvatar({path,userId,name}:{path:string|null;userId:string;name:string}){
 const {session}=useAuth()
 const [result,setResult]=useState<{key:string;url:string}|null>(null),[failed,setFailed]=useState('')
 const key=`${session?.user.id}:${userId}:${path}`
 useEffect(()=>{
  if(!path||session?.user.id!==userId||!ownsAvatarPath(path,userId))return
  let active=true
  const refresh=()=>{void avatarService.signed(path,userId).then(url=>{if(active)setResult({key,url})}).catch(()=>{if(active)setResult(null)})}
  refresh();const timer=setInterval(refresh,240000);window.addEventListener('focus',refresh)
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}
 },[key,path,userId,session?.user.id])
 const url=result?.key===key?result.url:null
 const initials=name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase()||'TM'
 return <span className="profile-avatar" aria-hidden="true">{url&&failed!==url?<img src={url} alt="" onError={()=>setFailed(url)}/>:<span>{initials}</span>}</span>
}
