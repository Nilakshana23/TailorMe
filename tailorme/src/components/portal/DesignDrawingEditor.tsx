import {useRef,useState} from 'react'
import type {PointerEvent} from 'react'
import DesignIllustration from './DesignIllustration'
import type {DesignFields} from '../../services/designService'
import {addDrawingStroke,drawingColours,emptyDrawing,validDrawing,validHex,colourPresets,canClose,transformDrawingItem,cleanupDrawing} from '../../utils/designDrawing'
import ColourControl from '../ui/ColourControl'
import type {DesignDrawing,DrawingStroke} from '../../utils/designDrawing'

export default function DesignDrawingEditor({design,onChange,disabled=false}:{design:DesignFields;onChange:(drawing:DesignDrawing)=>void;disabled?:boolean}){
 const [active,setActive]=useState(false),[tool,setTool]=useState<'pen'|'erase'|'select'|'pan'|'rectangle'|'ellipse'>('pen')
 const [colour,setColour]=useState<string>(drawingColours[0]),[width,setWidth]=useState(3)
 const [past,setPast]=useState<DesignDrawing[]>([]),[future,setFuture]=useState<DesignDrawing[]>([])
 const [draft,setDraft]=useState<DrawingStroke|null>(null),[selected,setSelected]=useState<number|null>(null)
 const [confirm,setConfirm]=useState(false),[error,setError]=useState('')
 const [view,setView]=useState({zoom:1,x:0,y:0})
 const [placement,setPlacement]=useState<'garment'|'canvas'>('canvas')
 const [hex,setHex]=useState<string|null>(null),[background,setBackground]=useState('#f3e6ce')
 const [cleanup,setCleanup]=useState<{original:DesignDrawing;strength:'gentle'|'medium';scope:'all'|'selected';indices:number[];consistentWidth:boolean;width:number}|null>(null)
 const [cleanupMessage,setCleanupMessage]=useState('')
 const gesture=useRef<{id:number;stroke:DrawingStroke|null;x:number;y:number;viewX:number;viewY:number}|null>(null)
 const sketch=design.design_kind==='sketch'
 const editing=sketch||active
 const drawing=design.decorations??emptyDrawing()
 const cleanupStale=!!cleanup&&JSON.stringify(cleanup.original)!==JSON.stringify(drawing)
 let cleaned:DesignDrawing|null=null,cleanupError=''
 if(cleanup)try{cleaned=cleanupDrawing(cleanup.original,{strength:cleanup.strength,...(cleanup.scope==='selected'?{indices:cleanup.indices}:{}),...(cleanup.consistentWidth?{width:cleanup.width}:{})})}catch(cause){cleanupError=(cause as Error).message}
 const cleanupChanged=!!cleanup&&!!cleaned&&JSON.stringify(cleanup.original)!==JSON.stringify(cleaned)
 function commit(next:DesignDrawing,keep=false){if(!validDrawing(next)){setError('Invalid artwork. Close only a simple outline; keep shapes, colours and sizes within the canvas limits.');return}gesture.current=null;setDraft(null);setPast([...past.slice(-49),drawing]);setFuture([]);onChange(next);if(!keep)setSelected(null);setError('');setConfirm(false)}
 const item=selected===null?null:drawing.strokes[selected]
 function editItem(patch:Partial<DrawingStroke>){if(selected===null||!item)return;commit({version:2,strokes:drawing.strokes.map((s,i)=>i===selected?{...s,...patch}:s)},true)}
 function layer(delta:number){if(selected===null)return;const next=selected+delta;if(next<0||next>=drawing.strokes.length)return;const strokes=[...drawing.strokes];[strokes[selected],strokes[next]]=[strokes[next],strokes[selected]];commit({...drawing,strokes},true);setSelected(next)}
 function point(event:PointerEvent<HTMLDivElement>):[number,number]{
  const matrix=event.currentTarget.querySelector('svg')?.getScreenCTM()
  if(!matrix)throw new Error('Wait for the illustration to load, then try again.')
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('The current view cannot map that point. Reset the drawing view and try again.')
  return [Math.max(0,Math.min(10000,Math.round(p.x/320*10000))),Math.max(0,Math.min(10000,Math.round(p.y/480*10000)))]
 }
 function cancel(){gesture.current=null;setDraft(null)}
 function move(event:PointerEvent<HTMLDivElement>){
  const start=gesture.current;if(!start||start.id!==event.pointerId||disabled||cleanup)return
  if(!start.stroke){setView(v=>({...v,x:Math.max(-300,Math.min(300,start.viewX+event.clientX-start.x)),y:Math.max(-300,Math.min(300,start.viewY+event.clientY-start.y))}));return}
  try{
   const next=point(event),last=start.stroke.points.at(-1)!
   if(start.stroke.kind==='rectangle'||start.stroke.kind==='ellipse'){start.stroke={...start.stroke,points:[start.stroke.points[0],next]};setDraft(start.stroke);return}
   if(Math.hypot(next[0]-last[0],next[1]-last[1])<15)return
   if(start.stroke.points.length>=256||drawing.strokes.reduce((sum,s)=>sum+s.points.length,0)+start.stroke.points.length>=4096){setError('Stroke point limit reached. Release to finish, then delete a stroke if needed.');return}
   start.stroke={...start.stroke,points:[...start.stroke.points,next]};setDraft(start.stroke)
  }catch(cause){setError((cause as Error).message)}
 }
 let displayDrawing=drawing
 if(draft&&draft.points.length>=2)try{displayDrawing=addDrawingStroke(drawing,draft)}catch{/* Keep a valid canvas while a shape is incomplete. */}
 const display={...design,decorations:displayDrawing}
 return <section className="design-drawing-editor" aria-label="Decorative drawing">
  {!sketch&&<button type="button" className="drawing-mode-button" disabled={disabled} aria-pressed={active} onClick={()=>{cancel();setActive(!active);setConfirm(false)}}>{active?'Finish drawing':'Draw on design'}</button>}
  <p className="text-sm mt-3">{sketch?'Draw your design reference with Pencil, or drag out a Rectangle or Ellipse. Select artwork to fill, move, resize or reorder it.':'Draw embroidery ideas, borders or patterns as visual instructions. Drawings do not change the cut or create automatic embroidery patterns.'}</p>
  {editing?<>
   <fieldset disabled={disabled||!!cleanup} className="drawing-tools"><legend>Drawing tools</legend>
    {sketch&&<button type="button" disabled={!drawing.strokes.length} aria-expanded={!!cleanup} aria-controls="line-cleanup" onClick={()=>{cancel();setConfirm(false);setCleanupMessage('');setCleanup({original:structuredClone(drawing),strength:'gentle',scope:selected===null?'all':'selected',indices:selected===null?[]:[selected],consistentWidth:false,width:3})}}>Line cleanup</button>}
    {design.design_kind!=='sketch'&&<><label htmlFor="drawing-placement">Drawing mode (new items)</label><select id="drawing-placement" value={placement} onChange={event=>{cancel();setPlacement(event.target.value as 'garment'|'canvas')}}><option value="garment">On garment</option><option value="canvas">Anywhere on canvas</option></select></>}
    <div className="photo-actions">{(['pen','erase','select','rectangle','ellipse','pan'] as const).map(value=><button type="button" key={value} aria-pressed={tool===value} onClick={()=>{cancel();setTool(value);setConfirm(false)}}>{value==='pen'?'Pencil':value==='erase'?'Erase item':value==='select'?'Select artwork':value==='pan'?'Zoom/Pan':value==='rectangle'?'Rectangle':'Ellipse'}</button>)}</div>
    <label htmlFor="drawing-colour">Pen colour</label><select id="drawing-colour" value={colour} onChange={event=>{setColour(event.target.value);setHex(null)}}>{!colourPresets.some(([,value])=>value===colour)&&<option value={colour}>Custom {colour}</option>}{colourPresets.map(([name,value])=><option key={value} value={value}>{name}</option>)}</select>
    <label htmlFor="drawing-custom-colour">Custom pen colour</label><input id="drawing-custom-colour" type="color" value={colour} onChange={event=>{setColour(event.target.value);setHex(null)}}/>
    <label htmlFor="drawing-hex">Pen HEX (#RRGGBB)</label><input id="drawing-hex" value={hex??colour} maxLength={7} aria-invalid={hex!==null&&!validHex(hex)} onChange={event=>{setHex(event.target.value);if(validHex(event.target.value))setColour(event.target.value)}}/>{hex!==null&&!validHex(hex)&&<p role="status">Enter #RRGGBB; the last valid pen colour is kept.</p>}
    <p className="text-sm">Actual fabric colours may differ from the screen. Garment fill, pen and shape fill are separate. Closed shapes use a chosen fill; this is not a paint-bucket tool.</p>
    <label htmlFor="drawing-width">Stroke width: {width}</label><input id="drawing-width" type="range" min="1" max="12" step="1" value={width} onChange={event=>setWidth(Number(event.target.value))}/>
    <label htmlFor="drawing-selected">Select a stroke or shape</label><select id="drawing-selected" value={selected??''} onChange={event=>setSelected(event.target.value===''?null:Number(event.target.value))}><option value="">No item selected</option>{drawing.strokes.map((stroke,i)=><option key={i} value={i}>{stroke.kind==='rectangle'?'Rectangle':stroke.kind==='ellipse'?'Ellipse':stroke.closed?'Closed outline':'Stroke'} {i+1} · {stroke.mode==='canvas'?'Anywhere on canvas':'On garment'} · {stroke.points.length} points · {stroke.colour}</option>)}</select>
    {item&&<><ColourControl key={`outline-${selected}`} id="selected-outline" label="Selected item outline" value={item.colour} onChange={value=>editItem({colour:value})}/><label htmlFor="selected-stroke-width">Selected item stroke width</label><input id="selected-stroke-width" type="range" min="1" max="12" value={item.width} onChange={event=>editItem({width:Number(event.target.value)})}/>
     <button type="button" disabled={!!item.closed||item.kind==='rectangle'||item.kind==='ellipse'||!canClose(item.points)} onClick={()=>editItem({closed:true,fill:null})}>Close shape</button>
     {(item.closed||item.kind==='rectangle'||item.kind==='ellipse')&&<><ColourControl key={`fill-${selected}`} id="selected-fill" label="Selected shape fill" empty={!item.fill} value={item.fill??'#f3e6ce'} onChange={value=>editItem({fill:value})}/><button type="button" onClick={()=>editItem({fill:null})}>Remove fill</button>
      {(['x','y','width','height'] as const).map(axis=>{const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,value=axis==='x'?x:axis==='y'?y:axis==='width'?w:h;return <div key={axis}><label htmlFor={`selected-${axis}`}>Selected shape {axis}: {value/100}% of canvas</label><input id={`selected-${axis}`} type="range" min={axis==='width'||axis==='height'?1:0} max={axis==='x'?10000-w:axis==='y'?10000-h:axis==='width'?10000-x:10000-y} value={value} onChange={event=>{try{const n=Number(event.target.value),next=transformDrawingItem(item,axis==='x'?n:x,axis==='y'?n:y,axis==='width'?n:w,axis==='height'?n:h);editItem(next)}catch(cause){setError((cause as Error).message)}}}/></div>})}
     </>}
     <button type="button" disabled={selected===0} onClick={()=>layer(-1)}>Send backward</button><button type="button" disabled={selected===drawing.strokes.length-1} onClick={()=>layer(1)}>Bring forward</button>
    </>}
    <div className="photo-actions"><button type="button" disabled={selected===null||!drawing.strokes[selected]} onClick={()=>commit({...drawing,strokes:drawing.strokes.filter((_,i)=>i!==selected)})}>Delete selected item</button><button type="button" disabled={!past.length} onClick={()=>{cancel();onChange(past.at(-1)!);setPast(past.slice(0,-1));setFuture([drawing,...future]);setSelected(null);setConfirm(false)}}>Undo drawing</button><button type="button" disabled={!future.length} onClick={()=>{cancel();onChange(future[0]);setPast([...past.slice(-49),drawing]);setFuture(future.slice(1));setSelected(null);setConfirm(false)}}>Redo drawing</button><button type="button" disabled={!drawing.strokes.length} onClick={()=>setConfirm(true)}>Clear drawings</button></div>
    {confirm&&<div role="group" aria-label="Confirm clearing drawings"><p>Clear all artwork? You can undo this change.</p><button type="button" onClick={()=>commit(emptyDrawing(design.design_kind==='sketch'?2:drawing.version))}>Confirm clear drawings</button><button type="button" onClick={()=>setConfirm(false)}>Keep drawings</button></div>}
    <label htmlFor="drawing-zoom">Zoom: {Math.round(view.zoom*100)}%</label><input id="drawing-zoom" type="range" min="1" max="3" step="0.1" value={view.zoom} onChange={event=>{cancel();setView({...view,zoom:Number(event.target.value)})}}/>
    {(['x','y'] as const).map(axis=><div key={axis}><label htmlFor={`drawing-pan-${axis}`}>Pan {axis==='x'?'horizontally':'vertically'}: {view[axis]}</label><input id={`drawing-pan-${axis}`} type="range" min="-300" max="300" value={view[axis]} onChange={event=>{cancel();setView({...view,[axis]:Number(event.target.value)})}}/></div>)}
    <button type="button" onClick={()=>{cancel();setView({zoom:1,x:0,y:0})}}>Reset drawing view</button>
    <label htmlFor="drawing-background">Canvas background (view only; not artwork)</label><input id="drawing-background" type="color" value={background} onChange={event=>setBackground(event.target.value)}/>
   </fieldset>
   {sketch&&cleanup&&<section id="line-cleanup" className="line-cleanup" aria-labelledby="line-cleanup-title">
    <h3 id="line-cleanup-title" className="font-display-lg text-headline-sm">Line cleanup</h3>
    <p>Local line smoothing and point simplification. Endpoints, corners and small marks are protected. Separate strokes stay separate. Closed outlines, fills, rectangles and ellipses keep their geometry. Inspect the preview before applying.</p>
    <fieldset disabled={disabled}><legend>Cleanup settings</legend>
     <label htmlFor="cleanup-strength">Smoothing</label><select id="cleanup-strength" value={cleanup.strength} onChange={event=>setCleanup({...cleanup,strength:event.target.value as 'gentle'|'medium'})}><option value="gentle">Gentle</option><option value="medium">Medium</option></select>
     <label htmlFor="cleanup-scope">Apply cleanup to</label><select id="cleanup-scope" value={cleanup.scope} onChange={event=>setCleanup({...cleanup,scope:event.target.value as 'all'|'selected'})}><option value="all">Whole sketch</option><option value="selected">Selected strokes or shapes</option></select>
     {cleanup.scope==='selected'&&<fieldset><legend>Choose items to clean</legend>{cleanup.original.strokes.map((s,i)=><label key={i} className="cleanup-checkbox"><input type="checkbox" checked={cleanup.indices.includes(i)} onChange={event=>setCleanup({...cleanup,indices:event.target.checked?[...cleanup.indices,i]:cleanup.indices.filter(index=>index!==i)})}/>{s.kind==='rectangle'?'Rectangle':s.kind==='ellipse'?'Ellipse':s.closed?'Closed outline':'Stroke'} {i+1}</label>)}</fieldset>}
     <label className="cleanup-checkbox"><input id="cleanup-consistent-width" type="checkbox" checked={cleanup.consistentWidth} onChange={event=>setCleanup({...cleanup,consistentWidth:event.target.checked})}/>Use a consistent outline width for targeted items</label>
     {cleanup.consistentWidth&&<><label htmlFor="cleanup-width">Outline width: {cleanup.width}</label><input id="cleanup-width" type="range" min="1" max="12" step="1" value={cleanup.width} onChange={event=>setCleanup({...cleanup,width:Number(event.target.value)})}/></>}
    </fieldset>
    <div className="line-cleanup-previews"><div><h4>Before (original)</h4><DesignIllustration design={{...design,decorations:cleanup.original}} illustrationOnly canvasBackground={background}/></div><div><h4>After (preview)</h4>{cleaned&&<DesignIllustration design={{...design,decorations:cleaned}} illustrationOnly canvasBackground={background}/>}</div></div>
    <p role="status">{cleaned?`${cleanup.original.strokes.reduce((sum,s)=>sum+s.points.length,0)} original points; ${cleaned.strokes.reduce((sum,s)=>sum+s.points.length,0)} preview points. `:''}{cleanupChanged?'Original kept until Apply. Apply is one undoable action.':'No changes at these settings. Small details and protected outlines may stay unchanged.'}</p>
    {cleanupStale&&<p role="alert">The artwork changed outside this preview. Cancel and reopen Line cleanup.</p>}{cleanupError&&<p role="alert">{cleanupError}</p>}
    <div className="photo-actions"><button type="button" disabled={disabled||cleanupStale||!cleanupChanged||!!cleanupError} onClick={()=>{if(!cleaned||cleanupStale||disabled)return;commit(cleaned);setCleanup(null);setCleanupMessage('Line cleanup applied. Undo drawing restores the original.')}}>Apply line cleanup</button><button type="button" onClick={()=>{setCleanup(null);setCleanupMessage('Line cleanup cancelled. Original artwork kept.')}}>Cancel line cleanup</button></div>
   </section>}
   {sketch&&<p className="line-cleanup-status text-sm" role="status">{cleanupMessage}</p>}
   <p id="drawing-help" role="status" className="text-sm mt-3">{tool==='pen'?'Pencil mode: drag to draw.':tool==='erase'?'Erase item: tap a stroke or shape to remove the whole item. Undo restores it.':tool==='pan'?'Pan mode: drag to move the view; no strokes are added.':tool==='rectangle'||tool==='ellipse'?`${tool==='rectangle'?'Rectangle':'Ellipse'} mode: drag between opposite corners. Select the shape to fill, move or resize it.`:`Select mode: tap a visible item or choose it from the list.${selected===null?'':` Item ${selected+1} selected.`}`} {sketch?'Blank sketch: artwork stays on the canvas.':placement==='canvas'?'Anywhere on canvas: new strokes can extend outside the garment for arrows and annotations.':'On garment: new strokes are clipped to the garment silhouette.'} Existing strokes keep their own mode. Use zoom and pan to inspect details.</p>
   <div className={`drawing-canvas drawing-tool-${tool}`} aria-label={design.design_kind==='sketch'?'Blank sketch drawing canvas':'Garment drawing canvas'} aria-describedby="drawing-help" onPointerDown={event=>{
    if(disabled||cleanup||!event.isPrimary||event.button!==0)return
    if(tool==='erase'){event.preventDefault();const index=(event.target as Element)?.closest?.('[data-drawing-stroke]')?.getAttribute('data-drawing-stroke');if(index!==null&&index!==undefined)commit({...drawing,strokes:drawing.strokes.filter((_,i)=>i!==Number(index))});return}
    if(tool==='select'){const index=(event.target as Element)?.closest?.('[data-drawing-stroke]')?.getAttribute('data-drawing-stroke');setSelected(index===null||index===undefined?null:Number(index));return}
    if(tool!=='pan'&&(drawing.strokes.length>=32||drawing.strokes.reduce((sum,s)=>sum+s.points.length,0)>=4096)){setError('Drawing limit reached. Delete a stroke or undo before adding another.');return}
    try{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const p=point(event),stroke:DrawingStroke|null=tool==='pan'?null:{mode:design.design_kind==='sketch'?'canvas':placement,colour,width,points:tool==='rectangle'||tool==='ellipse'?[p,p]:[p],...(tool==='rectangle'||tool==='ellipse'?{kind:tool,fill:null}:{})};gesture.current={id:event.pointerId,stroke,x:event.clientX,y:event.clientY,viewX:view.x,viewY:view.y};setDraft(stroke);setError('')}catch(cause){setError((cause as Error).message)}
   }} onPointerMove={move} onPointerUp={event=>{
    if(gesture.current?.id!==event.pointerId)return
    move(event);const stroke=gesture.current?.stroke;cancel()
    if(stroke&&stroke.points.length>=2&&!disabled)try{commit(addDrawingStroke(drawing,stroke))}catch(cause){setError((cause as Error).message)}
   }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
    <div className="drawing-view" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}><DesignIllustration design={display} illustrationOnly selectedDrawingStroke={selected} canvasBackground={background}/></div>
   </div><p role="alert" className="text-error mt-3">{error}</p>
  </>:<DesignIllustration design={design}/>}
 </section>
}
