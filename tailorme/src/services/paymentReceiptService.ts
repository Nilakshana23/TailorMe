import {supabase} from '../lib/supabase'
import {transferStorageImage} from './shopUploads'
import {validateShopImage,shopImageExtensions} from '../utils/shopValidation'
export const RECEIPT_BUCKET='request-payment-receipts'
export type ReceiptUpload={id:string;owner_id:string;request_id:string;draft_id:string;image_path:string;payment_id:string|null}
function client(){if(!supabase)throw Error('Authentication unavailable.');return supabase}
export function isOwnReceiptPath(path:string,user:string){return path.startsWith(`${user}/receipts/`)&&/^[0-9a-f-]{36}\/receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(path)}
export async function validateReceipt(file:File){
 if(file.type!=='application/pdf'){await validateShopImage(file);return shopImageExtensions[file.type]}
 if(file.size<=0||file.size>5242880)throw Error('Choose a receipt larger than 0 bytes and no larger than 5 MB.')
 if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw Error('The receipt contents do not match PDF. Export it again.')
 return 'pdf'
}
export const paymentReceiptService={
 async reserve(id:string,requestId:string,draftId:string,extension:string):Promise<ReceiptUpload>{const {data,error}=await client().rpc('reserve_payment_receipt',{p_id:id,p_request_id:requestId,p_draft_id:draftId,p_extension:extension});if(error)throw Object.assign(new Error(error.message),{code:error.code});return data},
 async ready(id:string):Promise<boolean>{const {data,error}=await client().rpc('payment_receipt_ready',{p_id:id});if(error)throw Object.assign(new Error(error.message),{code:error.code});return data},
 async preview(path:string){const {data,error}=await client().storage.from(RECEIPT_BUCKET).createSignedUrl(path,120);if(error)throw Error('Private receipt unavailable. Refresh to retry.');return data.signedUrl},
 async remove(upload:ReceiptUpload,user:string){
  if(upload.owner_id!==user||!isOwnReceiptPath(upload.image_path,user))throw Error('Cannot remove another customer’s receipt.')
  const {error}=await client().storage.from(RECEIPT_BUCKET).remove([upload.image_path]);if(error)throw Error('Receipt removal failed. Submitted receipts are protected.')
  if(await paymentReceiptService.ready(upload.id))throw Error('Receipt is still present or protected; its slot is kept.')
  const result=await client().rpc('release_payment_receipt',{p_id:upload.id});if(result.error)throw new Error(result.error.message)
 },
 async cleanup(user:string,draftId:string){const {data,error}=await client().rpc('unused_payment_receipts',{p_exclude_draft:draftId});if(error)throw Object.assign(new Error(error.message),{code:error.code});for(const row of data as ReceiptUpload[])await paymentReceiptService.remove(row,user);return data.length as number},
}
const transfer=(path:string,file:File,progress:(n:number)=>void)=>transferStorageImage(RECEIPT_BUCKET,path,file,progress,isOwnReceiptPath)
export async function uploadReceipt({file,id,requestId,draftId,userId,progress,onReserved,api=paymentReceiptService,send=transfer}:{file:File;id:string;requestId:string;draftId:string;userId:string;progress:(n:number)=>void;onReserved:(u:ReceiptUpload)=>void;api?:typeof paymentReceiptService;send?:typeof transfer}){
 const extension=await validateReceipt(file),row=await api.reserve(id,requestId,draftId,extension)
 if(row.owner_id!==userId||row.request_id!==requestId||row.draft_id!==draftId||!isOwnReceiptPath(row.image_path,userId))throw Error('Your account or request changed. Reload before uploading.')
 onReserved(row);if(await api.ready(id)){progress(100);return row}
 try{await send(row.image_path,file,progress)}catch(cause){let ready=false;try{ready=await api.ready(id)}catch{/* Preserve the original Storage diagnostic. */}if(ready){progress(100);return row}throw cause}
 if(!await api.ready(id))throw Error('Receipt upload not confirmed. Retry or remove it before review.')
 return row
}
