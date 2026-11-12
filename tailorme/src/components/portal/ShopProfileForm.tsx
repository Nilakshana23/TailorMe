import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Shop, ShopFields } from '../../services/shopService'
import { shopFields, validateShop } from '../../utils/shopValidation'
import FormButton from '../ui/FormButton'
import FormInput from '../ui/FormInput'

export default function ShopProfileForm({ shop, pending, onSave }: { shop: Shop; pending: boolean; onSave: (fields: ShopFields, publish: boolean) => Promise<void> }) {
  const [fields, setFields] = useState(() => shopFields(shop))
  const [errors, setErrors] = useState<Partial<Record<keyof ShopFields, string>>>({})
  function change(field: keyof ShopFields, value: string | boolean) {
    setFields((current) => ({ ...current, [field]: field === 'years_experience' ? value === '' ? null : Number(value) : value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  function save(publish: boolean, form: HTMLFormElement) {
    if (pending) return
    const nextErrors = validateShop(fields, publish)
    setErrors(nextErrors)
    const first = Object.keys(nextErrors)[0]
    if (first) { (form.elements.namedItem(first) as HTMLElement | null)?.focus(); return }
    void onSave(fields, publish)
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save(shop.is_published, event.currentTarget) }
  return <form noValidate onSubmit={submit} aria-busy={pending}>
    <p className="mb-8 text-on-surface-variant">These are public business details. Publishing shares your business address and phone with visitors. Cover and portfolio photos are optional. Your approved application stays unchanged, and private application photos are never copied here.</p>
    <fieldset disabled={pending} className="space-y-8">
      <div className="shop-form-grid">{([
        ['shop_name','Shop Name',160,'text'], ['city','City',120,'text'],
        ['public_address','Public Business Address',500,'text'], ['business_phone','Business Phone',32,'tel'],
      ] as const).map(([field,label,max,type]) => <FormInput key={field} id={field} name={field} label={label} maxLength={max} type={type} value={fields[field]} onChange={(event) => change(field,event.target.value)} error={errors[field]} />)}</div>
      <div><label htmlFor="description" className="block text-label-md mb-3">Shop Description</label><textarea className="shop-textarea" id="description" name="description" maxLength={4000} rows={5} value={fields.description} onChange={(event) => change('description',event.target.value)} aria-invalid={!!errors.description} aria-describedby="shop-description-error" /><p id="shop-description-error" className="text-error text-sm mt-2">{errors.description}</p></div>
      <FormInput id="specialties" name="specialties" label="Specialties" placeholder="For example: bridal, suits, alterations" maxLength={500} value={fields.specialties} onChange={(event) => change('specialties',event.target.value)} error={errors.specialties} />
      <FormInput id="years_experience" name="years_experience" label="Years of Experience" type="number" min={0} max={80} step={1} value={fields.years_experience ?? ''} onChange={(event) => change('years_experience',event.target.value)} error={errors.years_experience} />
      <label className="flex items-center gap-3"><input type="checkbox" checked={fields.accepting_requests} onChange={(event) => change('accepting_requests',event.target.checked)} />Available for new requests</label>
      <p className="text-sm text-on-surface-variant">This shows your availability. Order requests are not implemented yet.</p>
      <div className="shop-form-grid"><FormButton type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Changes'}</FormButton><FormButton type="button" variant="secondary" disabled={pending} onClick={(event) => { if (event.currentTarget.form) save(!shop.is_published,event.currentTarget.form) }}>{shop.is_published ? 'Unpublish Shop' : 'Publish Shop'}</FormButton></div>
    </fieldset>
  </form>
}
