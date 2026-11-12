export type UploadContext={bucket:string;objectPath:string;authenticatedUserId:string;contentType:string;bytes:number;upsert:false}

// Parse only Storage's public error fields. Never retain/log the raw response,
// headers, credentials, URLs or file bytes. Unknown/HTML responses stay generic.
function safeMessage(value:unknown,secrets:string[]){
 if(typeof value!=='string')return ''
 let text=value
 for(const secret of secrets)if(secret)text=text.split(secret).join('[redacted]')
 return text.replace(/(?:https?:\/\/|blob:|data:)[^\s"'<>]+/gi,'[URL redacted]')
  .replace(/Bearer\s+\S+/gi,'Bearer [redacted]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token redacted]')
  .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g,'[key redacted]')
  .replace(/\p{Cc}/gu,' ').slice(0,500).trim()
}
export class StorageUploadError extends Error{
 readonly name='StorageUploadError'
 readonly httpStatus:number
 readonly storageCode:string
 readonly storageMessage:string
 readonly context:UploadContext
 constructor(httpStatus:number,storageCode:string,storageMessage:string,context:UploadContext){
  const receipt=context.bucket==='request-payment-receipts'
  const hint=/AccessDenied|Unauthorized|row.level|permission/i.test(`${storageCode} ${storageMessage}`)?' Upload permission was denied. Ask support to check the reserved upload and Storage policies.':/BucketNotFound|bucket.*not.*found/i.test(`${storageCode} ${storageMessage}`)?' The private image bucket is unavailable.':/EntityTooLarge|too large|size.*exceed/i.test(`${storageCode} ${storageMessage}`)?' Choose an image no larger than 5 MB.':/InvalidMimeType|mime|content.type/i.test(`${storageCode} ${storageMessage}`)?' Choose a JPEG, PNG or WebP image.':/Duplicate|KeyAlreadyExists|ResourceAlreadyExists/i.test(`${storageCode} ${storageMessage}`)?' Retry this image to check whether its original upload finished.':''
  super(`${receipt?'Receipt':'Image'} upload rejected (HTTP ${httpStatus}${storageCode?`; ${storageCode}`:''})${storageMessage?`: ${storageMessage}`:'.'}${receipt?hint.replace('JPEG, PNG or WebP','JPEG, PNG, WebP or PDF').replace('an image','a receipt'):hint}`)
  this.httpStatus=httpStatus;this.storageCode=storageCode;this.storageMessage=storageMessage;this.context=context
 }
}
export function storageUploadError(status:number,response:string,context:UploadContext,secrets:string[]=[]){
 let code='',message=''
 try{const parsed=JSON.parse(response);if(parsed&&typeof parsed==='object'){
  const rawCode=parsed.code??parsed.error??parsed.statusCode
  if((typeof rawCode==='string'||typeof rawCode==='number')&&/^[A-Za-z0-9_ -]{1,64}$/.test(String(rawCode)))code=safeMessage(String(rawCode),secrets)
  message=safeMessage(parsed.message,secrets)
 }}catch{/* Do not expose an unexpected proxy HTML page or raw response. */}
 return new StorageUploadError(status,code,message,context)
}
