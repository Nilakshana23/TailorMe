import { supabase } from '../lib/supabase'
import { SHOP_BUCKET, isOwnShopPath, shopService } from './shopService'
import { shopImageExtensions, validateShopImage } from '../utils/shopValidation'
import {storageUploadError} from '../utils/storageUploadError'

// XHR provides real byte progress; authentication still uses the shared client's
// current SDK-managed session. Tokens exist only in this request, never logs/storage.
export async function transferStorageImage(bucket: string, path: string, file: File, progress: (value: number) => void, ownsPath: (path: string, userId: string) => boolean) {
  if (!supabase) throw new Error('Supabase is unavailable.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('Your session expired. Sign in again before uploading.')
  if (!ownsPath(path, data.session.user.id)) throw new Error('Your account changed. Reload before uploading.')
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', endpoint)
    request.timeout = 120000
    request.setRequestHeader('Authorization', `Bearer ${data.session!.access_token}`)
    request.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    request.setRequestHeader('Content-Type', file.type)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 95)) }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) { progress(100); resolve() }
      else reject(storageUploadError(request.status,request.responseText,{bucket,objectPath:path,authenticatedUserId:data.session!.user.id,contentType:file.type,bytes:file.size,upsert:false},[data.session!.access_token,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY]))
    }
    request.onerror = () => reject(new Error('The image upload connection failed. Reload to reconcile before retrying.'))
    request.ontimeout = () => reject(new Error('The image upload timed out. Reload to reconcile before retrying.'))
    request.onabort = () => reject(new Error('Image upload was cancelled.'))
    request.send(file)
  })
}

const upload = (path: string, file: File, progress: (value: number) => void) => transferStorageImage(SHOP_BUCKET,path,file,progress,isOwnShopPath)

export async function uploadShopImage<T>({ file, userId, kind, attach, progress, cleanup = shopService.deleteFile, transfer = upload }: {
  file: File; userId: string; kind: 'cover' | 'portfolio'; attach: (path: string) => Promise<T>
  progress: (value: number) => void; cleanup?: typeof shopService.deleteFile; transfer?: typeof upload
}): Promise<{ result: T; path: string }> {
  await validateShopImage(file)
  const path = `${userId}/${kind}/${crypto.randomUUID()}.${shopImageExtensions[file.type]}`
  progress(0)
  try {
    await transfer(path, file, progress)
    return { result: await attach(path), path }
  } catch (cause) {
    // Cleanup cannot remove an attached file: Storage's delete policy checks DB
    // references even when a successful attachment response was lost in transit.
    let cleanupFailed = false
    try { await cleanup(path, userId) } catch { cleanupFailed = true }
    const message = cause instanceof Error ? cause.message : 'The image could not be saved.'
    throw new Error(`${message} Reload to check the saved state.${cleanupFailed ? ' Cleanup could not finish; use Clean Unused Uploads after one hour.' : ''}`, { cause })
  }
}
