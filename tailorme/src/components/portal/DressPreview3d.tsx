import type {GarmentType,GarmentOptions} from '../../services/designService'
import type {CustomNeckline} from '../../utils/necklineGeometry'
import type {BackNeckline} from '../../utils/backNeckline'
import {useEffect,useRef,useState} from 'react'
import {createDressRenderer} from './dressWebglRenderer'
import type {PresetNeckline} from '../../utils/dressNecklineMesh'
import type {IllustrationSilhouette} from '../../utils/dressPreview3d'

const emptyOptions:GarmentOptions={}
export default function DressPreview3d({colour,length,neckline,back,sleeve,custom=null,garment='dress',options=emptyOptions}:{garment?:GarmentType;options?:GarmentOptions;custom?:CustomNeckline|null;back:BackNeckline;sleeve:'sleeveless'|'short'|'long'|'none';colour:string;length:'short'|'midi'|'long';neckline:PresetNeckline}){
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createDressRenderer>|null>(null)
 const [silhouette,setSilhouette]=useState<IllustrationSilhouette>('a-line'),[error,setError]=useState(''),[loading,setLoading]=useState(true),[warning,setWarning]=useState('')
 const current=useRef({colour,length,silhouette,neckline,back,sleeve,custom,garment,options})
 useEffect(()=>{
  if(!canvas.current||error)return
  let active=true
  // Initialize after the committed canvas exists; cancellation also covers
  // StrictMode's setup/cleanup replay and a tab closed during initialization.
  void Promise.resolve().then(()=>{
   if(!active||!canvas.current)return
   try{
    renderer.current=createDressRenderer(canvas.current,message=>{if(active)setError(message)})
    const spec=current.current;setWarning(renderer.current.update(spec.colour,spec.length,spec.silhouette,spec.neckline,spec.back,spec.sleeve,spec.custom,spec.garment,spec.options)??'');setLoading(false)
   }catch(cause){setError(cause instanceof Error?cause.message:'3D renderer failed.')}
  })
  return()=>{active=false;renderer.current?.dispose();renderer.current=null}
 },[error])
 useEffect(()=>{current.current={colour,length,silhouette,neckline,back,sleeve,custom,garment,options};setWarning(renderer.current?.update(colour,length,silhouette,neckline,back,sleeve,custom,garment,options)??'')},[colour,length,silhouette,neckline,back,sleeve,custom,garment,options,error])
 if(error)return <p role="alert">{error} Your 2D design is still available. Select 2D Design to continue.</p>
 return <section className="preview3d-view" aria-label="Interactive garment illustration">
  {warning&&<p role="alert">{warning}</p>}{loading&&<p role="status">Preparing 3D illustration...</p>}
  <div className="preview3d-controls preview3d-views" aria-label="Preset camera views"><button type="button" onClick={()=>renderer.current?.view('front')}>Front</button><button type="button" onClick={()=>renderer.current?.view('back')}>Back</button><button type="button" onClick={()=>renderer.current?.view('detail')}>Detail</button></div><p id="preview3d-help">Drag to rotate. Vertical touch scrolls the page. Detail focuses on the neckline or waistband.</p>
  <canvas ref={canvas} role="img" aria-label="Simplified garment on a neutral standard mannequin" aria-describedby="preview3d-help"/>
  {['dress','skirt'].includes(garment)&&<label className="preview3d-silhouette">Illustration silhouette (preview only)<select value={silhouette} onChange={event=>setSilhouette(event.target.value as IllustrationSilhouette)}><option value="straight">Straight</option><option value="a-line">A-line</option><option value="flared">Flared</option></select></label>}
  <div className="preview3d-controls" aria-label="3D camera controls"><button type="button" onClick={()=>renderer.current?.rotate(-.25,0)}>Rotate left</button><button type="button" onClick={()=>renderer.current?.rotate(.25,0)}>Rotate right</button><button type="button" onClick={()=>renderer.current?.rotate(0,-.15)}>Tilt up</button><button type="button" onClick={()=>renderer.current?.rotate(0,.15)}>Tilt down</button><button type="button" onClick={()=>renderer.current?.zoom(-.3)}>Zoom in</button><button type="button" onClick={()=>renderer.current?.zoom(.3)}>Zoom out</button><button type="button" onClick={()=>renderer.current?.reset()}>Reset view</button></div>
 </section>
}
