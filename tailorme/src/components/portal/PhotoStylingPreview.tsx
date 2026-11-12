import {useEffect, useRef, useState} from 'react'
import type {ChangeEvent, PointerEvent} from 'react'
import DesignIllustration from './DesignIllustration'
import FormButton from '../ui/FormButton'
import type {DesignFields} from '../../services/designService'
import {alignmentLandmarks,alignmentWarp,convertMeasurements,emptyMeasurements,estimatedHem,landmarkLabels,measurementError,measurementLabels,updatedAlignment,warpPoint} from '../../utils/stylingAlignment'
import type {AlignmentPoints,Landmark,MeasurementKey,MeasurementUnit,Point,PreviewMeasurements} from '../../utils/stylingAlignment'
import {changeShape,defaultPreviewShape,dragShape,inverseWarpPoint,shapeControls,shapeHandles,shapeKey,validatePreviewShape} from '../../utils/previewShape'
import type {PreviewShape} from '../../utils/previewShape'

const defaults = {x:50, y:50, scale:100, rotation:0, opacity:80}
type Guide={type:DesignFields['garment_type'];enabled:boolean;points:AlignmentPoints;undo:AlignmentPoints[];selected:Landmark|null}
const emptyGuide=(type:DesignFields['garment_type']):Guide=>({type,enabled:false,points:{},undo:[],selected:null})
type ShapeState={key:string;enabled:boolean;symmetric:boolean;past:(PreviewShape|null)[];current:PreviewShape|null;future:(PreviewShape|null)[]}
const emptyShape=(design:DesignFields):ShapeState=>({key:shapeKey(design),enabled:false,symmetric:true,past:[],current:null,future:[]})
export default function PhotoStylingPreview({design}:{design:DesignFields}) {
 const [photo,setPhoto] = useState<string|null>(null)
 const [error,setError] = useState('')
 const [adjust,setAdjust] = useState({...defaults})
 const input = useRef<HTMLInputElement>(null)
 const drag = useRef<{id:number;x:number;y:number;left:number;top:number;landmark?:Landmark;base?:AlignmentPoints}|null>(null)
 const [guideState,setGuide]=useState<Guide>(emptyGuide(design.garment_type))
 const [measurements,setMeasurements]=useState<PreviewMeasurements>({...emptyMeasurements})
 const [unit,setUnit]=useState<MeasurementUnit>('cm')
 const [photoAspect,setPhotoAspect]=useState(1)
 const [coordinates,setCoordinates]=useState({key:'',x:50,y:50})
 const [filename,setFilename]=useState('')
 const [shapeState,setShape]=useState<ShapeState>(emptyShape(design))
 const shapeDrag=useRef<{id:number;key:string;seed:Point;base:PreviewShape|null;current:PreviewShape}|null>(null)
 const shape=shapeState.key===shapeKey(design)?shapeState:emptyShape(design)
 const shapeMode=shape.enabled&&design.garment_type!=='trousers'
 const currentShape=shape.current??defaultPreviewShape(design)
 const guide=guideState.type===design.garment_type?guideState:emptyGuide(design.garment_type)
 const landmarks=alignmentLandmarks(design.garment_type)
 const warp=alignmentWarp(guide.points,design)
 const completed=landmarks.filter(key=>guide.points[key]).length
 const selected=guide.selected??landmarks.find(key=>!guide.points[key])??landmarks[0]
 const controlPoint=coordinates.key===`${design.garment_type}:${selected}`?coordinates:guide.points[selected]??{x:50,y:50}
 function clearLocal(){setGuide(emptyGuide(design.garment_type));setMeasurements({...emptyMeasurements});setUnit('cm');setPhotoAspect(1);setCoordinates({key:'',x:50,y:50});setFilename('');setShape(emptyShape(design));shapeDrag.current=null;drag.current=null}
 function validatedMarks(points:AlignmentPoints,key:Landmark,x:number,y:number){
  const next=updatedAlignment(points,key,{x,y},design.garment_type)
  if(shape.current){const message=validatePreviewShape(shape.current,design,alignmentWarp(next,design));if(message)throw new Error(message)}
  return next
 }
 function commitShape(next:PreviewShape|null,symmetric=shape.symmetric){
  const message=next?validatePreviewShape(next,design,warp):''
  if(message){setError(message);return}
  const changed=JSON.stringify(next)!==JSON.stringify(shape.current)
  setShape({...shape,symmetric,current:next,past:changed?[...shape.past.slice(-49),shape.current]:shape.past,future:changed?[]:shape.future});setError('')
 }
 function restoreGuide(next:Guide){
  const message=shape.current?validatePreviewShape(shape.current,design,alignmentWarp(next.points,design)):''
  if(message){setError(message);return}
  setGuide(next);setCoordinates({key:'',x:50,y:50});setError('');drag.current=null
 }
 function moveShape(event:PointerEvent<HTMLDivElement>){
  const start=shapeDrag.current;if(!start||start.id!==event.pointerId)return
  try{
   const matrix=event.currentTarget.querySelector('svg')?.getScreenCTM()
   if(!matrix)throw new Error('Wait for the illustration to appear, then try again.')
   const position=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
   const point=warp?inverseWarpPoint(position,warp,start.seed):position
   const next=dragShape(start.current,start.key,point,shape.symmetric,design,warp)
   start.current=next;start.seed=shapeHandles(next,design).find(handle=>handle.key===start.key)!.point
   setShape(previous=>({...previous,current:next}));setError('')
  }catch(cause){setError((cause as Error).message)}
 }
 function endShape(cancel=false){
  const start=shapeDrag.current;shapeDrag.current=null;if(!start)return
  setShape(previous=>{
   if(cancel)return {...previous,current:start.base}
   const changed=JSON.stringify(start.current)!==JSON.stringify(start.base??defaultPreviewShape(design))
   return {...previous,current:changed?start.current:start.base,past:changed?[...previous.past.slice(-49),start.base]:previous.past,future:changed?[]:previous.future}
  })
 }
 function recordPoint(key:Landmark,x:number,y:number){
  try{
   const next=validatedMarks(guide.points,key,x,y)
   setGuide({...guide,points:next,undo:JSON.stringify(next)===JSON.stringify(guide.points)?guide.undo:[...guide.undo.slice(-49),guide.points],selected:landmarks.find(name=>!next[name])??key});setCoordinates({key:'',x:50,y:50});setError('')
  }catch(cause){setError((cause as Error).message)}
 }
 function mark(event:PointerEvent<HTMLDivElement>,key:Landmark){
  const bounds=event.currentTarget.getBoundingClientRect()
  if(!bounds.width||!bounds.height)return
  const x=(event.clientX-bounds.left)/bounds.width*100,y=(event.clientY-bounds.top)/bounds.height*100
  setGuide(previous=>{
   const current=previous.type===design.garment_type?previous:emptyGuide(design.garment_type)
   try{return {...current,points:validatedMarks(current.points,key,x,y)}}catch{return current}
  })
  // Validate outside the state updater to keep it free of side effects.
  try{validatedMarks(guide.points,key,x,y);setError('')}catch(cause){setError((cause as Error).message)}
 }
 function endDrag(){
  const start=drag.current;drag.current=null
  if(start?.landmark&&start.base)setGuide(previous=>{
   const changed=JSON.stringify(previous.points)!==JSON.stringify(start.base)
   return {...previous,undo:changed?[...previous.undo.slice(-49),start.base!]:previous.undo,selected:landmarks.find(key=>!previous.points[key])??start.landmark!}
  })
 }
 // Only local blob URLs enter this component. Revoke each on replacement/removal/unmount.
 useEffect(()=>()=>{if(photo) URL.revokeObjectURL(photo)},[photo])
 function select(event:ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if(!file) return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)) {setError('Choose a JPEG, PNG or WebP photo.');return}
  if(file.size===0 || file.size>5*1024*1024) {setError('Choose a non-empty photo up to 5 MB.');return}
  setPhoto(URL.createObjectURL(file));setAdjust({...defaults});setError('');clearLocal();setFilename(file.name)
 }
 function move(event:PointerEvent<HTMLDivElement>) {
  if(shapeDrag.current){moveShape(event);return}
  const start=drag.current
  if(!start || start.id!==event.pointerId) return
  if(start.landmark){mark(event,start.landmark);return}
  const bounds=event.currentTarget.getBoundingClientRect()
  const clamp=(value:number)=>Math.max(0,Math.min(100,value))
  setAdjust(value=>({...value,x:clamp(start.left+(event.clientX-start.x)/bounds.width*100),y:clamp(start.top+(event.clientY-start.y)/bounds.height*100)}))
 }
 return <div className="photo-styling">
  <h2 className="font-semibold text-lg">Guided styling preview</h2>
  <p className="font-semibold mt-3">Approximate illustration, not a prediction of garment fit.</p>
  <p className="text-sm mt-3">Preview adjustments are not saved to your tailoring design.</p>
  <p className="text-sm mt-3">Adjust the illustration manually. This is not AI try-on.</p>
  <p className="text-sm mt-3" id="photo-privacy">Optional and free. Your photo, marks and measurements stay in browser memory—never uploaded, saved or shared with tailors. Your original photo and saved design are unchanged.</p>
  <div className="photo-selector mt-4">
   <input ref={input} id="styling-photo" className="sr-only" tabIndex={-1} type="file" aria-label="Choose your photo" accept="image/jpeg,image/png,image/webp" aria-describedby="photo-file-help photo-privacy photo-error" onChange={select}/>
   <div className="photo-selector-actions">
    <FormButton id="styling-photo-choose" className="photo-choose-button" aria-describedby="photo-file-help photo-privacy photo-error" onClick={()=>input.current?.click()}><span className="material-symbols-outlined" aria-hidden="true">upload</span>{photo?'Change photo':'Choose your photo'}</FormButton>
    {photo&&<FormButton variant="secondary" className="photo-remove-button" onClick={()=>{setPhoto(null);clearLocal();setError('');input.current?.parentElement?.querySelector<HTMLButtonElement>('#styling-photo-choose')?.focus()}}>Remove photo</FormButton>}
   </div>
   <p id="photo-file-help" className="text-sm mt-2">JPEG, PNG or WebP · Maximum 5 MB</p>
   {photo&&<p className="photo-filename text-sm mt-2" role="status">Selected: {filename}</p>}
  </div>
  <p id="photo-error" role="alert" className="text-error mt-3">{error}</p>
  {photo&&<>
   {design.garment_type==='trousers'?<p className="text-sm mt-3">Choose trouser leg and waist styles in the designer. Use waist, hip and separate leg-hem photo marks; torso and sleeve shape tools do not apply.</p>:<div className="photo-actions"><button type="button" aria-pressed={shapeMode} onClick={()=>{endShape(true);setShape(previous=>({...previous.key===shapeKey(design)?previous:emptyShape(design),enabled:!shapeMode}));setGuide({...guide,enabled:false});drag.current=null;setError('')}}>{shapeMode?'Finish adjusting shape':'Adjust garment shape'}</button></div>}
   <div className="photo-actions"><button type="button" aria-pressed={guide.enabled} onClick={()=>{endShape(true);setShape(previous=>({...previous.key===shapeKey(design)?previous:emptyShape(design),enabled:false}));setGuide({...guide,enabled:!guide.enabled});setCoordinates({key:'',x:50,y:50});drag.current=null}}>{guide.enabled?'Finish marking points':'Align garment to photo'}</button><button type="button" disabled={!guide.undo.length||shapeMode} onClick={()=>restoreGuide({...guide,points:guide.undo.at(-1)!,undo:guide.undo.slice(0,-1)})}>Undo alignment</button><button type="button" disabled={shapeMode} onClick={()=>restoreGuide({...emptyGuide(design.garment_type),enabled:guide.enabled,undo:completed?[...guide.undo.slice(-49),guide.points]:guide.undo})}>Reset alignment</button></div>
   {guide.enabled&&<>
    <p role="status" className="mt-3">Step {landmarks.indexOf(selected)+1} of {landmarks.length}: mark {landmarkLabels[selected].toLowerCase()}. Tap the photo or drag a handle. Left and right mean the sides as viewed in the photo. {completed} of {landmarks.length} points marked.</p>
    <p className="text-sm">{design.garment_type==='trousers'?'Mark the waist, then hips, then the outer hem of each leg in a front-facing photo.':'Mark a front-facing photo. Place waist below shoulders where relevant, hips below waist, and hem below the last row.'} Keep each pair at a similar height. Points control visible widths; circumferences are not converted into front-view widths.</p>
    <div className="alignment-steps" aria-label="Alignment steps">{landmarks.map((key,i)=><button type="button" key={key} aria-pressed={selected===key} onClick={()=>{setGuide({...guide,selected:key});setCoordinates({key:'',x:50,y:50})}}>{i+1}. {landmarkLabels[key]}{guide.points[key]?' ✓':''}</button>)}</div>
   </>}
   <div className="photo-stage" style={{maxWidth:`${600*photoAspect}px`,marginInline:'auto'}} aria-label="Photo with garment illustration" onPointerDown={event=>{
    if(!event.isPrimary || event.button!==0) return
    if(shapeMode){
     const key=(event.target as HTMLElement)?.closest?.<HTMLElement>('[data-shape]')?.dataset.shape
     const handle=shapeHandles(currentShape,design).find(value=>value.key===key)
     if(!handle)return
     event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)
     shapeDrag.current={id:event.pointerId,key:handle.key,seed:handle.point,base:shape.current,current:currentShape};drag.current=null
     return
    }
    const handle=(event.target as HTMLElement)?.closest?.<HTMLElement>('[data-landmark]')?.dataset.landmark as Landmark|undefined
    if(!guide.enabled&&handle)return
    event.currentTarget.setPointerCapture(event.pointerId)
    setCoordinates({key:'',x:50,y:50})
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:adjust.x,top:adjust.y,...(guide.enabled?{landmark:handle??selected,base:guide.points}:{})}
    if(guide.enabled)mark(event,handle??selected)
   }} onPointerMove={move} onPointerUp={event=>{if(shapeDrag.current?.id===event.pointerId){moveShape(event);endShape();return}if(drag.current?.id!==event.pointerId)return;if(drag.current.landmark)mark(event,drag.current.landmark);endDrag()}} onPointerCancel={()=>{endShape(true);endDrag()}} onLostPointerCapture={()=>{endShape(true);endDrag()}}>
    <img src={photo} alt="Your selected styling photo" draggable={false} onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth&&image.naturalHeight)setPhotoAspect(image.naturalWidth/image.naturalHeight)}} onError={()=>{setPhoto(null);clearLocal();setError('This photo could not be read. Choose a valid JPEG, PNG or WebP photo.')}}/>
    <div className={`photo-garment${warp?' photo-garment-aligned':''}`} style={warp?{left:`${adjust.x-50}%`,top:`${adjust.y-50}%`,width:'100%',height:'100%',transform:`rotate(${adjust.rotation}deg) scale(${adjust.scale/100})`}:{left:`${adjust.x}%`,top:`${adjust.y}%`,width:`${adjust.scale*0.65}%`,transform:`translate(-50%, -50%) rotate(${adjust.rotation}deg)`}}><div className="photo-garment-drawing" style={{opacity:adjust.opacity/100}}><DesignIllustration design={design} illustrationOnly previewWarp={warp} previewShape={shape.current}/></div>
     {shapeMode&&shapeHandles(currentShape,design).map((handle,index)=>{const point=warp?warpPoint(handle.point,warp):{x:handle.point.x/320*100,y:handle.point.y/480*100};return <button type="button" key={handle.key} className="shape-handle" data-shape={handle.key} aria-label={`${handle.label}. Drag to adjust, or press Enter for the shape sliders.`} aria-describedby="shape-help" title={handle.label} style={{left:`${point.x}%`,top:`${point.y}%`,transform:`translate(-50%, -50%) rotate(${-adjust.rotation}deg) scale(${warp?100/adjust.scale:1})`}} onClick={event=>{if(event.detail===0){const key=handle.key.replace('.','-').replace('-sleeve','-sleeveWidth');event.currentTarget.closest('.photo-styling')?.querySelector<HTMLInputElement>(`#shape-${key}`)?.focus()}}}>{index+1}</button>})}
    </div>
    {guide.enabled&&landmarks.map(key=>guide.points[key]&&<button type="button" key={key} className="alignment-handle" data-landmark={key} aria-label={`${landmarkLabels[key]} alignment handle. Use position controls below to adjust with a keyboard.`} aria-pressed={selected===key} style={{left:`${guide.points[key]!.x}%`,top:`${guide.points[key]!.y}%`}} onClick={()=>setGuide(previous=>({...previous,selected:key}))}>{landmarks.indexOf(key)+1}</button>)}
   </div>
   <p className="text-sm mt-3">{shapeMode?'Drag the numbered shape handles; finish adjusting shape to move the whole garment.':guide.enabled?'Finish marking points to drag the whole illustration.':'Drag to move, or use the controls below.'} {warp?'Alignment applied. Shape and whole-garment adjustments can offset the illustration from its photo marks.':'Photo alignment applies after every relevant point is marked.'}</p>
   {shapeMode&&<fieldset className="preview-shape-controls"><legend>Adjust garment shape</legend>
    <p id="shape-help" className="text-sm">Handles change the filled garment, not decorative lines. Shoulder handles move sideways; sleeve ends change sleeve width and length. Underarm, waist and hem rows stay ordered. Sliders use illustration units, not body measurements. Invalid edits keep the last valid shape.</p>
    <label className="shape-symmetry"><input type="checkbox" checked={shape.symmetric} onChange={event=>{const checked=event.target.checked;if(checked&&shape.current)commitShape({...currentShape,right:{...currentShape.left}},true);else setShape({...shape,symmetric:checked})}}/> Symmetric shape edits</label>
    {shapeControls(currentShape,design).map(control=><div key={control.key}><label htmlFor={`shape-${control.key.replace('.','-')}`}>{control.label}: {Math.round(control.value*10)/10}</label><input id={`shape-${control.key.replace('.','-')}`} type="range" min={control.min} max={control.max} step="0.1" value={control.value} onChange={event=>{try{commitShape(changeShape(currentShape,control.key,Number(event.target.value),shape.symmetric,design,warp))}catch(cause){setError((cause as Error).message)}}}/></div>)}
    <div className="photo-actions"><button type="button" disabled={!shape.past.length} onClick={()=>{const next=shape.past.at(-1)!;const message=next?validatePreviewShape(next,design,warp):'';if(message){setError(message);return}setShape({...shape,current:next,past:shape.past.slice(0,-1),future:[shape.current,...shape.future]});setError('')}}>Undo shape</button><button type="button" disabled={!shape.future.length} onClick={()=>{const next=shape.future[0];const message=next?validatePreviewShape(next,design,warp):'';if(message){setError(message);return}setShape({...shape,current:next,past:[...shape.past.slice(-49),shape.current],future:shape.future.slice(1)});setError('')}}>Redo shape</button><button type="button" disabled={!shape.current} onClick={()=>commitShape(null)}>Reset shape</button></div>
   </fieldset>}
   {guide.enabled&&<fieldset className="alignment-position"><legend>Position {landmarkLabels[selected]}</legend><p className="text-sm">Set both coordinates, then mark the point. These controls also adjust existing handles.</p>{(['x','y'] as const).map(axis=><div key={axis}><label htmlFor={`alignment-${axis}`}>{axis==='x'?'Horizontal':'Vertical'} position: {controlPoint[axis]}% of photo</label><input id={`alignment-${axis}`} type="range" min="0" max="100" step="0.1" value={controlPoint[axis]} onChange={event=>setCoordinates({...controlPoint,key:`${design.garment_type}:${selected}`,[axis]:Number(event.target.value)})}/></div>)}<button type="button" onClick={()=>recordPoint(selected,controlPoint.x,controlPoint.y)}>Mark at current controls</button></fieldset>}
   <fieldset className="preview-measurements"><legend>Optional preview measurements</legend>
    <label htmlFor="preview-unit">Measurement units</label><select id="preview-unit" value={unit} onChange={event=>{const next=event.target.value as MeasurementUnit;setMeasurements(convertMeasurements(measurements,unit,next));setUnit(next);setError('')}}><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option></select>
    {(Object.keys(measurementLabels) as MeasurementKey[]).map(key=>{const message=measurementError(key,measurements[key],unit);return <div key={key}><label htmlFor={`preview-measure-${key}`}>{measurementLabels[key]} ({unit==='in'?'inches':'cm'})</label><input id={`preview-measure-${key}`} type="number" step="any" value={measurements[key]} aria-invalid={!!message} aria-describedby={`preview-measure-${key}-help`} onChange={event=>setMeasurements({...measurements,[key]:event.target.value})}/><p id={`preview-measure-${key}-help`} className="text-error text-sm">{message}</p></div>})}
    <p className="text-sm">Circumferences are local reference notes only; they never set front-view widths. {['skirt','trousers'].includes(design.garment_type)?'For skirts and trousers, all measurements are reference notes; place the hem manually.':'Shoulder width and garment length are used only if you choose the hem estimate below. It assumes a front-facing photo and the same scale at shoulders and hem; pose, perspective and clothing can make it inaccurate. It estimates a vertical distance, not fit, drape or ease.'}</p>
    {!['skirt','trousers'].includes(design.garment_type)&&<button type="button" onClick={()=>{try{const point=estimatedHem(guide.points,measurements,unit,photoAspect,design.garment_type);recordPoint('hem',point.x,point.y)}catch(cause){setError((cause as Error).message)}}}>Estimate hem from shoulder width and garment length</button>}
    <button type="button" onClick={()=>{setMeasurements({...emptyMeasurements});setError('')}}>Clear preview measurements</button>
   </fieldset>
   <div className="photo-controls">
    {([
     ['x','Horizontal position',0,100,'%'],['y','Vertical position',0,100,'%'],['scale','Proportional size',25,200,'%'],['rotation','Rotation',-180,180,'°'],['opacity','Opacity',0,100,'%'],
    ] as const).map(([key,label,min,max,unit])=><div key={key}><label htmlFor={`photo-${key}`}>{label}: {adjust[key]}{unit}</label><input id={`photo-${key}`} type="range" min={min} max={max} step="1" disabled={shapeMode&&key!=='opacity'} value={adjust[key]} onChange={event=>setAdjust(value=>({...value,[key]:Number(event.target.value)}))}/></div>)}
   </div>
   <div className="photo-actions"><button type="button" disabled={shapeMode} onClick={()=>{setAdjust({...defaults});drag.current=null}}>Reset illustration</button></div>
  </>}
 </div>
}
