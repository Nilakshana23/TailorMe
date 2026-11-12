import { supabase, configurationError } from '../lib/supabase'
import { transferStorageImage } from './shopUploads'
import { validateShopImage, shopImageExtensions } from '../utils/shopValidation'

export const CERTIFICATE_BUCKET = 'tailor-application-certificates'
export const CERTIFICATE_PREVIEW_SECONDS = 120
export type QualificationDetails = { course_name: string; institute: string; qualification_level: string }
export type ApplicationQualification = QualificationDetails & { id: string; applicant_id: string; file_path: string }
export function isOwnQualificationPath(path: string, userId: string) {
  return path.split('/')[0] === userId && /^[0-9a-f-]{36}\/certificates\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(path)
}
function client() { if (!supabase) throw new Error(configurationError ?? 'Authentication is unavailable.'); return supabase }
export const qualificationService = {
  async list(applicantId: string): Promise<ApplicationQualification[]> {
    const { data,error } = await client().from('tailor_application_qualifications').select('id,applicant_id,file_path,course_name,institute,qualification_level').eq('applicant_id',applicantId).order('id')
    if (error) throw new Error('Unable to load private certificates. Check your connection and application access.')
    return data as ApplicationQualification[]
  },
  async preview(path: string): Promise<string> {
    const { data,error } = await client().storage.from(CERTIFICATE_BUCKET).createSignedUrl(path,CERTIFICATE_PREVIEW_SECONDS)
    if (error) throw new Error('Private preview unavailable. Refresh the preview or reload your application access.')
    return data.signedUrl
  },
  async attach(path: string, version: number, details: QualificationDetails): Promise<ApplicationQualification> {
    const { data,error } = await client().rpc('add_application_qualification',{ p_path: path,p_expected_version: version,p_course_name: details.course_name,p_institute: details.institute,p_level: details.qualification_level })
    if (error) throw new Error(error.message)
    return data as ApplicationQualification
  },
  async detach(id: string, version: number): Promise<string> {
    const { data,error } = await client().rpc('remove_application_qualification',{ p_id: id,p_expected_version: version })
    if (error) throw new Error(error.message)
    return data as string
  },
  async deleteUnused(path: string, userId: string) {
    if (!isOwnQualificationPath(path,userId)) throw new Error('Cannot clean a file outside your private certificate folder.')
    const { error } = await client().storage.from(CERTIFICATE_BUCKET).remove([path])
    if (error) throw new Error('Unused file cleanup could not finish. Try Clean Unused Certificates after one hour.')
  },
  async cleanup(userId: string): Promise<number> {
    const { data,error } = await client().rpc('unused_application_qualification_uploads')
    if (error) throw new Error('Unable to check unused certificates. Please try again.')
    const paths = data as { path: string }[]
    for (const { path } of paths) await qualificationService.deleteUnused(path,userId)
    return paths.length
  },
}
const transfer = (path: string, file: File, progress: (value: number) => void) => transferStorageImage(CERTIFICATE_BUCKET,path,file,progress,isOwnQualificationPath)
export async function uploadApplicationQualification({ file,userId,version,details,progress,send = transfer,attach = qualificationService.attach,cleanup = qualificationService.deleteUnused }: {
  file: File; userId: string; version: number; details: QualificationDetails; progress: (value: number) => void
  send?: typeof transfer; attach?: typeof qualificationService.attach; cleanup?: typeof qualificationService.deleteUnused
}): Promise<ApplicationQualification> {
  validateQualificationDetails(details)
  await validateCertificate(file)
  const path = `${userId}/certificates/${crypto.randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : shopImageExtensions[file.type]}`
  progress(0)
  try {
    await send(path,file,progress)
    return await attach(path,version,details)
  } catch (cause) {
    let cleanupFailed = false
    try { await cleanup(path,userId) } catch { cleanupFailed = true }
    const message = cause instanceof Error ? cause.message : 'The certificate could not be saved.'
    throw new Error(`${message} Reload to check the saved state.${cleanupFailed ? ' Use Clean Unused Certificates after one hour for any orphaned upload.' : ''}`,{ cause })
  }
}

export function validateQualificationDetails(details: QualificationDetails) {
  if (!details.course_name.trim() || details.course_name.trim().length > 200) throw new Error('Enter a course/certificate name (up to 200 characters).')
  if (!details.institute.trim() || details.institute.trim().length > 200) throw new Error('Enter an issuing institute (up to 200 characters).')
  if (details.qualification_level.length > 100) throw new Error('Keep the qualification/NVQ level under 101 characters.')
}
export async function validateCertificate(file: File) {
  if (file.type !== 'application/pdf') return validateShopImage(file)
  if (file.size <= 0 || file.size > 5242880) throw new Error('Choose a certificate larger than 0 bytes and no larger than 5 MB.')
  const header = new Uint8Array(await file.slice(0,5).arrayBuffer())
  if (String.fromCharCode(...header) !== '%PDF-') throw new Error('The file is not a PDF. Export your certificate as PDF and try again.')
}
