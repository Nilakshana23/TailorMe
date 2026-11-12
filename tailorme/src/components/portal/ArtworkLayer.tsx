import {drawingOutline} from '../../utils/designDrawing'
import type {DesignDrawing} from '../../utils/designDrawing'
import {warpPoint} from '../../utils/stylingAlignment'
import type {PreviewWarp} from '../../utils/stylingAlignment'
export default function ArtworkLayer({drawing,clipId,warp=null,selected=null}:{drawing:DesignDrawing;clipId?:string;warp?:PreviewWarp|null;selected?:number|null}){
 return <g fill="none" strokeLinecap="round" strokeLinejoin="round" aria-label={`${drawing.strokes.length} artwork items`}>{drawing.strokes.map((item,index)=>{
  const points=drawingOutline(item).map(([x,y])=>{const p={x:x*320/10000,y:y*480/10000},point=warp?warpPoint(p,warp):p;return `${point.x},${point.y}`}).join(' ')
  const props={'data-drawing-stroke':index,className:selected===index?'drawing-stroke-selected':undefined,points,stroke:item.colour,strokeWidth:item.width*(warp?0.3125:1),fill:item.fill??'none'}
  return <g key={index} data-drawing-mode={item.mode??'garment'} clipPath={item.mode!=='canvas'&&clipId?`url(#${clipId})`:undefined}>{item.closed||item.kind==='rectangle'||item.kind==='ellipse'?<polygon {...props}/>:<polyline {...props}/>}</g>
 })}</g>
}
