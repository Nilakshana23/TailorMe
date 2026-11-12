import SketchRefinement from '../components/portal/SketchRefinement'
import RefinementControls from '../components/portal/RefinementControls'
import SketchReference from '../components/portal/SketchReference'
import {useEffect,useRef,useState} from 'react'
import {Link,useNavigate,useParams,useBlocker,useLocation} from 'react-router-dom'
import PortalLayout from '../components/portal/PortalLayout'
import {DashboardHeading,DashboardPanel} from '../components/portal/DashboardParts'
import DesignIllustration from '../components/portal/DesignIllustration'
import DesignDrawingEditor from '../components/portal/DesignDrawingEditor'
import GarmentOptionsControls from '../components/portal/GarmentOptionsControls'
import PhotoStylingPreview from '../components/portal/PhotoStylingPreview'
import ColourControl from '../components/ui/ColourControl'
import FormButton from '../components/ui/FormButton'
import {defaultSketch,defaultDesign,designBrowseUrl,designColours,designLengthLabel,designService,editableDesign,designFingerprint,garmentLabels,switchGarment} from '../services/designService'
import type {DesignDrawing} from '../utils/designDrawing'
import type {CustomerDesign,DesignFields} from '../services/designService'
import {authError} from '../services/authService'
import './Designer.css'
import './Applications.css'
export default function DesignerPage(){
 const {id}=useParams();const navigate=useNavigate();const [attempt,setAttempt]=useState(0);const [page,setPage]=useState(0);const [refresh,setRefresh]=useState(0)
 const [fields,setFields]=useState<DesignFields>({...defaultDesign});const [saved,setSaved]=useState<CustomerDesign|null>(null)
 const [loaded,setLoaded]=useState<string|null>(null);const [list,setList]=useState<{key:string;rows:CustomerDesign[];error:string}|null>(null)
 const [pending,setPending]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const busy=useRef(false);const createId=useRef('')
 const [drafts,setDrafts]=useState<Partial<Record<'garment'|'sketch',{fields:DesignFields;saved:CustomerDesign|null;id:string}>>>({});const autoNavigation=useRef(false)
 const location=useLocation()
 const editorHeading=useRef<HTMLHeadingElement>(null)
 const [loadState,setLoadState]=useState<{key:string;message:string}|null>(null)
 const key=`${id??'new'}:${attempt}`;const ready=loaded===key
 const mode=fields.design_kind==='sketch'?'sketch':'garment'
 const isDirty=(value:DesignFields,baseline:CustomerDesign|null)=>designFingerprint(value)!==designFingerprint(baseline??(value.design_kind==='sketch'?defaultSketch:defaultDesign))
 const unsaved=ready&&(isDirty(fields,saved)||Object.entries(drafts).some(([kind,draft])=>kind!==mode&&draft&&isDirty(draft.fields,draft.saved)))
 const blocker=useBlocker(()=>unsaved&&!autoNavigation.current)
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(unsaved){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[unsaved])
 function changeMode(next:'garment'|'sketch'){
  if(next===mode)return
  const currentDraftId=createId.current
  setDrafts(previous=>({...previous,[mode]:{fields,saved,id:currentDraftId}}))
  const draft=drafts[next]
  setFields(draft?.fields??{...(next==='sketch'?defaultSketch:defaultDesign)});setSaved(draft?.saved??null);createId.current=draft?.id??crypto.randomUUID();setMessage('Both mode drafts are kept in memory. Save each separately before leaving. No automatic conversion is performed.')
 }
 function artworkChange(kind:'garment'|'sketch',decorations:DesignDrawing){
  if(kind===mode){setFields(previous=>({...previous,decorations}));return}
  setDrafts(previous=>{const old=previous[kind];return {...previous,[kind]:{fields:{...(old?.fields??(kind==='sketch'?defaultSketch:defaultDesign)),decorations},saved:old?.saved??null,id:old?.id??crypto.randomUUID()}}})
 }
 const listKey=`${page}:${refresh}`
 useEffect(()=>{
  let active=true
  void (id?designService.get(id):Promise.resolve(null)).then(value=>{
   if(!active)return
   if(id&&!value){autoNavigation.current=false;setLoadState({key,message:'Design not found or unavailable to your account.'});setLoaded(null);return}
   if(!autoNavigation.current)setDrafts({})
   autoNavigation.current=false
   setSaved(value);setFields(value?editableDesign(value):{...defaultDesign})
   createId.current=id??crypto.randomUUID();setLoaded(key);setLoadState(null);setError('');setMessage('')
  }).catch(cause=>{if(active){autoNavigation.current=false;setLoadState({key,message:`Unable to load this design. ${authError(cause)}`});setLoaded(null)}})
  return()=>{active=false}
 },[key,id])
 // The fixed portal scrolls here, not on window. Reveal only the loaded editor,
 // after React has committed the selected design, including back/forward visits.
 useEffect(()=>{
  if(!ready)return
  const heading=editorHeading.current
  if(!heading)return
  const container=heading.closest<HTMLElement>('.portal-content-scroll')
  if(container)container.scrollTo({top:Math.max(0,container.scrollTop+heading.getBoundingClientRect().top-container.getBoundingClientRect().top-24),behavior:'auto'})
  else heading.scrollIntoView({block:'start',behavior:'auto'})
  heading.focus({preventScroll:true})
 },[ready,key,location.key])
 useEffect(()=>{let active=true;designService.list(page).then(rows=>{if(active)setList({key:listKey,rows,error:''})}).catch(cause=>{if(active)setList({key:listKey,rows:[],error:authError(cause)})});return()=>{active=false}},[listKey,page])
 function refinedCreated(design:CustomerDesign){
  setDrafts(previous=>({...previous,sketch:{fields,saved,id:createId.current}}))
  setFields(editableDesign(design));setSaved(design);createId.current=design.id;autoNavigation.current=true
  navigate('/customer/designer/'+design.id,{replace:true});setMessage('New template-based garment saved. Your original sketch is kept.')
 }
 const current=list?.key===listKey?list:null;const attached=!!saved?.attached_at
 const dirty=!saved||designFingerprint(fields)!==designFingerprint(saved)
 async function save(){if(busy.current||!ready)return;busy.current=true;setPending(true);setError('');setMessage('');try{const design=await designService.save(saved?.id??createId.current,fields,saved?.version??null);setSaved(design);setFields(editableDesign(design));setMessage('Design saved privately.');if(id!==design.id){autoNavigation.current=true;navigate(`/customer/designer/${design.id}`,{replace:true})}else setList(null);const rows=await designService.list(page);setList({key:listKey,rows,error:''})}catch(cause){setError(`${authError(cause)} Your selections are kept here. Retry saving or reopen the saved design.`)}finally{busy.current=false;setPending(false)}}
 async function remove(design:CustomerDesign){if(busy.current)return;busy.current=true;setPending(true);setError('');try{await designService.remove(design);setMessage('Design deleted.');if(design.id===id)navigate('/customer/designer');setRefresh(value=>value+1)}catch(cause){setError(authError(cause))}finally{busy.current=false;setPending(false)}}
 return <PortalLayout><DashboardHeading eyebrow="Your creative studio" title="Dress Designer" description="Explore a garment idea and share it with a tailor."/><Link className="underline inline-block mb-6" to="/customer/designer">New design</Link>
 {blocker.state==='blocked'&&<section role="alertdialog" aria-label="Unsaved designs"><p>Leave and discard unsaved work in your garment or sketch drafts?</p><button type="button" onClick={()=>blocker.reset()}>Keep editing</button><button type="button" onClick={()=>blocker.proceed()}>Discard and leave</button></section>}
 <div className="photo-actions"><button type="button" disabled={!ready||pending||attached} aria-pressed={mode==='garment'} onClick={()=>changeMode('garment')}>Customize a garment</button><button type="button" disabled={!ready||pending||attached} aria-pressed={mode==='sketch'} onClick={()=>changeMode('sketch')}>Draw your own design</button></div>
 <h2 ref={editorHeading} id="designer-editor-heading" tabIndex={-1} className="designer-editor-heading font-display-lg text-headline-sm">{ready?`${mode==='sketch'?'Sketch':'Garment'} editor${saved?': '+saved.name:''}`:'Design editor'}</h2>
 {!ready?<div role={loadState?.key===key?'alert':'status'}>{loadState?.key===key?<>{loadState.message}<FormButton className="mt-4" onClick={()=>setAttempt(value=>value+1)}>Retry loading</FormButton></>:'Loading selected design...'}</div>:<div className="designer-layout" key={key}><section className="designer-preview portal-card"><div hidden={mode!=='garment'}><DesignDrawingEditor key="garment-drawing" design={mode==='garment'?fields:drafts.garment?.fields??defaultDesign} disabled={pending||attached} onChange={decorations=>artworkChange('garment',decorations)}/><PhotoStylingPreview design={mode==='garment'?fields:drafts.garment?.fields??defaultDesign}/></div><div hidden={mode!=='sketch'}><p className="font-semibold mb-3">Customer design reference</p><DesignDrawingEditor key="sketch-drawing" design={mode==='sketch'?fields:drafts.sketch?.fields??defaultSketch} disabled={pending||attached} onChange={decorations=>artworkChange('sketch',decorations)}/>{saved&&<SketchRefinement key={saved.id+':'+saved.version} source={saved} disabled={pending||dirty} onCreated={refinedCreated}/ >}{(!saved||dirty)&&<p className="mt-4">Save your latest sketch before starting Refine as garment.</p>}</div></section><DashboardPanel title="Make it yours"><form className="space-y-5" onSubmit={event=>{event.preventDefault();void save()}}><fieldset disabled={pending||attached} className="space-y-5"><div><label htmlFor="design-name" className="block mb-2">{mode==='sketch'?'Design title (optional)':'Design name'}</label><input id="design-name" className="designer-form-control" value={fields.name} maxLength={100} required={mode!=='sketch'} onChange={event=>setFields({...fields,name:event.target.value})}/></div>{mode==='garment'&&<><div><label htmlFor="design-garment" className="block mb-2">Garment type</label><select id="design-garment" className="application-select w-full" value={fields.garment_type} onChange={event=>{const type=event.target.value as DesignFields['garment_type'];setFields(switchGarment(fields,type));setMessage('Garment changed. Incompatible neckline, sleeve, length and garment options reset to defaults. Name and colour are kept. Review the new preview handles.')}}>{Object.entries(garmentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
 <fieldset><legend className="mb-2">Colour</legend><div className="design-colours">{Object.entries(designColours).map(([name,colour])=><button key={name} type="button" className="design-colour" aria-pressed={fields.garment_fill==null&&fields.colour===name} onClick={()=>setFields({...fields,colour:name as DesignFields['colour'],garment_fill:null})}><span style={{background:colour}} aria-hidden="true"/>{name}</button>)}</div></fieldset>
 <ColourControl id="garment-fill" label="Garment fill" value={fields.garment_fill??designColours[fields.colour]} onChange={garment_fill=>setFields({...fields,garment_fill})}/>
 <RefinementControls fields={fields} onChange={setFields} disabled={pending||attached}/>
 <GarmentOptionsControls key={key} fields={fields} onChange={setFields} disabled={pending||attached}/>
 <div><label htmlFor="design-length" className="block mb-2">Garment length</label><select id="design-length" className="application-select w-full" value={fields.length} onChange={event=>setFields({...fields,length:event.target.value as DesignFields['length'],refinement_geometry:fields.refinement_geometry?{...fields.refinement_geometry,hem_y:event.target.value==='short'?280:event.target.value==='long'?440:370}:null})}>{(['short','midi','long'] as const).map(length=><option key={length} value={length}>{designLengthLabel({...fields,length})}</option>)}</select></div></> }
 {mode==='sketch'&&<><div><label htmlFor="sketch-category" className="designer-field-label">Garment category (optional)</label><select id="sketch-category" className="designer-form-control" value={fields.sketch_category??''} onChange={event=>setFields({...fields,sketch_category:event.target.value as DesignFields['sketch_category']||null})}><option value="">No category</option>{Object.entries(garmentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor="sketch-notes">Design notes (optional)</label><textarea id="sketch-notes" maxLength={2000} className="application-textarea" value={fields.notes??''} onChange={event=>setFields({...fields,notes:event.target.value})}/></div></>}
 {fields.source_reference&&<label className="refinement-check"><input type="checkbox" checked={!!fields.include_source_reference} onChange={event=>setFields({...fields,include_source_reference:event.target.checked})}/>Include the original sketch reference with this design when sharing.</label>}
 </fieldset>
 <SketchReference design={fields}/>
 {attached?<p>This design is attached to a request and is read-only. Start a new design to make changes.</p>:<FormButton type="submit" disabled={pending}>{pending?'Saving design...':'Save design privately'}</FormButton>}
 {saved&&!dirty?<Link className="designer-find" to={designBrowseUrl(saved.id)}>Find a tailor for this design</Link>:<p className="text-sm">Save your latest changes before choosing a tailor.</p>}
 <p className="text-sm">Only you can see saved designs. A submitted request shares a fixed design snapshot with its addressed tailor.</p></form></DashboardPanel></div>}
 <section className="mt-10"><h2 className="font-display-lg text-headline-md">My saved designs</h2><FormButton variant="secondary" className="mt-4 px-5" disabled={pending} onClick={()=>setRefresh(value=>value+1)}>Refresh saved designs</FormButton>{!current?<p role="status">Loading saved designs...</p>:current.error?<p role="alert">{current.error}</p>:<><div className="designer-library mt-6">{current.rows.map(design=><article key={design.id} className="portal-card"><div className="design-thumbnail"><DesignIllustration design={design} illustrationOnly/></div><h3 className="font-semibold break-words">{design.name}</h3><p className="mt-2 capitalize">{design.design_kind==='sketch'?'Customer design reference':garmentLabels[design.garment_type]} · {design.design_kind==='sketch'?(design.sketch_category?garmentLabels[design.sketch_category]:'No category'):design.garment_fill??design.colour}</p><Link className="underline inline-block py-3" to={`/customer/designer/${design.id}`}>{design.attached_at?'View design':'Open and edit'}</Link><FormButton variant="secondary" className="w-full" disabled={pending||!!design.attached_at} onClick={()=>{void remove(design)}}>Delete design</FormButton>{design.attached_at&&<p className="text-sm mt-3">Attached to a request</p>}</article>)}</div>{!current.rows.length&&<p className="mt-4">No saved designs on this page.</p>}<nav className="flex gap-4 mt-6" aria-label="Saved design pages"><FormButton variant="secondary" className="px-5" disabled={pending||page===0} onClick={()=>setPage(value=>value-1)}>Previous</FormButton><FormButton variant="secondary" className="px-5" disabled={pending||current.rows.length<12} onClick={()=>setPage(value=>value+1)}>Next</FormButton></nav></>}</section><p role="status" aria-live="polite" className="mt-4">{message}</p><p role="alert" className="text-error mt-3">{ready?error:''}</p></PortalLayout>
}

