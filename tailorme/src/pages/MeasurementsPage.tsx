import {useEffect,useRef,useState} from 'react'
import PortalLayout from '../components/portal/PortalLayout'
import {DashboardHeading} from '../components/portal/DashboardParts'
import FormInput from '../components/ui/FormInput'
import FormButton from '../components/ui/FormButton'
import {measurementService} from '../services/measurementService'
import type {MeasurementProfile} from '../services/measurementService'
import {measurementFields,canonicalMeasurement,displayMeasurement,validateMeasurements} from '../utils/measurements'
import type {Measurements,MeasurementUnit} from '../utils/measurements'
import {requestToday} from '../services/requestService'
import {authError} from '../services/authService'
import './Measurements.css'

const groups = [
 {title:'Upper body',keys:['shoulder_width','bust_chest','sleeve_length','upper_arm'],guidance:'Stand naturally with your shoulders relaxed. Measure shoulder width across your back, not around it. For chest and upper arm, wrap the tape all the way around and keep it level. Bend your elbow slightly when measuring a sleeve.'},
 {title:'Body measurements',keys:['waist','hip'],guidance:'Use a flexible tape over light clothing. Find your natural waist and the fullest part of your hips. Keep the tape parallel to the floor, snug without squeezing, and breathe normally.'},
 {title:'Garment lengths',keys:['top_length','dress_length','trouser_length','inseam'],guidance:'Choose where you want the garment to end. Measure top and dress lengths from the high shoulder beside your neck; measure trousers down the outside leg from the waist. Inseam follows the inside leg from crotch to hem. Ask someone to help keep the tape straight.'},
] as const

