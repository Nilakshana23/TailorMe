import SketchReference from './SketchReference'
import {useEffect,useState} from 'react'
import {designService} from '../../services/designService'
import type {DesignSnapshot} from '../../services/designService'
import DesignIllustration from './DesignIllustration'
import FormButton from '../ui/FormButton'
export default function RequestDesign({requestId,title='Design shared with this request'}:{requestId:string;title?:string}){
 const [attempt,setAttempt]=useState(0);const [result,setResult]=useState<{key:string;design:DesignSnapshot|null;error:string}|null>(null);const key=`${requestId}:${attempt}`
 useEffect(()=>{let active=true;designService.snapshot(requestId).then(design=>{if(active)setResult({key,design,error:''})}).catch(()=>{if(active)setResult({key,design:null,error:'Unable to load the request design.'})});return()=>{active=false}},[key,requestId])
 const current=result?.key===key?result:null
 return <section className="mt-8 border-t border-outline-variant pt-6" aria-label="Request design"><h3 className="font-display-lg text-headline-sm">{title}</h3>{!current?<p role="status">Loading design...</p>:current.error?<><p role="alert">{current.error}</p><FormButton variant="secondary" className="mt-3 px-5" onClick={()=>setAttempt(value=>value+1)}>Retry design</FormButton></>:current.design?<><p className="font-semibold mt-4 break-words">{current.design.name}</p><p className="text-sm mt-2">Fixed snapshot of saved design version {current.design.design_version}. Later changes do not alter this request.</p><div className="portal-card mt-4"><DesignIllustration design={current.design}/>{current.design.garment_type==='dress'&&current.design.design_kind!=='sketch'&&<section aria-label="Back 2D view"><DesignIllustration design={current.design} view="back" details={false}/><p>Front artwork and collars are shown in the Front view only.</p></section>}<SketchReference design={current.design}/></div></>:<p className="mt-4">No design attached to this request.</p>}</section>
}
