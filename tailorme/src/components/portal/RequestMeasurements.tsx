import {useEffect,useState} from 'react'
import {measurementService} from '../../services/measurementService'
import type {MeasurementSnapshot} from '../../services/measurementService'
import MeasurementValues from './MeasurementValues'
import FormButton from '../ui/FormButton'
export default function RequestMeasurements({requestId}:{requestId:string}){
 const [attempt,setAttempt]=useState(0);const [result,setResult]=useState<{key:string;data:MeasurementSnapshot|null;error:boolean}|null>(null);const key=`${requestId}:${attempt}`
 useEffect(()=>{let active=true;measurementService.snapshot(requestId).then(data=>{if(active)setResult({key,data,error:false})}).catch(()=>{if(active)setResult({key,data:null,error:true})});return()=>{active=false}},[key,requestId])
 const current=result?.key===key?result:null
 return <section data-request-section aria-busy={!current} className="mt-8 border-t border-outline-variant pt-6" aria-label="Shared measurements"><h3 className="font-display-lg text-headline-sm">Measurements shared with this request</h3>{!current?<p role="status">Loading shared measurements...</p>:current.error?<><p role="alert">Unable to load measurements.</p><FormButton variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Retry measurements</FormButton></>:current.data?<><MeasurementValues profile={current.data}/><p className="mt-3 text-sm">Fixed snapshot version {current.data.snapshot_version}. Consent recorded {new Date(current.data.consented_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka). Later profile edits or deletion do not change these values.</p></>:<p className="mt-3">No measurements shared with this request.</p>}</section>
}
