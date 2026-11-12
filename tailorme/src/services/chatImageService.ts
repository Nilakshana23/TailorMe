import {supabase} from '../lib/supabase'
import {transferStorageImage} from './shopUploads'
import {shopImageExtensions,validateShopImage} from '../utils/shopValidation'
export const CHAT_IMAGE_BUCKET='request-chat-images'
export type ChatImage={id:string;image_path:string}
export type ChatUpload=ChatImage&{owner_id:string;request_id:string;draft_id:string;message_id:string|null}
function client(){if(!supabase)throw Error('Authentication unavailable.');return supabase}
export function isOwnChatPath(path:string,userId:string){return path.startsWith(`${userId}/chat/`)&&/^[0-9a-f-]{36}\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)}
export const chatImageService={
 async reserve(id:string,requestId:string,draftId:string,extension:string):Promise<ChatUpload>{const {data,error}=await client().rpc('reserve_chat_image',{p_id:id,p_request_id:requestId,p_draft_id:draftId,p_extension:extension});if(error)throw error;return data},
 async ready(id:string):Promise<boolean>{const {data,error}=await client().rpc('chat_image_ready',{p_id:id});if(error)throw error;return data},
 async preview(path:string){const {data,error}=await client().storage.from(CHAT_IMAGE_BUCKET).createSignedUrl(path,120);if(error)throw Error('Private image unavailable. Refresh to retry.');return data.signedUrl},
 async remove(upload:ChatUpload,userId:string){
  if(upload.owner_id!==userId||!isOwnChatPath(upload.image_path,userId))throw Error('Cannot remove another participant’s upload.')
  const {error}=await client().storage.from(CHAT_IMAGE_BUCKET).remove([upload.image_path]);if(error)throw Error('Removal failed. Sent images are protected; retry to check this upload.')
  if(await chatImageService.ready(upload.id))throw Error('Image still present or protected. Its upload slot has been kept.')
  const result=await client().rpc('release_chat_image',{p_id:upload.id});if(result.error)throw result.error
 },
 async cleanup(userId:string,excludeDraft:string){const {data,error}=await client().rpc('unused_chat_images',{p_exclude_draft:excludeDraft});if(error)throw error;for(const upload of data as ChatUpload[])await chatImageService.remove(upload,userId);return data.length as number},
}
const transfer=(path:string,file:File,progress:(n:number)=>void)=>transferStorageImage(CHAT_IMAGE_BUCKET,path,file,progress,isOwnChatPath)
export async function uploadChatImage({id,requestId,draftId,file,userId,onReserved,progress,api=chatImageService,send=transfer}:{id:string;requestId:string;draftId:string;file:File;userId:string;onReserved:(u:ChatUpload)=>void;progress:(n:number)=>void;api?:typeof chatImageService;send?:typeof transfer}){
 await validateShopImage(file)
 const upload=await api.reserve(id,requestId,draftId,shopImageExtensions[file.type])
 if(upload.owner_id!==userId||!isOwnChatPath(upload.image_path,userId)||upload.request_id!==requestId||upload.draft_id!==draftId)throw Error('Your account or conversation changed. Reload before uploading.')
 onReserved(upload)
 if(await api.ready(id)){progress(100);return upload}
 try{await send(upload.image_path,file,progress)}catch(cause){
  // A failed reconciliation must not hide the original Storage diagnostic.
  let confirmed=false;try{confirmed=await api.ready(id)}catch{/* Keep slot/ID and original error for retry. */}
  if(confirmed){progress(100);return upload}throw cause
 }
 if(!await api.ready(id))throw Error('Image upload not confirmed. Retry or remove it before sending.')
 return upload
}
