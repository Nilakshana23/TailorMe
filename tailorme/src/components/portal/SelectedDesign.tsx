import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {usePortal} from '../../auth/portalContext'
import {designService} from '../../services/designService'
import type {CustomerDesign} from '../../services/designService'
import DesignIllustration from './DesignIllustration'
export default function SelectedDesign({id}:{id:string|null}){
 const {role}=usePortal();const [result,setResult]=useState<{id:string;design:CustomerDesign|null;error:string}|null>(null)
 useEffect(()=>{let active=true;if(id&&role==='customer')void designService.get(id).then(design=>{if(active)setResult({id,design,error:design?'':'Selected design unavailable. Reopen your designer.'})}).catch(()=>{if(active)setResult({id,design:null,error:'Unable to load the selected design. Reopen your designer.'})});return()=>{active=false}},[id,role])
 if(!id||role!=='customer')return null
 const current=result?.id===id?result:null
 return <aside className="portal-card mb-8" aria-label="Selected design">{!current?<p role="status">Loading selected design...</p>:current.error?<p role="alert">{current.error}</p>:<><p>Finding a tailor for <strong>{current.design?.name}</strong>. Your saved design will be copied into the request when you submit.</p>{current.design?.design_kind==='sketch'&&<><p className="font-semibold mt-3">Customer design reference</p><div className="design-thumbnail"><DesignIllustration design={current.design} illustrationOnly/></div></>}</>}<Link className="underline inline-block mt-3" to={`/customer/designer/${encodeURIComponent(id)}`}>Review selected design</Link></aside>
}
