import { supabase, configurationError } from '../lib/supabase'
import { transferStorageImage } from './shopUploads'
import { validateShopImage, shopImageExtensions } from '../utils/shopValidation'

export const EVIDENCE_BUCKET = 'tailor-application-evidence'
export const EVIDENCE_PREVIEW_SECONDS = 120
export type ApplicationEvidence = { id: string; applicant_id: string; image_path: string }
export function isOwnEvidencePath(path: string, userId: string) {
  return path.split('/')[0] === userId && /^[0-9a-f-]{36}\/work\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)
}
function client() { if (!supabase) throw new Error(configurationError ?? 'Authentication is unavailable.'); return supabase }
export const evidenceService = {
  async list(applicantId: string): Promise<ApplicationEvidence[]> {
    const { data,error } = await client().from('tailor_application_evidence').select('id,applicant_id,image_path').eq('applicant_id',applicantId).order('id')
    if (error) throw new Error('Unable to load private work photos. Check your connection and application access.')
    return data as ApplicationEvidence[]
  },
  async preview(path: string): Promise<string> {
    const { data,error } = await client().storage.from(EVIDENCE_BUCKET).createSignedUrl(path,EVIDENCE_PREVIEW_SECONDS)
    if (error) throw new Error('Private preview unavailable. Refresh the preview or reload your application access.')
    return data.signedUrl
  },
  async attach(path: string, version: number): Promise<ApplicationEvidence> {
    const { data,error } = await client().rpc('add_application_evidence',{ p_path: path,p_expected_version: version })
    if (error) throw new Error(error.message)
    return data as ApplicationEvidence
  },
  async detach(id: string, version: number): Promise<string> {
    const { data,error } = await client().rpc('remove_application_evidence',{ p_id: id,p_expected_version: version })
    if (error) throw new Error(error.message)
    return data as string
  },
  async deleteUnused(path: string, userId: string) {
    if (!isOwnEvidencePath(path,userId)) throw new Error('Cannot clean a file outside your private work-photo folder.')
    const { error } = await client().storage.from(EVIDENCE_BUCKET).remove([path])
    if (error) throw new Error('Unused file cleanup could not finish. Try Clean Unused Work Photos after one hour.')
  },
  async cleanup(userId: string): Promise<number> {
    const { data,error } = await client().rpc('unused_application_evidence_uploads')
    if (error) throw new Error('Unable to check unused work photos. Please try again.')
    const paths = data as { path: string }[]
    for (const { path } of paths) await evidenceService.deleteUnused(path,userId)
    return paths.length
  },
}
const transfer = (path: string, file: File, progress: (value: number) => void) => transferStorageImage(EVIDENCE_BUCKET,path,file,progress,isOwnEvidencePath)
export async function uploadApplicationEvidence({ file,userId,version,progress,send = transfer,attach = evidenceService.attach,cleanup = evidenceService.deleteUnused }: {
  file: File; userId: string; version: number; progress: (value: number) => void
  send?: typeof transfer; attach?: typeof evidenceService.attach; cleanup?: typeof evidenceService.deleteUnused
}): Promise<ApplicationEvidence> {
  await validateShopImage(file)
  const path = `${userId}/work/${crypto.randomUUID()}.${shopImageExtensions[file.type]}`
  progress(0)
  try {
    await send(path,file,progress)
    return await attach(path,version)
  } catch (cause) {
    let cleanupFailed = false
    try { await cleanup(path,userId) } catch { cleanupFailed = true }
    const message = cause instanceof Error ? cause.message : 'The work photo could not be saved.'
    throw new Error(`${message} Reload to check the saved state.${cleanupFailed ? ' Use Clean Unused Work Photos after one hour for any orphaned upload.' : ''}`,{ cause })
  }
}
