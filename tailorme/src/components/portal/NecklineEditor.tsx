import {useRef,useState} from 'react'
import type {PointerEvent} from 'react'
import type {DesignFields} from '../../services/designService'
import {changeNecklineDepth,customNecklinePath,drawingToNeckline,initialNeckline,necklineX,presetNecklinePath,validNeckline} from '../../utils/necklineGeometry'
import type {CustomNeckline,NecklinePoint} from '../../utils/necklineGeometry'

export default function NecklineEditor({design,onApply,disabled=false}:{design:DesignFields;onApply:(geometry:CustomNeckline|null)=>void;disabled?:boolean}) {
 const [editing,setEditing]=useState(false)
 const [history,setHistory]=useState<CustomNeckline[]>([])
 const [position,setPosition]=useState(0)
 const [symmetric,setSymmetric]=useState(true)
 const [error,setError]=useState('')
 const [stroke,setStroke]=useState<NecklinePoint[]>([])
 const [draft,setDraft]=useState<CustomNeckline|null>(null)
 const gesture=useRef<{id:number;index:number|null;points:NecklinePoint[];candidate:CustomNeckline|null;invalid:boolean}|null>(null)
 const current=draft??history[position]??initialNeckline(design.neckline)
 function commit(value:CustomNeckline){setHistory(old=>[...old.slice(0,position+1),value]);setPosition(position+1);setError('')}
 function start(){const initial=validNeckline(design.custom_neckline)?design.custom_neckline:initialNeckline(design.neckline);setHistory([initial]);setSymmetric(initial.depths[1]===initial.depths[3]);setPosition(0);setError('');setStroke([]);setDraft(null);gesture.current=null;setEditing(true)}
 function point(event:PointerEvent<SVGSVGElement>):NecklinePoint {
  const matrix=event.currentTarget.getScreenCTM()
  if(!matrix) return {x:NaN,y:NaN}
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
  return {x:p.x,y:p.y}
 }
 function finish(cancel=false){
  const active=gesture.current
  gesture.current=null;setStroke([]);setDraft(null)
  if(!active||cancel)return
  try {
   if(active.invalid)throw new Error('Keep the whole drawing and control points inside the marked region. The previous curve is preserved.')
   const result=active.index===null?drawingToNeckline(active.points,symmetric):active.candidate
   if(result)commit(result)
  }catch(cause){setError((cause as Error).message)}
 }
 if(['skirt','trousers'].includes(design.garment_type)||(design.garment_type==='shirt'&&design.garment_options?.collar!=='none'))return null
 return <fieldset disabled={disabled} className="neckline-editor">
  <legend className="font-semibold">Custom neckline</legend>
  {!editing?<><p className="text-sm">{design.custom_neckline?'Custom curve applied.':'Using a preset neckline.'}</p><button type="button" onClick={start}>Edit neckline</button>{design.custom_neckline&&<button type="button" onClick={()=>onApply(null)}>Reset to {design.neckline} preset</button>}</>:<>
   <p id="neckline-help">Draw left to right between the two shoulder anchors inside the shaded region. The dashed line is the current neckline guide. Drag the three control points vertically, or use the depth controls. Apply replaces the garment cutout.</p>
   <label className="neckline-symmetry"><input type="checkbox" checked={symmetric} onChange={event=>{
    const checked=event.target.checked;setSymmetric(checked)
    if(checked)commit(changeNecklineDepth(current,1,(current.depths[1]+current.depths[3])/2,true))
   }}/> Symmetric neckline</label>
   <svg className="neckline-canvas" viewBox="135 55 50 75" aria-label="Neckline drawing region" aria-describedby="neckline-help" onPointerDown={event=>{
    if(disabled||!event.isPrimary||event.button!==0)return
    const p=point(event),target=event.target as SVGElement
    const index=target.dataset.control?Number(target.dataset.control):null
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current={id:event.pointerId,index,points:[p],candidate:null,invalid:false}
    setError('');if(index===null)setStroke([p])
   }} onPointerMove={event=>{
    const active=gesture.current
    if(!active||active.id!==event.pointerId)return
    const p=point(event)
    if(p.x<143||p.x>177||p.y<65||p.y>120||!Number.isFinite(p.y)){active.invalid=true;return}
    if(active.index===null){
     if(active.points.length>=2048){active.invalid=true;return}
     active.points.push(p);setStroke([...active.points])
    }else try{active.candidate=changeNecklineDepth(current,active.index,p.y,symmetric);setDraft(active.candidate)}catch{active.invalid=true}
   }} onPointerUp={event=>{
    const active=gesture.current
    if(!active||active.id!==event.pointerId)return
    if(active.index===null){if(active.points.length>=2048)active.invalid=true;else active.points.push(point(event))}
    finish()
   }} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish(true)}>
    <rect x="143" y="65" width="34" height="55" fill="#f3e6ce" stroke="#735c00" strokeWidth=".3"/>
    <path d={`M143 65 ${validNeckline(design.custom_neckline)?customNecklinePath(design.custom_neckline):presetNecklinePath(design.neckline)}`} stroke="#6b6262" strokeDasharray="1 1" strokeWidth=".5" fill="none" pointerEvents="none"/>
    <path d={`M143 65 ${customNecklinePath(current)}`} fill="none" stroke="#243c63" strokeWidth=".7" pointerEvents="none"/>
    {stroke.length>0&&<polyline points={stroke.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#a8324a" strokeWidth=".5" pointerEvents="none"/>}
    {necklineX.map((x,i)=><circle key={i} cx={x} cy={current.depths[i]} r={i===0||i===4?1:1.6} fill={i===0||i===4?'#735c00':'#243c63'} data-control={i>0&&i<4?i:undefined}/>)}
   </svg>
   <div className="neckline-depths">{[1,2,3].map(i=><div key={i}><label htmlFor={`neckline-depth-${i}`}>Point {i} depth: {current.depths[i]}</label><input id={`neckline-depth-${i}`} type="range" min="65" max="120" step="0.1" value={current.depths[i]} onChange={event=>{try{commit(changeNecklineDepth(current,i,Number(event.target.value),symmetric))}catch(cause){setError((cause as Error).message)}}}/></div>)}</div>
   <div className="neckline-actions"><button type="button" disabled={position===0} onClick={()=>{setPosition(position-1);setError('')}}>Undo</button><button type="button" disabled={position===history.length-1} onClick={()=>{setPosition(position+1);setError('')}}>Redo</button><button type="button" onClick={()=>{if(validNeckline(current)){onApply(current);setEditing(false)}}}>Apply neckline</button><button type="button" onClick={()=>{gesture.current=null;setEditing(false);setError('')}}>Cancel</button><button type="button" onClick={()=>{onApply(null);setEditing(false);setError('')}}>Reset to {design.neckline} preset</button></div>
   <p role="alert" className="text-error">{error}</p>
  </>}
 </fieldset>
}
