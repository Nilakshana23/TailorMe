import DesignIllustration from './DesignIllustration'
import {Component,lazy,Suspense,useId,useRef,useState} from 'react'
import type {ReactNode} from 'react'
import type {DesignFields} from '../../services/designService'
import {dressPreviewSpec,omittedPreviewDetails} from '../../utils/dressPreview3d'
import './DressPreview3d.css'

const DressPreview3d=lazy(()=>import('./DressPreview3d'))
class PreviewBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false}
 static getDerivedStateFromError(){return{failed:true}}
 render(){return this.state.failed?<p role="alert">The 3D renderer could not load. Use 2D Design to continue.</p>:this.props.children}
}
export default function DesignPreviewTabs({design,children}:{design:DesignFields;children:ReactNode}){
 const [tab,setTab]=useState<'2d'|'3d'>('2d'),id=useId()
 const two=useRef<HTMLButtonElement>(null),three=useRef<HTMLButtonElement>(null)
 const spec=dressPreviewSpec(design),omissions=omittedPreviewDetails(design)
 return <div className="design-preview-tabs"><div role="tablist" aria-label="Design view" onKeyDown={event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();const next=event.key==='Home'?'2d':event.key==='End'?'3d':tab==='2d'?'3d':'2d'
  setTab(next);(next==='2d'?two:three).current?.focus()
 }}><button ref={two} id={`${id}-2d`} type="button" role="tab" aria-selected={tab==='2d'} aria-controls={`${id}-2d-panel`} tabIndex={tab==='2d'?0:-1} onClick={()=>setTab('2d')}>2D Design</button><button ref={three} id={`${id}-3d`} type="button" role="tab" aria-selected={tab==='3d'} aria-controls={`${id}-3d-panel`} tabIndex={tab==='3d'?0:-1} onClick={()=>setTab('3d')}>3D Preview</button></div>
  <div id={`${id}-2d-panel`} role="tabpanel" aria-labelledby={`${id}-2d`} hidden={tab!=='2d'}>{design.garment_type==='dress'&&design.design_kind!=='sketch'&&<h3>Front - 2D design</h3>}{children}{design.garment_type==='dress'&&design.design_kind!=='sketch'&&<section aria-label="Back 2D view"><DesignIllustration design={design} view="back" details={false}/><p className="text-sm">Front artwork and collars are shown in the Front view only.</p></section>}</div>
  <div id={`${id}-3d-panel`} role="tabpanel" aria-labelledby={`${id}-3d`} hidden={tab!=='3d'}>{tab==='3d'&&<>
   {!spec?<><p role="status">3D Preview supports template garments only. {design.design_kind==='sketch'?'Your sketch':'This garment'} remains available in 2D Design.</p><p className="preview3d-disclaimer">3D design illustration — a simplified preview on a standard mannequin. It does not predict your size, fit or fabric draping.</p></>:<>
    <p className="preview3d-support">{design.garment_type.replaceAll('_',' ')}: colour and length{!['skirt','trousers'].includes(design.garment_type)?`, ${spec.custom?'applied custom':spec.neckline} front opening and ${spec.sleeve} sleeves`:''}.{design.garment_type==='dress'?' Independent back preset.':design.garment_type==='trousers'?' Waistband and selected leg style.':design.garment_type==='shirt'?' Raised button placket.':['kurti','salwar_top'].includes(design.garment_type)?' Selected side slits.':''}</p>
    <p className="preview3d-omissions">{omissions.length?`2D only: ${omissions.join('; ')}.`:'2D remains the authoritative design shared with your tailor.'}</p>
    <PreviewBoundary><Suspense fallback={<p role="status">Loading local 3D renderer...</p>}><DressPreview3d colour={spec.colour} length={spec.length} neckline={spec.neckline} back={spec.back} sleeve={spec.sleeve} custom={spec.custom} garment={spec.garment} options={spec.options}/></Suspense></PreviewBoundary>
    <p className="preview3d-disclaimer">3D design illustration — a simplified preview on a standard mannequin. It does not predict your size, fit or fabric draping.</p><details className="preview3d-support-details"><summary>3D support and limitations</summary><p>Tops reuse preset/custom front openings and supported sleeves. Independent back settings apply to dresses only. Illustration silhouettes are preview settings. Custom geometry and construction details remain authoritative in the 2D design shared with your tailor.</p></details>
   </>}
  </>}</div>
 </div>
}
