import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import type { TailorApplication } from '../../services/applicationService'
import { evidenceService, uploadApplicationEvidence } from '../../services/evidenceService'
import type { ApplicationEvidence as Evidence } from '../../services/evidenceService'
import { authError } from '../../services/authService'
import { canEditApplication } from '../../utils/applicationValidation'
import FormButton from '../ui/FormButton'

export function EvidenceSummary({ count, status }: { count: number; status?: TailorApplication['status'] }) {
  return <p className="mt-5 text-sm">{count ? `${count} of 3 work photos attached` : 'No evidence provided'}{!count && status && !canEditApplication(status) ? '. Existing applications can remain valid without evidence.' : ''}</p>
}

export function WorkPhotoPreview({ photo, number }: { photo: Evidence; number: number }) {
  const { session } = useAuth()
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; url: string; error: string } | null>(null)
  const key = `${session?.user.id}:${photo.image_path}:${attempt}`
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    evidenceService.preview(photo.image_path).then((url) => {
      if (!active) return
      // Short-lived URLs live only in component memory. Refresh before expiry;
      // every refresh rechecks Storage authorization and cleanup drops the timer.
      setResult({ key,url,error: '' }); timer = setTimeout(() => setAttempt((value) => value+1),90000)
    }).catch(() => { if (active) setResult({ key,url: '',error: 'Private preview unavailable. Try refreshing it.' }) })
    return () => { active = false; clearTimeout(timer) }
  },[key,photo.image_path])
  const current = result?.key === key ? result : null
  return <div>{!current ? <p role="status">Loading private work photo {number}…</p> : current.url ? <img src={current.url} alt={`Applicant's garment or work photo ${number}`} referrerPolicy="no-referrer" onError={() => setResult({ key,url: '',error: 'Preview expired or unavailable. Refresh to try again.' })} /> : <p role="alert">{current.error}</p>}<FormButton variant="secondary" className="w-full mt-3" onClick={() => setAttempt((value) => value+1)} aria-label={`Refresh private work photo ${number}`}>Refresh Preview</FormButton></div>
}

export default function ApplicationEvidence({ application, applicantId, review = false, disabled = false, onBusy, onCount }: {
  application: TailorApplication | null; applicantId: string; review?: boolean; disabled?: boolean
  onBusy?: (busy: boolean) => void; onCount?: (count: number | null) => void
}) {
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; photos: Evidence[]; error: string } | null>(null)
  const [pending,setPending] = useState(false)
  const [progress,setProgress] = useState<number | null>(null)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const busy = useRef(false)
  const callback = useRef(onCount)
  useEffect(() => { callback.current = onCount },[onCount])
  const key = `${applicantId}:${application?.version ?? 'new'}:${attempt}`
  useEffect(() => {
    let active = true
    const request = application ? evidenceService.list(applicantId) : Promise.resolve([])
    request.then((photos) => { if (active) { setResult({ key,photos,error: '' }); callback.current?.(photos.length) } })
      .catch((cause: unknown) => { if (active) { setResult({ key,photos: [],error: authError(cause) }); callback.current?.(null) } })
    return () => { active = false }
  },[key,applicantId,application])
  const current = result?.key === key ? result : null
  const editable = !review && !!application && canEditApplication(application.status)
  async function action(work: () => Promise<void>) {
    if (busy.current || disabled) return
    busy.current = true; setPending(true); onBusy?.(true); setError(''); setMessage(''); setProgress(null)
    try { await work() } catch (cause) { setError(authError(cause)) }
    finally { busy.current = false; setPending(false); onBusy?.(false); setProgress(null) }
  }
  function reload() { callback.current?.(null); setAttempt((value) => value+1) }
  return <section className="application-evidence mt-8" aria-label="Private application work photos">
    <h3 className="font-display-lg text-headline-sm">{review ? 'Private Applicant Work Photos' : 'Private Photos of Your Work'}</h3>
    <p className="mt-4 text-on-surface-variant">{review ? 'Private photos supplied for application review.' : 'Add 1–3 photos of garments or work you have made. Ordinary phone photos are fine. Drafts can be saved without photos.'} Photos support application review; they do not prove skill or identity. There are no video calls.</p>
    <p className="mt-3 text-sm text-on-surface-variant">Only the applicant and admins can access these private photos. They are never copied to the public shop or portfolio. JPEG, PNG, or WebP, up to 5 MB each. Do not include customer references or body photos.</p>
    {!current ? <p role="status" className="mt-6">Loading private work photos…</p> : current.error ? <div className="mt-6"><p role="alert">{current.error}</p><FormButton variant="secondary" className="mt-4 px-5" disabled={pending || disabled} onClick={reload}>Retry Work Photos</FormButton></div> : <>
      <EvidenceSummary count={current.photos.length} status={application?.status} />
      <div className="application-evidence-grid mt-6">{current.photos.map((photo,index) => <article key={photo.id}><WorkPhotoPreview photo={photo} number={index+1} />{editable && <FormButton variant="secondary" className="mt-3 w-full" disabled={pending || disabled} aria-label={`Remove private work photo ${index+1}`} onClick={() => { void action(async () => {
        const path = await evidenceService.detach(photo.id,application!.version)
        const photos = current.photos.filter((item) => item.id !== photo.id); setResult({ key,photos,error: '' }); callback.current?.(photos.length)
        try { await evidenceService.deleteUnused(path,applicantId); setMessage('Work photo removed.') }
        catch { setMessage('Photo detached. File cleanup could not finish; use Clean Unused Work Photos after one hour.') }
      }) }}>Remove Photo</FormButton>}</article>)}</div>
      {editable && <div className="mt-6"><label htmlFor="application-work-upload" className="block font-semibold mb-3">Add a Private Work Photo</label><input id="application-work-upload" type="file" accept="image/jpeg,image/png,image/webp" disabled={pending || disabled || current.photos.length >= 3} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void action(async () => {
        const photo = await uploadApplicationEvidence({ file,userId: applicantId,version: application!.version,progress: setProgress })
        const photos = [...current.photos,photo]; setResult({ key,photos,error: '' }); callback.current?.(photos.length); setMessage('Private work photo uploaded and attached.')
      }) }} /><p className="mt-3 text-sm">You can remove or replace photos while the application is a draft or rejected.</p></div>}
      {!review && !editable && application && <p className="mt-5">Work photos are locked while an application is pending or approved.</p>}
      <FormButton variant="secondary" className="mt-5 px-5" disabled={pending || disabled} onClick={reload}>Reload Work Photos</FormButton>
    </>}
    {!review && <div className="mt-6"><FormButton variant="secondary" className="px-5" disabled={pending || disabled} onClick={() => { void action(async () => { const count = await evidenceService.cleanup(applicantId); setMessage(`Cleanup checked ${count} unreferenced private uploads older than one hour. Attached photos are protected.`) }) }}>Clean Unused Work Photos</FormButton></div>}
    {progress !== null && <div className="mt-5"><label htmlFor="evidence-upload-progress">{progress === 100 ? 'Upload received; attaching private photo…' : `Uploading private photo: ${progress}%`}</label><progress id="evidence-upload-progress" max={100} value={progress} className="w-full">{progress}%</progress></div>}
    <p role="status" aria-live="polite" className="mt-4">{message || (pending && progress === null ? 'Updating private work photos…' : '')}</p><p role="alert" className="text-error mt-4">{error}</p>
  </section>
}
