import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/authContext'
import type { TailorApplication } from '../../services/applicationService'
import { qualificationService, uploadApplicationQualification } from '../../services/qualificationService'
import type { ApplicationQualification } from '../../services/qualificationService'
import { authError } from '../../services/authService'
import { canEditApplication } from '../../utils/applicationValidation'
import FormButton from '../ui/FormButton'

export function CertificatePreview({ record }: { record: ApplicationQualification }) {
  const { session } = useAuth()
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; url: string; error: string } | null>(null)
  const key = `${session?.user.id}:${record.file_path}:${attempt}`
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    qualificationService.preview(record.file_path).then((url) => {
      if (active) { setResult({ key,url,error: '' }); timer = setTimeout(() => setAttempt((value) => value+1),90000) }
    }).catch((cause: unknown) => { if (active) setResult({ key,url: '',error: authError(cause) }) })
    return () => { active = false; clearTimeout(timer) }
  },[key,record.file_path])
  const current = result?.key === key ? result : null
  return <div className="mt-3">{!current ? <p role="status">Loading private certificate...</p> : current.url ? <>
    <a className="underline block py-3" href={current.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open certificate for {record.course_name} (new tab)</a>
    {!record.file_path.endsWith('.pdf') && <img src={current.url} alt={`Certificate for ${record.course_name}`} referrerPolicy="no-referrer" onError={() => setResult({ key,url: '',error: 'Preview expired or unavailable. Refresh to try again.' })} />}
  </> : <p role="alert">{current.error}</p>}<FormButton variant="secondary" className="w-full mt-3" onClick={() => setAttempt((value) => value+1)}>Refresh certificate preview</FormButton></div>
}

export default function ApplicationQualifications({ application,applicantId,review = false,disabled = false,onBusy,onCount }: {
  application: TailorApplication | null; applicantId: string; review?: boolean; disabled?: boolean
  onBusy?: (busy: boolean) => void; onCount?: (count: number | null) => void
}) {
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; records: ApplicationQualification[]; error: string } | null>(null)
  const [details,setDetails] = useState({ course_name: '', institute: '', qualification_level: '' })
  const [file,setFile] = useState<File | null>(null)
  const [pending,setPending] = useState(false)
  const [progress,setProgress] = useState<number | null>(null)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const busy = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const callback = useRef(onCount)
  useEffect(() => { callback.current = onCount },[onCount])
  const key = `${applicantId}:${application?.version ?? 'new'}:${attempt}`
  useEffect(() => {
    let active = true
    const request = application ? qualificationService.list(applicantId) : Promise.resolve([])
    request.then((records) => { if (active) { setResult({ key,records,error: '' }); callback.current?.(records.length) } })
      .catch((cause: unknown) => { if (active) { setResult({ key,records: [],error: authError(cause) }); callback.current?.(null) } })
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
  return <section className="application-evidence mt-8" aria-label="Tailoring qualifications" aria-busy={pending}>
    <h3 className="font-display-lg text-headline-sm">Tailoring qualifications (optional)</h3>
    <p className="mt-4">You can apply without certificates. Add up to 3 qualifications if you wish. Certificates support application review and are not automatically authenticated.</p>
    <p className="mt-3 text-sm">Only the applicant and admins can access certificates. They are never shown on your public shop. JPEG, PNG, WebP or PDF, maximum 5 MB per certificate.</p>
    {!current ? <p role="status">Loading qualifications...</p> : current.error ? <p role="alert">{current.error}</p> : <>
      <p className="mt-4">{current.records.length} of 3 qualifications attached</p>
      <div className="application-evidence-grid mt-6">{current.records.map((record) => <article key={record.id}>
        <h4 className="font-semibold break-words">{record.course_name}</h4><p className="break-words">{record.institute}</p>{record.qualification_level && <p className="break-words">Qualification/NVQ level: {record.qualification_level}</p>}
        <CertificatePreview record={record} />
        {editable && <FormButton variant="secondary" className="w-full mt-3" disabled={pending || disabled} aria-label={`Remove qualification ${record.course_name}`} onClick={() => { void action(async () => {
          const path = await qualificationService.detach(record.id,application!.version)
          const records = current.records.filter((item) => item.id !== record.id); setResult({ key,records,error: '' }); callback.current?.(records.length)
          try { await qualificationService.deleteUnused(path,applicantId); setMessage('Qualification removed.') }
          catch { setMessage('Qualification removed. File cleanup could not finish; use Clean Unused Certificates after one hour.') }
        }) }}>Remove qualification</FormButton>}
      </article>)}</div>
      {editable && current.records.length < 3 && <fieldset disabled={pending || disabled} className="mt-6 space-y-4">
        <legend className="font-semibold">Add a qualification</legend>
        {([['course_name','Course/certificate name',200],['institute','Issuing institute',200],['qualification_level','Qualification/NVQ level (optional)',100]] as const).map(([name,label,max]) => <div key={name}><label htmlFor={`qualification-${name}`} className="block mb-2">{label}</label><input id={`qualification-${name}`} className="application-textarea qualification-input" maxLength={max} value={details[name]} onChange={(event) => setDetails({ ...details,[name]: event.target.value })} /></div>)}
        <input ref={input} className="sr-only" tabIndex={-1} type="file" aria-label="Choose certificate file" aria-describedby="certificate-help" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
        <FormButton variant="secondary" className="w-full" aria-describedby="certificate-help" onClick={() => input.current?.click()}>Choose certificate file</FormButton>
        <p id="certificate-help" className="text-sm break-words">JPEG, PNG, WebP or PDF, maximum 5 MB. {file ? file.name : 'One file per qualification.'}</p>
        {file && <FormButton variant="secondary" className="w-full" onClick={() => setFile(null)}>Remove selected file</FormButton>}
        <FormButton onClick={() => { void action(async () => {
          if (!file) throw new Error('Choose one certificate file before adding this qualification.')
          const record = await uploadApplicationQualification({ file,details,userId: applicantId,version: application!.version,progress: setProgress })
          const records = [...current.records,record]; setResult({ key,records,error: '' }); callback.current?.(records.length)
          setDetails({ course_name: '', institute: '', qualification_level: '' }); setFile(null); setMessage('Qualification uploaded and attached.')
        }) }}>Add qualification</FormButton>
        <p className="text-sm">Details are checked only when you add a qualification. To replace a qualification, remove it and add the updated record.</p>
      </fieldset>}
      {!review && application && !editable && <p className="mt-4">Qualifications are locked while pending or approved.</p>}
    </>}
    <FormButton variant="secondary" className="mt-5 px-5" disabled={pending || disabled} onClick={reload}>Reload qualifications</FormButton>
    {!review && <FormButton variant="secondary" className="mt-5 px-5" disabled={pending || disabled} onClick={() => { void action(async () => { const count = await qualificationService.cleanup(applicantId); setMessage(`Cleanup checked ${count} unreferenced certificate uploads older than one hour. Attached files are protected.`) }) }}>Clean Unused Certificates</FormButton>}
    {progress !== null && <div className="mt-5"><label htmlFor="certificate-progress">{progress === 100 ? 'Upload complete. Saving qualification...' : `Uploading certificate: ${progress}%`}</label><progress id="certificate-progress" max={100} value={progress} className="w-full">{progress}%</progress></div>}
    <p role="status" aria-live="polite" className="mt-4">{message || (pending && progress === null ? 'Updating qualifications...' : '')}</p><p role="alert" className="text-error mt-4">{error}</p>
  </section>
}
