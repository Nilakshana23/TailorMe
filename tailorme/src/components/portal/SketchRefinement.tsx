import {useRef,useState} from 'react'
import {defaultDesign,designService,garmentLabels,switchGarment,validateDesignOptions} from '../../services/designService'
import type {CustomerDesign,DesignFields,GarmentType} from '../../services/designService'
import {emptyDrawing} from '../../utils/designDrawing'
import {initialRefinementGeometry} from '../../utils/garmentRefinement'
import DesignIllustration from './DesignIllustration'
import GarmentOptionsControls from './GarmentOptionsControls'
import RefinementControls from './RefinementControls'
import FormButton from '../ui/FormButton'
import {authError} from '../../services/authService'

export default function SketchRefinement({source,disabled,onCreated}:{source:CustomerDesign;disabled:boolean;onCreated:(design:CustomerDesign)=>void}){
 const [active,setActive]=useState(false),[indices,setIndices]=useState<number[]>([])
 const [fields,setFields]=useState<DesignFields>(()=>switchGarment({...defaultDesign,design_kind:'garment',name:`Refined ${source.name}`.slice(0,100),decorations:emptyDrawing(2)},'dress'))
 const [keep,setKeep]=useState(true),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[locked,setLocked]=useState(false)
 const attempt=useRef<{id:string;fields:DesignFields;indices:number[];keep:boolean}|null>(null),busy=useRef(false)
 const art=source.decorations??emptyDrawing(2)
 function update(next:DesignFields){setFields(next);setConfirmed(false);setError('')}
 async function create(){
  if(busy.current||disabled||(!attempt.current&&(!confirmed||!fields.refinement_geometry)))return
  if(!attempt.current){const invalid=validateDesignOptions(fields);if(invalid){setError(invalid);return}}
  busy.current=true;setPending(true);setLocked(true);setError('')
  attempt.current??={id:crypto.randomUUID(),fields:structuredClone(fields),indices:[...indices],keep}
  const submission=attempt.current
  try{const result=await designService.refine(submission.id,source,submission.fields,submission.indices,submission.keep);onCreated(result)}
  catch(cause){setError(`${authError(cause)} Retry this same refinement safely. Your original sketch is unchanged.`)}
  finally{busy.current=false;setPending(false)}
 }
 return <section className="sketch-refinement" aria-label="Refine sketch as garment">
  <h2 className="font-display-lg text-headline-sm">Refine as garment</h2>
  <p>Template-based refinement uses your chosen garment template and outline proportions. It does not automatically understand arbitrary sketches. Details may need manual adjustment.</p>
  {!active?<FormButton variant="secondary" disabled={disabled||!art.strokes.length} onClick={()=>setActive(true)}>Start template-based refinement</FormButton>:<>
   <fieldset disabled={disabled||pending||locked} className="refinement-settings"><legend>Template-based refinement</legend>
    <label htmlFor="refinement-category">Choose the garment template</label><select id="refinement-category" className="application-select" value={fields.garment_type} onChange={e=>update(switchGarment(fields,e.target.value as GarmentType))}>{Object.entries(garmentLabels).map(([key,label])=><option key={key} value={key}>{key==='dress'?'Frock / Dress':key==='blouse'?'Top / Blouse':label}</option>)}</select>
    <fieldset><legend>Identify the garment outline strokes</legend><p>Only checked items set initial proportions. Leave buttons, pleats, annotations and other decorations unchecked. Nothing is recognised or removed automatically.</p>
     {art.strokes.map((s,i)=><label className="refinement-check" key={i}><input type="checkbox" checked={indices.includes(i)} onChange={e=>{setIndices(e.target.checked?[...indices,i]:indices.filter(n=>n!==i));update({...fields,refinement_geometry:null})}}/>Item {i+1}: {s.kind??'stroke'} · {s.colour} · {s.points.length} points</label>)}
    </fieldset>
    <FormButton variant="secondary" disabled={!indices.length} onClick={()=>{try{update({...fields,refinement_geometry:initialRefinementGeometry(art,indices)})}catch(cause){setError((cause as Error).message)}}}>Use selected outline proportions</FormButton>
    <label htmlFor="refinement-name">New design name</label><input id="refinement-name" className="application-select" maxLength={100} value={fields.name} onChange={e=>update({...fields,name:e.target.value})}/>
    <GarmentOptionsControls fields={fields} onChange={update} disabled={disabled||pending}/>

    <label htmlFor="refinement-length">Template length</label><select id="refinement-length" className="application-select" value={fields.length} onChange={e=>update({...fields,length:e.target.value as DesignFields['length'],refinement_geometry:fields.refinement_geometry?{...fields.refinement_geometry,hem_y:e.target.value==='short'?280:e.target.value==='long'?440:370}:null})}><option value="short">Short template</option><option value="midi">Standard template</option><option value="long">Long template</option></select>
    <p>Confirm the neckline and sleeves above where relevant. Use the width and hem anchors below to choose a Straight, A-line or Flared silhouette. For trousers, choose the leg style.</p>
    <RefinementControls fields={fields} onChange={update}/>
    <label className="refinement-check"><input id="refinement-keep-reference" type="checkbox" checked={keep} onChange={e=>{setKeep(e.target.checked);setConfirmed(false)}}/>Keep the complete original sketch as an included reference when sharing this new design.</label>
   </fieldset>
   <div className="refinement-comparison"><section><h3>Original sketch · version {source.version}</h3><DesignIllustration design={source} selectedDrawingStroke={indices.at(-1)??null}/></section><section><h3>Proposed illustration</h3><p>Template-based refinement</p><DesignIllustration design={fields}/></section></div>
   <p>Your original sketch stays saved and unchanged. All its details are retained in a linked private copy. {keep?'The complete sketch reference will accompany the refined design when sent to a tailor.':'Only the refined illustration will be shared; the sketch copy stays private.'} You can change reference inclusion before sending a request.</p>
   <label className="refinement-check"><input id="refinement-confirm" type="checkbox" disabled={disabled||pending||locked||!fields.refinement_geometry} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed the outline, template, neckline, sleeves and reference selection. Save this as a new linked design.</label>
   <div className="photo-actions"><FormButton disabled={disabled||pending||(!locked&&(!confirmed||!fields.refinement_geometry))} onClick={()=>void create()}>{pending?'Saving refinement...':locked?'Retry saving this refinement':'Confirm and save new garment'}</FormButton><FormButton variant="secondary" disabled={pending||locked} onClick={()=>{setActive(false);setConfirmed(false);setError('')}}>Cancel refinement</FormButton></div>
   {locked&&!pending&&<p>The original submission is kept for safe retry. Open the designer again to start a different refinement.</p>}
   {error&&<p role="alert">{error}</p>}<p role="status">{pending?'Saving a new design; keeping your original sketch...':''}</p>
  </>}
 </section>
}