export default function MeasurementsPage(){
 const [profile,setProfile]=useState<MeasurementProfile|null>(null)
 const [values,setValues]=useState<Measurements>({})
 const [date,setDate]=useState(requestToday())
 const [unit,setUnit]=useState<MeasurementUnit>('cm')
 const [draft,setDraft]=useState<Record<string,string>>({})
 const [ready,setReady]=useState(false)
 const [loading,setLoading]=useState(true)
 const [pending,setPending]=useState(false)
 const [operation,setOperation]=useState<'save'|'delete'|null>(null)
 const [confirmDelete,setConfirmDelete]=useState(false)
 const [submitted,setSubmitted]=useState(false)
 const [error,setError]=useState('')
 const [message,setMessage]=useState('')
 const [attempt,setAttempt]=useState(0)
 const busy=useRef(false)

 useEffect(()=>{
  let active=true
  measurementService.get().then(p=>{
   if(active){setReady(true);setProfile(p);setValues(p?.values_cm??{});setDate(p?.measured_on??requestToday());setDraft({});setLoading(false);setError('')}
  }).catch(cause=>{if(active){setReady(false);setError(authError(cause));setLoading(false)}})
  return()=>{active=false}
 },[attempt])

 function switchUnit(next:MeasurementUnit){setUnit(next);setDraft({})}
 const dateError=submitted&&(!date||date>requestToday()||date<'1900-01-01')?'Choose a measured-on date from 1900 through today.':''

 async function save(){
  if(busy.current||!ready)return
  setSubmitted(true);setConfirmDelete(false);setMessage('')
  if(validateMeasurements(values)||!date||date>requestToday()||date<'1900-01-01'){
   setError('Please review the highlighted fields before saving.');return
  }
  busy.current=true;setPending(true);setOperation('save');setError('')
  try{
   const p=await measurementService.save(values,date)
   setProfile(p);setValues(p.values_cm);setDraft({});setMessage('Measurements saved. Your previously shared requests stay unchanged.')
  }catch(cause){setError(`${authError(cause)} Your entries are kept. Try Save measurements again.`)}
  finally{busy.current=false;setPending(false);setOperation(null)}
 }

 async function remove(){
  if(!profile||busy.current||!confirmDelete)return
  busy.current=true;setPending(true);setOperation('delete');setError('');setMessage('')
  try{
   await measurementService.remove(profile.owner_id)
   setProfile(null);setValues({});setDraft({});setDate(requestToday());setSubmitted(false);setConfirmDelete(false)
   setMessage('Personal profile deleted. Measurements already shared with requests remain unchanged.')
  }catch(cause){setError(`${authError(cause)} Try confirming deletion again.`)}
  finally{busy.current=false;setPending(false);setOperation(null)}
 }

 return <PortalLayout><section className="measurements-page" aria-label="My Measurements">
  <header className="measurements-heading">
   <DashboardHeading eyebrow="Personal fit" title="My Measurements" description="Keep your measurements in one place. Add what you know and leave the rest blank."/>
   <fieldset className="measurement-units" disabled={loading||pending||!ready}>
    <legend>Measurement units</legend>
    <div className="measurement-unit-options">{(['cm','in'] as const).map(value=><label key={value}>
     <input id={`measurement-unit-${value}`} type="radio" name="measurement-unit" value={value} checked={unit===value} onChange={()=>switchUnit(value)}/>
     <span>{value==='cm'?'cm':'inches'}</span>
    </label>)}</div>
   </fieldset>
  </header>
  <p className="measurements-privacy">Private to you unless you choose to share with a tailor in a request. Customer-provided; tailor confirmation recommended.</p>

  {loading?<div className="measurements-notice" role="status">Loading your measurements...</div>:!ready?<div className="measurements-notice measurements-error" role="alert">
   <h2>We couldn’t load your measurements</h2><p>{error}</p>
   <FormButton className="measurements-retry" onClick={()=>{setLoading(true);setError('');setAttempt(n=>n+1)}}>Retry loading measurements</FormButton>
  </div>:<>
   {!profile&&<div className="measurements-notice measurements-empty"><strong>Your personal profile starts here</strong><p>No measurements saved yet. Fill in any known measurements; every measurement field is optional.</p></div>}
   <form noValidate aria-busy={pending} onSubmit={e=>{e.preventDefault();void save()}}>
    <fieldset className="measurements-fields" disabled={pending}>
     <legend className="sr-only">Your personal measurements</legend>
     {groups.map(group=><section className="measurements-card" key={group.title} aria-label={group.title}>
      <h2>{group.title}</h2>
      <div className="measurements-grid">{group.keys.map(key=>{
       const [,label,,min,max,instruction]=measurementFields.find(field=>field[0]===key)!
       const value=values[key]
       const invalid=value!==undefined&&!!validateMeasurements({[key]:value})
       const fieldError=invalid?`Enter ${displayMeasurement(min,unit)} to ${displayMeasurement(max,unit)} ${unit}. Leave blank if you’re unsure.`:undefined
       return <div className="measurements-field" key={key}>
        <FormInput id={`measurement-${key}`} label={label} className="measurements-input" type="number" inputMode="decimal" step="any"
         aria-label={`${label} (${unit==='cm'?'centimetres':'inches'})`} aria-describedby={`measurement-${key}-help`}
         value={draft[key]??(value===undefined?'':displayMeasurement(value,unit))} error={fieldError}
         trailingControl={<span className="measurements-suffix" aria-hidden="true">{unit}</span>}
         onChange={e=>{
          const raw=e.target.value;setDraft(d=>({...d,[key]:raw}));setMessage('')
          setValues(v=>{const next={...v};if(raw==='')delete next[key];else next[key]=canonicalMeasurement(raw,unit);return next})
         }}/>
        <p id={`measurement-${key}-help`} className="measurements-field-help">{instruction}</p>
       </div>
      })}</div>
      <details className="measurements-guide"><summary>How to measure<span className="sr-only"> — {group.title.toLowerCase()}</span></summary><p>{group.guidance}</p></details>
     </section>)}
     <div className="measurements-dates">
      <div><FormInput id="measured-on" label="Measured on" className="measurements-input" type="date" required min="1900-01-01" max={requestToday()} value={date} error={dateError||undefined} aria-describedby="measured-on-help" onChange={e=>{setDate(e.target.value);setMessage('')}}/>
       <p id="measured-on-help" className="measurements-field-help">The date you took these measurements.</p></div>
      <div className="measurements-updated"><span>Last updated</span>{profile?<time dateTime={profile.updated_at}>{new Date(profile.updated_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} <small>Sri Lanka time</small></time>:<p>Not saved yet</p>}</div>
     </div>
    </fieldset>
    {error&&<p className="measurements-notice measurements-error" role="alert">{error}</p>}
    <div className="measurements-actions">
     {profile&&<FormButton variant="secondary" className="measurements-delete" disabled={pending} aria-expanded={confirmDelete} aria-controls="measurements-delete-confirmation" onClick={()=>setConfirmDelete(true)}>Delete personal profile</FormButton>}
     <FormButton type="submit" className="measurements-save" disabled={pending}>{operation==='save'?'Saving measurements...':'Save measurements'}</FormButton>
    </div>
    {confirmDelete&&<section id="measurements-delete-confirmation" className="measurements-confirm" role="group" aria-labelledby="measurements-delete-title">
     <h3 id="measurements-delete-title">Delete your personal profile?</h3><p>This removes your saved measurements. Copies already shared with requests will remain unchanged.</p>
     <div><FormButton variant="secondary" disabled={pending} onClick={()=>setConfirmDelete(false)}>Keep profile</FormButton><FormButton variant="secondary" disabled={pending} onClick={()=>void remove()}>{operation==='delete'?'Deleting profile...':'Confirm delete profile'}</FormButton></div>
    </section>}
    <p className="measurements-status" role="status" aria-live="polite">{pending?(operation==='delete'?'Deleting your profile...':'Saving your measurements...'):message}</p>
   </form>
   <p className="measurements-footnote">Choose what to share when sending a request. Later edits or deletion won’t change previously shared measurements.</p>
  </>}
 </section></PortalLayout>
}
