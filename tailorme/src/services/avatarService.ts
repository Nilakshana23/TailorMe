import { supabase } from '../lib/supabase'
import { transferStorageImage } from './shopUploads'
import { shopImageExtensions, validateShopImage } from '../utils/shopValidation'

export const AVATAR_BUCKET = 'profile-avatars'
export const AVATAR_URL_SECONDS = 300
export function ownsAvatarPath(path:string,userId:string) {
 return path.split('/')[0]===userId && /^[0-9a-f-]{36}\/avatar\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)
}
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export async function validateAvatarImage(file:File) {
 await validateShopImage(file)
 // File signature alone does not prove the browser can decode the image.
 const image=await createImageBitmap(file).catch(()=>{throw new Error('This image could not be decoded. Export a JPEG, PNG or WebP and try again.')})
 try {if(!image.width||!image.height)throw new Error('Choose an image with visible dimensions.')}finally{image.close()}
}
export const avatarService={
 async set(path:string|null,expected:string|null):Promise<string|null>{
  const {data,error}=await client().rpc('set_profile_avatar',{p_path:path,p_expected_path:expected})
  if(error)throw new Error(error.message)
  window.dispatchEvent(new Event('tailorme:avatar-changed'))
  return data as string|null
 },
 async signed(path:string,userId:string){
  if(!ownsAvatarPath(path,userId))throw new Error('Photo unavailable.')
  const {data,error}=await client().storage.from(AVATAR_BUCKET).createSignedUrl(path,AVATAR_URL_SECONDS)
  if(error)throw new Error('Unable to load profile photo.')
  return data.signedUrl
 },
 async removeFile(path:string,userId:string){
  if(!ownsAvatarPath(path,userId))throw new Error('Cannot remove another account photo.')
  const {error}=await client().storage.from(AVATAR_BUCKET).remove([path])
  if(error)throw new Error('Unused photo cleanup failed. Retry cleanup later.')
 },
 async cleanup(userId:string){
  const {data,error}=await client().rpc('unused_avatar_uploads')
  if(error)throw new Error('Unable to find unused photos.')
  for(const {path} of data as {path:string}[])await avatarService.removeFile(path,userId)
 },
}
// New unique objects preserve the old photo until upload AND profile save succeed.
// RLS prevents cleanup deleting an attachment when a save response was lost.
export async function replaceAvatar({file,userId,previous,progress,validate=validateAvatarImage,transfer=(path,file,progress)=>transferStorageImage(AVATAR_BUCKET,path,file,progress,ownsAvatarPath),save=avatarService.set,cleanup=avatarService.removeFile}:{
 file:File;userId:string;previous:string|null;progress:(value:number)=>void
 validate?:(file:File)=>Promise<void>;transfer?:(path:string,file:File,progress:(value:number)=>void)=>Promise<void>
 save?:typeof avatarService.set;cleanup?:typeof avatarService.removeFile
}){
 await validate(file)
 const path=`${userId}/avatar/${crypto.randomUUID()}.${shopImageExtensions[file.type]}`
 try{await transfer(path,file,progress);await save(path,previous)}
 catch(cause){try{await cleanup(path,userId)}catch{/* Attached files remain protected; retry after reconciliation. */}throw new Error(`${cause instanceof Error?cause.message:'Photo could not be saved.'} Reload your account to check the saved state before retrying.`,{cause})}
 let cleanupFailed=false
 if(previous){try{await cleanup(previous,userId)}catch{cleanupFailed=true}}
 return {path,cleanupFailed}
}
