import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { ApplicationFields, TailorApplication } from '../../services/applicationService'
import { applicationLimits, emptyApplication, validateApplication } from '../../utils/applicationValidation'
import type { ApplicationErrors } from '../../utils/applicationValidation'
import FormInput from '../ui/FormInput'
import FormButton from '../ui/FormButton'

export default function ApplicationForm({ application, pending, onSave, attachments }: {
  application: TailorApplication | null; pending: boolean; attachments?: ReactNode
  onSave: (fields: ApplicationFields, submit: boolean) => Promise<void>
}) {
  const [fields, setFields] = useState<ApplicationFields>(() => application ? { ...application } : { ...emptyApplication })
  const [errors, setErrors] = useState<ApplicationErrors>({})
  function change(field: keyof ApplicationFields, value: string) {
    setFields((current) => ({ ...current, [field]: field === 'years_experience' ? value === '' ? null : Number(value) : value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  function save(submit: boolean, form: HTMLFormElement) {
    if (pending) return
    const nextErrors = validateApplication(fields, submit)
    setErrors(nextErrors)
    const first = Object.keys(nextErrors)[0]
    if (first) { (form.elements.namedItem(first) as HTMLElement | null)?.focus(); return }
    void onSave(fields, submit)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save(true, event.currentTarget)
  }
  return <form noValidate onSubmit={submit} aria-busy={pending}>
    <p className="mb-8 text-on-surface-variant">Choose attachments while filling in this form. Save Draft or Submit saves your details and selected files together. Submission requires 1?3 private work photos; certificates are optional. Submitted details and attachments are locked during review.</p>
    <fieldset disabled={pending} className="space-y-8">
      <div className="application-form-grid">{([
        ['shop_name', 'Shop Name', 'text', 'organization'], ['phone', 'Phone', 'tel', 'tel'],
        ['city', 'City', 'text', 'address-level2'], ['address', 'Address', 'text', 'street-address'],
      ] as const).map(([field, label, type, autoComplete]) => <FormInput key={field} id={field} name={field} label={label} type={type} autoComplete={autoComplete} maxLength={applicationLimits[field]} value={fields[field]} onChange={(event) => change(field, event.target.value)} error={errors[field]} required />)}</div>
      <div><label className="text-label-md block mb-2" htmlFor="description">Description</label><textarea id="description" name="description" rows={5} maxLength={4000} value={fields.description} onChange={(event) => change('description', event.target.value)} required aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : 'description-help'} className="application-textarea" /><p id="description-help" className="text-sm mt-2 text-on-surface-variant">Tell us about your craft and business (20–4,000 characters).</p>{errors.description && <p id="description-error" className="text-error text-sm mt-2">{errors.description}</p>}</div>
      <FormInput id="specialties" name="specialties" label="Specialties" placeholder="For example: suits, bridal, alterations" maxLength={500} value={fields.specialties} onChange={(event) => change('specialties', event.target.value)} error={errors.specialties} required />
      <FormInput id="years_experience" name="years_experience" label="Years of Experience" type="number" min={0} max={80} step={1} value={fields.years_experience ?? ''} onChange={(event) => change('years_experience', event.target.value)} error={errors.years_experience} required />
      {attachments}
      <div className="application-form-grid"><FormButton type="button" variant="secondary" disabled={pending} onClick={(event) => { if (event.currentTarget.form) save(false, event.currentTarget.form) }}>{pending ? 'Saving…' : 'Save Draft'}</FormButton><FormButton type="submit" disabled={pending}>{pending ? 'Saving…' : application?.status === 'rejected' ? 'Resubmit Application' : 'Submit Application'}</FormButton></div>
    </fieldset>
  </form>
}
