import type { ApplicationFields, TailorApplication } from './applicationService'
import { applicationService } from './applicationService'
import { EVIDENCE_BUCKET, evidenceService, isOwnEvidencePath } from './evidenceService'
import type { ApplicationEvidence } from './evidenceService'
import { CERTIFICATE_BUCKET, qualificationService, isOwnQualificationPath, validateCertificate, validateQualificationDetails } from './qualificationService'
import type { ApplicationQualification, QualificationDetails } from './qualificationService'
import { transferStorageImage } from './shopUploads'
import { validateShopImage, shopImageExtensions } from '../utils/shopValidation'
import { validateApplication, canEditApplication } from '../utils/applicationValidation'
import { supabase } from '../lib/supabase'

export function isBlankQualification(row: { details: QualificationDetails; file: File | null }) {
  return !row.file && !Object.values(row.details).some((value) => value.trim())
}

export type SelectedAttachment = { id: string; kind: 'work' | 'certificate'; file: File; details?: QualificationDetails; path?: string }
export type AttachmentSnapshot = { photos: ApplicationEvidence[]; qualifications: ApplicationQualification[] }
export const emptyAttachments: AttachmentSnapshot = { photos: [], qualifications: [] }
export async function loadApplicationAttachments(userId: string): Promise<AttachmentSnapshot> {
  const [photos,qualifications] = await Promise.all([evidenceService.list(userId),qualificationService.list(userId)])
  return { photos,qualifications }
}
const defaultTransport = {
  own: applicationService.own,
  save: applicationService.save,
  load: loadApplicationAttachments,
  attachPhoto: evidenceService.attach,
  attachQualification: qualificationService.attach,
  async exists(bucket: string, path: string) {
    if (!supabase) throw new Error('Authentication is unavailable.')
    const { data,error } = await supabase.storage.from(bucket).exists(path)
    if (error && !['400','404'].includes(String(error.status))) throw new Error('Unable to check the previous upload. Retry when your connection returns.')
    return data
  },
  transfer: transferStorageImage,
}
// Match the existing RPC's PostgreSQL btrim(text), which trims spaces only.
function sameFields(application: TailorApplication, fields: ApplicationFields) {
  return (Object.keys(validateFieldNames) as (keyof ApplicationFields)[]).every((key) => application[key] === (typeof fields[key] === 'string' ? fields[key].replace(/^ +| +$/g, '') : fields[key]))
}
const validateFieldNames = { shop_name: true,phone: true,city: true,address: true,description: true,specialties: true,years_experience: true }

