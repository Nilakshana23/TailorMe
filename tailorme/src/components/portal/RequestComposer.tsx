import {RequestReferenceEditor,FrozenRequestReferences} from './RequestReferences'
import type {ReferenceSelection} from '../../services/requestReferenceService'
import SketchReference from './SketchReference'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {measurementService} from '../../services/measurementService'
import type {MeasurementProfile,MeasurementShare} from '../../services/measurementService'
import MeasurementValues from './MeasurementValues'
import DesignIllustration from './DesignIllustration'
import { designService } from '../../services/designService'
import type { CustomerDesign } from '../../services/designService'
import { usePortal } from '../../auth/portalContext'
import { requestService, validateRequest, requestDefinitelyRejected } from '../../services/requestService'
import type { RequestFields } from '../../services/requestService'
import { authError } from '../../services/authService'
import FormInput from '../ui/FormInput'
import FormButton from '../ui/FormButton'
import '../../pages/Applications.css'

export default function RequestComposer({ tailorId,available,designId:providedDesignId = null }: { tailorId: string; available: boolean; designId?: string|null }) {
  const { role,status,profile } = usePortal()
  const designId=role==='customer'?providedDesignId:null
  const outgoingBase=role==='tailor'?'/tailor/orders':'/customer/requests'
  const navigate = useNavigate()
  const [fields,setFields] = useState<RequestFields>({ garment_type: '',description: '',quantity: 1,preferred_date: '' })
  const [pending,setPending] = useState(false)
  const [locked,setLocked] = useState(false)
  const [error,setError] = useState('')
  const attempt = useRef<{ id: string; fields: RequestFields;design?:{id:string;version:number};measurements?:MeasurementShare;references?:ReferenceSelection } | null>(null)
  const [selected,setSelected] = useState<{id:string;design:CustomerDesign|null;error:string}|null>(null)
  const [measurementProfile,setMeasurementProfile]=useState<MeasurementProfile|null>(null)
  const [measurementState,setMeasurementState]=useState<'loading'|'ready'|'error'>('loading')
  const [measurementAttempt,setMeasurementAttempt]=useState(0)
  const [share,setShare]=useState(false)
  const [references,setReferences]=useState<ReferenceSelection|null>(null)
  const [referenceBusy,setReferenceBusy]=useState(false)
  const [frozenReferences,setFrozenReferences]=useState<ReferenceSelection|null>(null)
  useEffect(()=>{let active=true;if(role==='customer')void measurementService.get().then(p=>{if(active){setMeasurementProfile(p);setMeasurementState('ready');setShare(false)}}).catch(()=>{if(active)setMeasurementState('error')});return()=>{active=false}},[role,measurementAttempt])
  const busy = useRef(false)
  useEffect(()=>{let active=true;if(designId&&role==='customer')void designService.get(designId).then(design=>{if(!active)return;setSelected({id:designId,design,error:design?'':'Selected design is unavailable. Reopen your designer.'});if(design)setFields(current=>({...current,garment_type:design.design_kind==='sketch'?design.sketch_category??'':design.garment_type}))}).catch(()=>{if(active)setSelected({id:designId,design:null,error:'Unable to load selected design. Reopen your designer before submitting.'})});return()=>{active=false}},[designId,role])
  const selectedDesign=selected?.id===designId ? selected : null
  const designReady=!designId || !!selectedDesign?.design
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || referenceBusy || !designReady || status!=='ready' || !['customer','tailor'].includes(role??'') || profile?.id===tailorId) return
    const message = validateRequest(fields)
    if (message && !attempt.current) { setError(message); return }
    busy.current = true; setPending(true); setError(''); setLocked(true)
    attempt.current ??= { id: crypto.randomUUID(),fields: { ...fields },design: selectedDesign?.design ? {id:selectedDesign.design.id,version:selectedDesign.design.version} : undefined,measurements: role==='customer' && share && measurementProfile ? {values_cm:{...measurementProfile.values_cm},measured_on:measurementProfile.measured_on} : undefined,references: references?.items.length ? structuredClone(references) : undefined }
    const submission = attempt.current
    setFrozenReferences(submission.references??null)
    try {
      const request = await requestService.send(submission.id,tailorId,submission.fields,submission.design,submission.measurements,submission.references)
      navigate(`${outgoingBase}/${request.id}`,{ replace: true,state: { sent: true } })
    } catch (cause) {
      // Resolve an ambiguous response before allowing a different submission.
      try {
        const saved = await requestService.get(submission.id)
        if (saved) { navigate(`${outgoingBase}/${saved.id}`,{ replace: true,state: { sent: true } }); return }
        // A missing row does not prove a timed-out transaction cannot still commit.
        // Unlock only after an explicit PostgreSQL rejection (rolled-back RPC).
        if (requestDefinitelyRejected(cause)) { attempt.current = null; setLocked(false) }
      } catch { /* Keep original ID/fields for a safe retry. */ }
      setError(`${authError(cause)} Retry to check and send this same inquiry safely.`)
    } finally { busy.current = false; setPending(false) }
  }
  if (status === 'loading') return <p role="status" className="mt-6">Loading request access...</p>
  if (status!=='ready'||(role !== 'customer'&&role!=='tailor')) return <p className="mt-6">Request access is unavailable for this account.</p>
  if(profile?.id===tailorId)return <p className="mt-6">This is your shop. <Link to="/tailor/profile" className="underline">Manage Shop Profile</Link> to view or edit it. Choose another tailor to send a request.</p>
  if (!available) return <p className="mt-6">This shop is not accepting new requests.</p>
  return <section className="portal-card mt-10" aria-label="Send tailoring request"><h2 className="font-display-lg text-headline-sm">Send tailoring request</h2>
    <p className="mt-4">Your preferred completion date is subject to tailor confirmation. Acceptance means accepting an inquiry, not confirming a price, payment or guaranteed completion date.</p>
    {designId && (!selectedDesign ? <p role="status">Loading selected design...</p> : selectedDesign.error ? <p role="alert">{selectedDesign.error} <Link className="underline" to="/customer/designer">Open designer</Link></p> : selectedDesign.design && <div className="mt-5"><p className="font-semibold">Selected design: {selectedDesign.design.name}</p><p className="text-sm mt-2">Tailor will see this design. A fixed snapshot will be shared with this tailor when you submit.</p><DesignIllustration design={selectedDesign.design}/><SketchReference design={selectedDesign.design}/>{selectedDesign.design.source_reference&&!selectedDesign.design.include_source_reference&&<p>The linked original sketch is not included. Only the refined illustration above will be shared.</p>}<Link className="underline inline-block py-3" to={`/customer/designer/${selectedDesign.design.id}`}>Review or change this design</Link></div>)}
    <form className="mt-6 space-y-5" onSubmit={send} noValidate aria-busy={pending}>
      <fieldset disabled={pending || locked} className="space-y-5">
        <FormInput id="request-garment" label="Garment type" readOnly={!!designId&&(selectedDesign?.design?.design_kind!=='sketch'||!!selectedDesign?.design?.sketch_category)} required maxLength={100} value={fields.garment_type} onChange={(event) => setFields({ ...fields,garment_type: event.target.value })} />
        <div><label htmlFor="request-description" className="block mb-2">Description</label><textarea id="request-description" className="application-textarea" required minLength={10} maxLength={4000} value={fields.description} onChange={(event) => setFields({ ...fields,description: event.target.value })} /></div>
        <div className="application-form-grid"><FormInput id="request-quantity" label="Quantity" type="number" required min={1} max={100} step={1} value={fields.quantity} onChange={(event) => setFields({ ...fields,quantity: Number(event.target.value) })} /><FormInput id="request-date" label="Preferred completion date" type="date" required value={fields.preferred_date} onChange={(event) => setFields({ ...fields,preferred_date: event.target.value })} /></div>
        <div hidden={locked}><RequestReferenceEditor key={profile?.id} disabled={pending||locked} onChange={setReferences} onBusy={setReferenceBusy}/></div>{locked&&<FrozenRequestReferences selection={frozenReferences}/>}
        {role==='customer'&&<section aria-label="Optional measurement sharing" className="portal-card"><h3 className="font-semibold">Optional: share measurements with this selected tailor</h3>
        <p className="mt-3">Only the values listed below and their measured-on date will be shared. A fixed snapshot is saved with this request when you consent. Later profile edits or deletion will not change or remove that snapshot. Only you and this request's addressed tailor can view it.</p>
        {measurementState==='loading'?<p role="status">Loading personal measurements...</p>:measurementState==='error'?<><p role="alert">Unable to load measurements. You can still send without sharing.</p><button type="button" className="underline min-h-11" onClick={()=>{setMeasurementState('loading');setMeasurementAttempt(n=>n+1)}}>Retry loading measurements</button></>:measurementProfile&&Object.keys(measurementProfile.values_cm).length>0?<><MeasurementValues profile={measurementProfile}/><label className="flex gap-3 items-start mt-5"><input type="checkbox" className="mt-1" checked={share} onChange={e=>setShare(e.target.checked)}/>I explicitly agree to share these measurements with this selected tailor for this request.</label></>:<p className="mt-3">No saved measurements to share.</p>}
        <Link to="/customer/measurements" className="underline inline-block mt-3">Review or edit My Measurements</Link>
        <p className="mt-3 text-sm">{share?'The listed measurements will be shared.':'No measurements will be shared.'}</p></section>}
      </fieldset>
      <FormButton type="submit" disabled={pending || referenceBusy || !designReady}>{pending ? 'Sending inquiry...' : locked ? 'Retry sending this request' : 'Send tailoring request'}</FormButton>
      {locked && !pending && <p className="text-sm">Your original fields are kept until the result is confirmed, to prevent duplicate requests.</p>}
      <p role="alert" className="text-error">{error}</p><p role="status" aria-live="polite">{pending ? 'Saving your tailoring request...' : ''}</p>
    </form><Link to={outgoingBase} className="underline inline-block mt-5">{role==='tailor'?'My Orders':'My Requests'}</Link>
  </section>
}
