import { useEffect, useRef, useState } from 'react'
import type { ApplicationFields, TailorApplication } from '../../services/applicationService'
import { createApplicationSaveFlow, emptyAttachments, loadApplicationAttachments, isBlankQualification } from '../../services/applicationSaveFlow'
import type { AttachmentSnapshot, SelectedAttachment } from '../../services/applicationSaveFlow'
import { evidenceService } from '../../services/evidenceService'
import { qualificationService } from '../../services/qualificationService'
import type { QualificationDetails } from '../../services/qualificationService'
import { authError } from '../../services/authService'
import ApplicationForm from './ApplicationForm'
import { WorkPhotoPreview } from './ApplicationEvidence'
import { CertificatePreview } from './ApplicationQualifications'
import FormButton from '../ui/FormButton'

type QualificationSelection = { id: string; details: QualificationDetails; file: File | null; path?: string }
const blankQualification = (): QualificationSelection => ({ id: crypto.randomUUID(),details: { course_name: '',institute: '',qualification_level: '' },file: null })
export function LocalAttachmentPreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null)
  const link = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    if (link.current) link.current.href = url
    return () => URL.revokeObjectURL(url)
  },[file])
  return <figure><figcaption className="break-words text-sm mb-3">{file.name} — selected, not yet saved</figcaption>{['image/jpeg','image/png','image/webp'].includes(file.type) && <img ref={image} alt={`Selected attachment: ${file.name}`} className="application-local-preview" />}<a ref={link} target="_blank" rel="noopener noreferrer" className="underline inline-block py-3">Open selected file (new tab)</a></figure>
}
function FileControl({ id,label,accept,disabled,multiple = false,onFiles }: { id: string; label: string; accept: string; disabled: boolean; multiple?: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="mt-4"><input ref={input} id={id} className="sr-only" tabIndex={-1} type="file" accept={accept} disabled={disabled} multiple={multiple} aria-label={label} aria-describedby={`${id}-help`} onChange={(event) => { onFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} /><FormButton variant="secondary" className="w-full" disabled={disabled} aria-describedby={`${id}-help`} onClick={() => input.current?.click()}>{label}</FormButton><p id={`${id}-help`} className="text-sm mt-2">{accept.includes('pdf') ? 'JPEG, PNG, WebP or PDF' : 'JPEG, PNG or WebP'} · Maximum 5 MB per file</p></div>
}

export default function ApplicationWorkspace({ application,applicantId,onApplication,onBusy }: {
  application: TailorApplication | null; applicantId: string; onApplication: (application: TailorApplication) => void; onBusy: (busy: boolean) => void
}) {
  const [snapshot,setSnapshot] = useState<AttachmentSnapshot | null>(() => application ? null : emptyAttachments)
  const [photos,setPhotos] = useState<SelectedAttachment[]>([])
  const [qualifications,setQualifications] = useState<QualificationSelection[]>(() => [blankQualification()])
  const [pending,setPending] = useState(false)
  const [status,setStatus] = useState('')
  const [progress,setProgress] = useState<number | undefined>()
  const [error,setError] = useState('')
  const [attempt,setAttempt] = useState(0)
  const busy = useRef(false)
  const flow = useRef<ReturnType<typeof createApplicationSaveFlow> | null>(null)
  if (flow.current == null) flow.current = createApplicationSaveFlow(applicantId,application)
  // Initial/retry reads never remount the form or discard local selections.
  const initialApplication = useRef(application)
  useEffect(() => {
    let active = true
    const request = initialApplication.current ? loadApplicationAttachments(applicantId) : Promise.resolve(emptyAttachments)
    request.then((value) => { if (active) { setSnapshot(value); setError('') } }).catch((cause: unknown) => { if (active) setError(authError(cause)) })
    return () => { active = false }
  },[applicantId,attempt])
  async function action(work: () => Promise<void>) {
    if (busy.current) return
    busy.current = true; setPending(true); onBusy(true); setError(''); setProgress(undefined)
    try { await work() } catch (cause) { setError(authError(cause)); setStatus('Changes are kept here. Retry when ready.'); setProgress(undefined) }
    finally { busy.current = false; setPending(false); onBusy(false) }
  }
  async function save(fields: ApplicationFields, submit: boolean) {
    await action(async () => {
      if (!snapshot) throw new Error('Wait for saved attachments to load, or retry loading them below.')
      const activeQualifications = qualifications.filter((row) => !isBlankQualification(row))
      for (const row of activeQualifications) if (!row.file) throw new Error('Choose a certificate file for each qualification you started, or remove that qualification.')
      const certificateJobs: SelectedAttachment[] = activeQualifications.map((row) => ({ ...row,kind: 'certificate',file: row.file! }))
      const saved = await flow.current!.run({ fields,submit,jobs: [...photos,...certificateJobs],onApplication,onSnapshot: setSnapshot,
        onPath: (id,path) => setQualifications((current) => current.map((row) => row.id === id ? { ...row,path } : row)),
        onStatus: (text,value) => { setStatus(text); setProgress(value) },
        onAttached: (id) => { setPhotos((current) => current.filter((item) => item.id !== id)); setQualifications((current) => { const rows = current.filter((item) => item.id !== id); return rows.length ? rows : [blankQualification()] }) },
      })
      setProgress(undefined)
      setStatus(saved.status === 'pending' ? 'Application submitted. Your details and attachments are locked during review.' : 'Draft and selected attachments saved. You can return and finish later.')
    })
  }
  const savedPhotos = snapshot?.photos ?? []
  const savedQualifications = snapshot?.qualifications ?? []
  const photoCount = savedPhotos.length + photos.length
  const qualificationCount = savedQualifications.length + qualifications.filter((row) => !isBlankQualification(row)).length
  async function removeSaved(kind: 'work' | 'certificate', id: string) {
    await action(async () => {
      setStatus('Removing attachment...')
      const service = kind === 'work' ? evidenceService : qualificationService
      const path = await service.detach(id,application!.version)
      setSnapshot((current) => current ? kind === 'work' ? { ...current,photos: current.photos.filter((item) => item.id !== id) } : { ...current,qualifications: current.qualifications.filter((item) => item.id !== id) } : current)
      try { await service.deleteUnused(path,applicantId); setStatus('Attachment removed.') }
      catch { setStatus('Attachment removed from the application. Unused file cleanup is available below after one hour.') }
    })
  }
  const attachments = <>
    <section className="application-evidence" aria-label="Private application work photos">
      <h3 className="font-display-lg text-headline-sm">Private Photos of Your Work</h3>
      <p className="mt-4">Select 1–3 photos of garments or work you have made. Ordinary phone photos are fine. Drafts may have none. Photos support review; they do not prove skill or identity. There are no video calls.</p>
      <p className="text-sm mt-3">Only you and admins can access these photos. Do not include customer references or body photos. Files upload when you Save Draft or Submit.</p>
      <p className="mt-3">{photoCount} of 3 work photos saved or selected</p>
      <div className="application-evidence-grid mt-4">{savedPhotos.map((photo,index) => <article key={photo.id}><WorkPhotoPreview photo={photo} number={index+1} /><FormButton variant="secondary" className="w-full mt-3" disabled={pending} onClick={() => { void removeSaved('work',photo.id) }}>Remove saved work photo {index+1}</FormButton></article>)}{photos.map((photo) => <article key={photo.id}><LocalAttachmentPreview file={photo.file} /><FormButton variant="secondary" className="w-full mt-3" disabled={pending} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}>Remove selected work photo</FormButton></article>)}</div>
      <FileControl id="selected-work-photos" label="Add work photos" accept="image/jpeg,image/png,image/webp" multiple disabled={pending || photoCount >= 3} onFiles={(files) => {
        if (files.length + photoCount > 3) { setError('Select no more than 3 work photos in total.'); return }
        setPhotos((current) => [...current,...files.map((file): SelectedAttachment => ({ id: crypto.randomUUID(),kind: 'work',file }))]); setError('')
      }} />
    </section>
    <section className="application-evidence" aria-label="Tailoring qualifications">
      <h3 className="font-display-lg text-headline-sm">Tailoring qualifications (optional)</h3>
      <p className="mt-4">You can apply without certificates. Certificates support application review and are not automatically authenticated. Only you and admins can access them.</p>
      <p className="mt-3">Up to 3 qualifications. Blank qualification forms are ignored. Files upload when you Save Draft or Submit.</p>
      <div className="application-evidence-grid mt-4">{savedQualifications.map((record) => <article key={record.id}><h4 className="font-semibold break-words">{record.course_name}</h4><p className="break-words">{record.institute}</p>{record.qualification_level && <p className="break-words">Qualification/NVQ level: {record.qualification_level}</p>}<CertificatePreview record={record} /><FormButton variant="secondary" className="w-full mt-3" disabled={pending} onClick={() => { void removeSaved('certificate',record.id) }}>Remove saved qualification</FormButton></article>)}</div>
      {qualifications.map((row,index) => savedQualifications.length >= 3 ? null : <div key={row.id}><fieldset disabled={pending || !!row.path} className="mt-5 space-y-4"><legend className="font-semibold">Qualification {index+1} (optional)</legend>
        {([['course_name','Course/certificate name',200],['institute','Issuing institute',200],['qualification_level','Qualification/NVQ level (optional)',100]] as const).map(([name,label,max]) => <div key={name}><label htmlFor={`${row.id}-${name}`} className="block mb-2">{label}</label><input id={`${row.id}-${name}`} className="application-textarea qualification-input" value={row.details[name]} maxLength={max} onChange={(event) => setQualifications((current) => current.map((item) => item.id === row.id ? { ...item,details: { ...item.details,[name]: event.target.value } } : item))} /></div>)}
        <FileControl id={`certificate-${row.id}`} label="Choose certificate file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={pending || !!row.path} onFiles={(files) => setQualifications((current) => current.map((item) => item.id === row.id ? { ...item,file: files[0] ?? item.file } : item))} />
        {row.file && <LocalAttachmentPreview file={row.file} />}
        </fieldset>{row.path && <p className="text-sm mt-3">This upload has started. Retry saving to confirm it before editing. Removing this selection does not delete any saved attachment.</p>}<FormButton variant="secondary" className="w-full mt-3" disabled={pending} onClick={() => setQualifications((current) => { const rows = current.filter((item) => item.id !== row.id); return rows.length ? rows : [blankQualification()] })}>Remove qualification selection</FormButton></div>)}
      {savedQualifications.length + qualifications.length < 3 && <FormButton variant="secondary" className="mt-5 w-full" disabled={pending || qualificationCount >= 3} onClick={() => setQualifications((current) => [...current,blankQualification()])}>Add another qualification</FormButton>}
    </section>
    {!snapshot && <div><p role="status">Loading saved attachments...</p><FormButton variant="secondary" className="w-full" disabled={pending} onClick={() => setAttempt((value) => value+1)}>Retry loading attachments</FormButton></div>}
  </>
  return <div>
    <ApplicationForm application={application} pending={pending} onSave={save} attachments={attachments} />
    <FormButton variant="secondary" className="mt-5 w-full" disabled={pending} onClick={() => { void action(async () => {
      const latest = await flow.current!.refresh()
      const attachments = latest ? await loadApplicationAttachments(applicantId) : emptyAttachments
      setSnapshot(attachments)
      const paths = new Set([...attachments.photos.map((item) => item.image_path),...attachments.qualifications.map((item) => item.file_path)])
      setPhotos((current) => current.filter((item) => !item.path || !paths.has(item.path)))
      setQualifications((current) => { const rows = current.filter((item) => !item.path || !paths.has(item.path)); return rows.length ? rows : [blankQualification()] })
      if (latest) onApplication(latest)
      setStatus('Saved application refreshed. Your entered fields and remaining local selections are kept. Review before saving again.')
    }) }}>Refresh saved application</FormButton>
    <div className="mt-5 flex flex-wrap gap-4">{(['work','certificate'] as const).map((kind) => <FormButton key={kind} variant="secondary" className="px-5" disabled={pending} onClick={() => { void action(async () => { const count = await (kind === 'work' ? evidenceService : qualificationService).cleanup(applicantId); setStatus(`Cleanup checked ${count} of your unreferenced uploads older than one hour. Attached files are protected.`) }) }}>Clean Unused {kind === 'work' ? 'Work Photos' : 'Certificates'}</FormButton>)}</div>
    <p className="text-sm mt-4">Local selections stay in this page until saved. Keep this page open while retrying.</p>
    <p role="status" aria-live="polite" className="mt-4">{status}</p>
    {progress !== undefined && <progress aria-label="Attachment upload progress" max={100} value={progress} className="w-full">{progress}%</progress>}
    <p role="alert" className="text-error mt-4">{error}</p>
  </div>
}