// One coordinator per mounted applicant workspace. Paths/checkpoints live only in
// memory; no files or private URLs are persisted. Server RPCs remain authoritative.
export function createApplicationSaveFlow(userId: string, initial: TailorApplication | null, transport = defaultTransport) {
  let application = initial
  let busy = false
  let uncertain: { fields: ApplicationFields; submit: boolean; version: number | null } | null = null
  return {
    async refresh() {
      if (busy) throw new Error('A save is already in progress.')
      busy = true
      try {
        application = await transport.own(userId)
        uncertain = null
        return application
      } finally { busy = false }
    },
    async run({ fields,submit,jobs,onStatus,onApplication,onSnapshot,onAttached,onPath }: {
      fields: ApplicationFields; submit: boolean; jobs: SelectedAttachment[]
      onStatus: (text: string, progress?: number) => void
      onApplication: (application: TailorApplication) => void
      onSnapshot: (snapshot: AttachmentSnapshot) => void
      onAttached: (id: string) => void
      onPath: (id: string, path: string) => void
    }): Promise<TailorApplication> {
      if (busy) throw new Error('A save is already in progress.')
      busy = true
      let snapshot = emptyAttachments
      function reconcile() {
        onSnapshot(snapshot)
        for (const job of jobs) if (job.path && (snapshot.photos.some((record) => record.image_path === job.path) || snapshot.qualifications.some((record) => record.file_path === job.path))) onAttached(job.id)
      }
      function attached(job: SelectedAttachment) {
        return !!job.path && (snapshot.photos.some((record) => record.image_path === job.path) || snapshot.qualifications.some((record) => record.file_path === job.path))
      }
      async function save(submitting: boolean) {
        const version = application?.version ?? null
        uncertain = { fields: { ...fields },submit: submitting,version }
        application = await transport.save(fields,submitting,version)
        uncertain = null
        onApplication(application)
      }
      try {
        onStatus('Checking application and attachments...')
        if (uncertain) {
          const latest = await transport.own(userId)
          const expected = uncertain.version === null ? 1 : uncertain.version + 1
          if (latest && latest.version === expected && sameFields(latest,uncertain.fields) && latest.status === (uncertain.submit ? 'pending' : 'draft')) {
            application = latest; uncertain = null; onApplication(latest)
            if (latest.status === 'pending') return latest
          } else if ((latest?.version ?? null) === uncertain.version) uncertain = null
          else throw new Error('Application changed in another session. Review the saved application before continuing.')
        }
        if (application && !canEditApplication(application.status)) throw new Error('Pending and approved applications are locked.')
        if (Object.keys(validateApplication(fields,submit)).length) throw new Error('Check the application fields before saving.')
        snapshot = application ? await transport.load(userId) : emptyAttachments
        reconcile()
        const remaining = jobs.filter((job) => !attached(job))
        const photoCount = snapshot.photos.length + remaining.filter((job) => job.kind === 'work').length
        const qualificationCount = snapshot.qualifications.length + remaining.filter((job) => job.kind === 'certificate').length
        if (photoCount > 3 || (submit && photoCount < 1)) throw new Error('Select 1–3 private work photos before submitting. Drafts may have none.')
        if (qualificationCount > 3) throw new Error('Add no more than 3 qualifications.')
        for (const job of remaining) {
          if (job.kind === 'work') await validateShopImage(job.file)
          else { if (!job.details) throw new Error('Enter the qualification details.'); validateQualificationDetails(job.details); await validateCertificate(job.file) }
        }
        if (!application || application.status !== 'draft' || !sameFields(application,fields)) {
          onStatus('Saving your draft...')
          await save(false)
        }
        for (const [index,job] of remaining.entries()) {
          const certificate = job.kind === 'certificate'
          const bucket = certificate ? CERTIFICATE_BUCKET : EVIDENCE_BUCKET
          const owns = certificate ? isOwnQualificationPath : isOwnEvidencePath
          job.path ??= `${userId}/${certificate ? 'certificates' : 'work'}/${crypto.randomUUID()}.${job.file.type === 'application/pdf' ? 'pdf' : shopImageExtensions[job.file.type]}`
          onPath(job.id,job.path)
          const label = `${certificate ? 'certificate' : 'work photo'} ${index+1} of ${remaining.length}`
          onStatus(`Checking ${label}...`)
          if (!await transport.exists(bucket,job.path)) {
            onStatus(`Uploading ${label}...`,0)
            await transport.transfer(bucket,job.path,job.file,(progress) => onStatus(`Uploading ${label}...`,progress),owns)
          }
          onStatus(`Saving ${label}...`)
          if (certificate) snapshot = { ...snapshot,qualifications: [...snapshot.qualifications,await transport.attachQualification(job.path,application!.version,job.details!)] }
          else snapshot = { ...snapshot,photos: [...snapshot.photos,await transport.attachPhoto(job.path,application!.version)] }
          reconcile()
        }
        if (submit) { onStatus('Submitting your application...'); await save(true) }
        return application!
      } catch (cause) {
        // A transfer/attachment response may be lost after success. Reconcile by
        // the original path; never delete or generate a replacement on uncertainty.
        if (application && !uncertain) {
          try { snapshot = await transport.load(userId); reconcile() } catch { /* Retain queue and retry after connectivity returns. */ }
        }
        const message = cause instanceof Error ? cause.message : 'The application could not be saved.'
        throw new Error(`${message} Your entered details and remaining selected files are kept here. Retry Save Draft or Submit; confirmed attachments will not be uploaded again.`, { cause })
      } finally { busy = false }
    },
  }
}
