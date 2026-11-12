import {supabase} from '../lib/supabase'
import {transferStorageImage} from './shopUploads'
import {validateShopImage,shopImageExtensions} from '../utils/shopValidation'
export const REQUEST_REFERENCE_BUCKET='request-reference-images'
export type ReferenceUpload={id:string;owner_id:string;batch_id:string;image_path:string;submitted_request_id:string|null}
export type ReferenceSelection={batch:string;items:{id:string;note:string}[];previews?:{image_path:string;note:string}[]}
export type RequestImageReference={request_id:string;ordinal:number;upload_id:string;image_path:string;note:string}
export function isOwnReferencePath(path:string,userId:string){return path.startsWith(`${userId}/references/`)&&/^[0-9a-f-]{36}\/references\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)}
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export const requestReferenceService={
 async reserve(id:string,batch:string,extension:string):Promise<ReferenceUpload>{const {data,error}=await client().rpc('reserve_request_reference',{p_id:id,p_batch_id:batch,p_extension:extension});if(error)throw error;return data},
 async ready(id:string):Promise<boolean>{const {data,error}=await client().rpc('request_reference_ready',{p_id:id});if(error)throw error;return data},
 async preview(path:string):Promise<string>{const {data,error}=await client().storage.from(REQUEST_REFERENCE_BUCKET).createSignedUrl(path,120);if(error)throw Error('Private preview unavailable. Refresh to retry.');return data.signedUrl},
 async list(requestId:string):Promise<RequestImageReference[]>{const {data,error}=await client().from('request_image_references').select('*').eq('request_id',requestId).order('ordinal');if(error)throw error;return data as RequestImageReference[]},
 async remove(upload:ReferenceUpload,userId:string){
  if(!isOwnReferencePath(upload.image_path,userId)||upload.owner_id!==userId)throw Error('Cannot clean another customer’s reference.')
  const {error}=await client().storage.from(REQUEST_REFERENCE_BUCKET).remove([upload.image_path]);if(error)throw Error('File removal failed. Retry; submitted references are protected.')
  if(await requestReferenceService.ready(upload.id))throw Error('This file is still present or protected. Reload before retrying removal.')
  const result=await client().rpc('release_request_reference',{p_id:upload.id});if(result.error)throw result.error
 },
 async cleanup(userId:string,excludeBatch?:string){const {data,error}=await client().rpc('unused_request_reference_uploads',{p_exclude_batch:excludeBatch??null});if(error)throw error;for(const row of data as ReferenceUpload[])await requestReferenceService.remove(row,userId);return data.length as number},
}
const transfer=(path:string,file:File,progress:(n:number)=>void)=>transferStorageImage(REQUEST_REFERENCE_BUCKET,path,file,progress,isOwnReferencePath)
export async function uploadRequestReference({file,userId,batchId,id,progress,onReserved,api=requestReferenceService,send=transfer}:{file:File;userId:string;batchId:string;id:string;progress:(n:number)=>void;onReserved:(u:ReferenceUpload)=>void;api?:typeof requestReferenceService;send?:typeof transfer}):Promise<ReferenceUpload>{
 await validateShopImage(file)
 const row=await api.reserve(id,batchId,shopImageExtensions[file.type])
 if(!isOwnReferencePath(row.image_path,userId)||row.owner_id!==userId)throw Error('Your account changed. Reload before uploading.')
 onReserved(row)
 if(await api.ready(id)){progress(100);return row}
 try{await send(row.image_path,file,progress)}catch(cause){if(await api.ready(id)){progress(100);return row}throw cause}
 if(!await api.ready(id))throw Error('Upload could not be confirmed. Retry this image or remove it; it is not included yet.')
 return row
}
