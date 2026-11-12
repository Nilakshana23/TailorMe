import type {DesignFields} from '../services/designService'
import {customNecklinePath,presetNecklinePath,validNeckline} from './necklineGeometry'
import {garmentHem,sampleIllustrationPath,warpIllustrationPath,warpPoint,trouserLegDimensions} from './stylingAlignment'
import type {Point,PreviewWarp} from './stylingAlignment'

export type ShapeSide={shoulder:number;underarm:number;waist:number;hem:number;sleeveWidth:number;sleeveLength:number}
export type PreviewShape={left:ShapeSide;right:ShapeSide;underarmY:number;waistY:number;hemY:number}
export type ShapeControl={key:string;label:string;min:number;max:number;value:number}
export type ShapeHandle={key:string;label:string;point:Point}
export function shapeKey(design:DesignFields){return `${design.garment_type}:${design.sleeve}:${design.length}:${JSON.stringify(design.garment_options??{})}`}
export function defaultPreviewShape(design:DesignFields):PreviewShape {
 const blouse=design.garment_type==='blouse',hemY=garmentHem(design)
 const side={shoulder:40,underarm:30,waist:blouse?30+5*30/(hemY-130):30,hem:blouse?35:75,sleeveWidth:design.sleeve==='short'?38:40,sleeveLength:design.sleeve==='short'?76.5:180}
 if(design.garment_type==='shirt'){side.waist=34;side.underarm=34;side.hem=42}
 if(design.garment_type==='kurti')side.hem=55
 if(design.garment_type==='salwar_top'){side.waist=32;side.hem=50}
 return {left:{...side},right:{...side},underarmY:130,waistY:design.garment_type==='skirt'?140:blouse?160:design.garment_type==='shirt'?180:195,hemY}
}
export function shapeControls(shape:PreviewShape,design:DesignFields):ShapeControl[]{
 if(design.garment_type==='trousers')return []
 const skirt=design.garment_type==='skirt',sleeves=!skirt&&['short','long'].includes(design.sleeve)
 const controls:ShapeControl[]=[]
 for(const side of ['left','right'] as const){
  const label=side==='left'?'Left':'Right'
  for(const [key,name,min,max] of [['shoulder','shoulder width',28,50],['underarm','underarm width',18,35],['waist','torso width',15,50],['hem','hem width',20,105],['sleeveWidth','sleeve width',16,56],['sleeveLength','sleeve length',60,285]] as const){
   if((skirt&&(key==='shoulder'||key==='underarm'))||(!sleeves&&(key==='sleeveWidth'||key==='sleeveLength')))continue
   controls.push({key:`${side}.${key}`,label:`${label} ${name}`,min,max,value:shape[side][key]})
  }
 }
 if(!skirt)controls.push({key:'underarmY',label:'Underarm depth',min:130,max:160,value:shape.underarmY})
 controls.push({key:'waistY',label:skirt?'Waist position':'Torso length to waist',min:skirt?125:design.garment_type==='blouse'?Math.max(155,shape.underarmY+15):Math.max(175,shape.underarmY+15),max:Math.min(225,shape.hemY-30),value:shape.waistY})
 controls.push({key:'hemY',label:'Garment length to hem',min:Math.max(skirt?230:design.garment_type==='blouse'?195:design.garment_type==='shirt'?230:260,shape.waistY+30),max:455,value:shape.hemY})
 return controls
}
export function shapedGarmentPaths(design:DesignFields,shape:PreviewShape){
 if(design.garment_type==='trousers'){
  const h=design.refinement_geometry?shape.hemY:garmentHem(design),base=trouserLegDimensions(design),outer=design.refinement_geometry?shape.left.hem:base.outer,inner=design.refinement_geometry?Math.max(8,outer*base.inner/base.outer):base.inner,waist=design.refinement_geometry?shape.left.waist:40
  const body=`M${160-waist} 140 H${160+waist} L${170+waist} 220 L${160+outer} ${h} L${160+inner} ${h} L160 260 L${160-inner} ${h} L${160-outer} ${h} L${150-waist} 220Z`
  return {body,sleeves:[],seam:`M${160-waist} 155 H${160+waist}`,details:design.garment_options?.waist_style==='elastic'?['M123 143 L127 152 L131 143 L135 152 L139 143 L143 152 L147 143 L151 152 L155 143 L159 152 L163 143 L167 152 L171 143 L175 152 L179 143 L183 152 L187 143 L191 152 L195 143']:['M160 155 L160 225','M120 160 L135 185','M200 160 L185 185'],filledDetails:[]}
 }
 const {left:l,right:r,underarmY:u,waistY:w,hemY:h}=shape
 const skirt=design.garment_type==='skirt'
 const neck=validNeckline(design.custom_neckline)&&(design.format_version===2||design.format_version===3)?customNecklinePath(design.custom_neckline):presetNecklinePath(design.neckline)
 let body=skirt?`M${160-l.waist} ${w} L${160+r.waist} ${w} L${160+r.hem} ${h} L${160-l.hem} ${h} L${160-l.waist} ${w}Z`:
  `M${160-l.shoulder} 65 L143 65 ${neck} L${160+r.shoulder} 65 Q${162+r.shoulder} 100 ${160+r.underarm} ${u} L${160+r.waist} ${w} L${160+r.hem} ${h} L${160-l.hem} ${h} L${160-l.waist} ${w} L${160-l.underarm} ${u} Q${158-l.shoulder} 100 ${160-l.shoulder} 65Z`
 const sleeves:string[]=[]
 if(!skirt&&['short','long'].includes(design.sleeve))for(const side of ['left','right'] as const){
  const value=shape[side],sign=side==='left'?-1:1,shoulder=160+sign*value.shoulder
  const centre=shoulder+sign*(design.sleeve==='short'?36:45),cy=65+value.sleeveLength,tilt=design.sleeve==='short'?6.5:5
  sleeves.push(`M${shoulder} 65 L${shoulder+sign*35} ${design.sleeve==='short'?78:90} L${centre+sign*value.sleeveWidth/2} ${cy-tilt} L${centre-sign*value.sleeveWidth/2} ${cy+tilt} L${160+sign*value.underarm} ${u-15}Z`)
 }
 const seam=skirt?`M${160-l.waist-(l.hem-l.waist)*15/(h-w)} ${w+15} H${160+r.waist+(r.hem-r.waist)*15/(h-w)}`:design.garment_type==='dress'?`M${160-l.waist} ${w} H${160+r.waist}`:null
 const details=design.garment_type==='blouse'?[]:[`M145 ${skirt?w+15:w+5} L${160-l.hem*0.4} ${h-10}`,`M175 ${skirt?w+15:w+5} L${160+r.hem*0.4} ${h-10}`]
 const filledDetails:string[]=[]
 if(['shirt','kurti','salwar_top'].includes(design.garment_type)){
  const right=160+r.hem,left=160-l.hem,slit=['kurti','salwar_top'].includes(design.garment_type)?Math.min(design.garment_options?.side_slits==='long'?80:design.garment_options?.side_slits==='short'?40:0,(h-w)*0.6):0
  const rightPeak=Math.min(right-8,160+r.waist+(r.hem-r.waist)*(h-slit-w)/(h-w)-4)
  const leftPeak=Math.max(left+8,160-l.waist-(l.hem-l.waist)*(h-slit-w)/(h-w)+4)
  const bottom=design.garment_type==='shirt'||design.garment_type==='salwar_top'?`Q160 ${h+12} ${left+(slit?16:0)} ${h}`:`L${left+(slit?16:0)} ${h}`
  body=`M${160-l.shoulder} 65 L143 65 ${neck} L${160+r.shoulder} 65 Q${162+r.shoulder} 100 ${160+r.underarm} ${u} L${160+r.waist} ${w} L${right} ${h} ${slit?`L${rightPeak} ${h-slit} L${right-16} ${h}`:''} ${bottom} ${slit?`L${leftPeak} ${h-slit} L${left} ${h}`:''} L${160-l.waist} ${w} L${160-l.underarm} ${u} Q${158-l.shoulder} 100 ${160-l.shoulder} 65Z`
  details.length=0
  if(design.garment_type==='shirt'){
   details.push(`M157 100 L157 ${h-12}`,`M163 100 L163 ${h-12}`)
   if(design.collar_style==null&&design.garment_options?.collar==='point')filledDetails.push('M143 65 L160 85 L150 102 L135 75Z','M177 65 L160 85 L170 102 L185 75Z')
   if(design.collar_style==null&&design.garment_options?.collar==='band')filledDetails.push('M143 65 Q160 55 177 65 L177 75 Q160 65 143 75Z')
  }else details.push(`M150 135 L145 ${Math.min(w+50,h-30)}`,`M170 135 L175 ${Math.min(w+50,h-30)}`)
 }
 return {body,sleeves,seam,details,filledDetails}
}
export function shapeHandles(shape:PreviewShape,design:DesignFields):ShapeHandle[]{
 if(design.garment_type==='trousers')return []
 const handles:ShapeHandle[]=[]
 for(const side of ['left','right'] as const){
  const value=shape[side],sign=side==='left'?-1:1,label=side==='left'?'Left':'Right'
  if(design.garment_type!=='skirt'){
   handles.push({key:`${side}.shoulder`,label:`${label} shoulder`,point:{x:160+sign*value.shoulder,y:65}},{key:`${side}.underarm`,label:`${label} underarm`,point:{x:160+sign*value.underarm,y:shape.underarmY}})
   if(['short','long'].includes(design.sleeve))handles.push({key:`${side}.sleeve`,label:`${label} sleeve end`,point:{x:160+sign*(value.shoulder+(design.sleeve==='short'?36:45)+value.sleeveWidth/2),y:65+value.sleeveLength-(design.sleeve==='short'?6.5:5)}})
  }
  handles.push({key:`${side}.waist`,label:`${label} waist`,point:{x:160+sign*value.waist,y:shape.waistY}},{key:`${side}.hem`,label:`${label} hem`,point:{x:160+sign*value.hem,y:shape.hemY}})
 }
 return handles
}
function outlinePoints(path:string):Point[]{
 const tokens=path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)??[]
 const points:Point[]=[]
 for(let i=0;i<tokens.length;i+=2){const p={x:Number(tokens[i]),y:Number(tokens[i+1])};if(!points.length||Math.hypot(p.x-points.at(-1)!.x,p.y-points.at(-1)!.y)>1e-7)points.push(p)}
 if(points.length>1&&Math.hypot(points[0].x-points.at(-1)!.x,points[0].y-points.at(-1)!.y)<1e-7)points.pop()
 return points
}
export function simpleOutline(points:Point[]):boolean {
 if(points.length<3||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false
 const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
 const on=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7
 for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
  if(i===0&&j===points.length-1)continue
  const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length]
  if(Math.max(a.x,b.x)+1e-7<Math.min(c.x,d.x)||Math.max(c.x,d.x)+1e-7<Math.min(a.x,b.x)||Math.max(a.y,b.y)+1e-7<Math.min(c.y,d.y)||Math.max(c.y,d.y)+1e-7<Math.min(a.y,b.y))continue
  if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false
 }
 let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y}
 return Math.abs(area)>0.01
}
export function validatePreviewShape(shape:PreviewShape,design:DesignFields,warp:PreviewWarp|null=null):string {
 if(design.garment_type==='trousers')return 'Use trouser leg options and photo alignment; torso shape editing is unavailable for trousers.'
 if(!shape||!shape.left||!shape.right)return 'Unsupported preview shape.'
 for(const control of shapeControls(shape,design))if(!Number.isFinite(control.value)||control.value<control.min-1e-7||control.value>control.max+1e-7)return `${control.label} must stay between ${control.min} and ${control.max} illustration units.`
 if(design.garment_type!=='skirt'&&shape.waistY<shape.underarmY+15)return 'Keep the waist below the underarms.'
 const paths=shapedGarmentPaths(design,shape)
 for(const path of [paths.body,...paths.sleeves]){
  if(!simpleOutline(outlinePoints(sampleIllustrationPath(path)))||(warp&&!simpleOutline(outlinePoints(warpIllustrationPath(path,warp)))))return 'This adjustment would fold or cross the garment outline. Move the handle less or adjust the photo alignment first.'
 }
 return ''
}
export function changeShape(shape:PreviewShape,key:string,value:number,symmetric:boolean,design:DesignFields,warp:PreviewWarp|null=null):PreviewShape {
 if(!shapeControls(shape,design).some(control=>control.key===key))throw new Error('This control is unavailable for this garment.')
 const next:PreviewShape={...shape,left:{...shape.left},right:{...shape.right}}
 if(key.includes('.')){
  const [side,field]=key.split('.') as ['left'|'right',keyof ShapeSide]
  next[side][field]=value
  if(symmetric)next[side==='left'?'right':'left'][field]=value
 }else next[key as 'underarmY'|'waistY'|'hemY']=value
 const error=validatePreviewShape(next,design,warp)
 if(error)throw new Error(error)
 return next
}
export function dragShape(shape:PreviewShape,key:string,point:Point,symmetric:boolean,design:DesignFields,warp:PreviewWarp|null=null):PreviewShape {
 if(!shapeHandles(shape,design).some(handle=>handle.key===key))throw new Error('This handle is unavailable for this garment.')
 const [side,field]=key.split('.') as ['left'|'right',string],sign=side==='left'?-1:1
 const next:PreviewShape={...shape,left:{...shape.left},right:{...shape.right}}
 const rounded=(value:number)=>Math.round(value*10)/10
 if(field==='sleeve'){
  next[side].sleeveWidth=rounded(2*(sign*(point.x-160)-shape[side].shoulder-(design.sleeve==='short'?36:45)))
  next[side].sleeveLength=rounded(point.y-65+(design.sleeve==='short'?6.5:5))
  if(symmetric){next[side==='left'?'right':'left'].sleeveWidth=next[side].sleeveWidth;next[side==='left'?'right':'left'].sleeveLength=next[side].sleeveLength}
 }else{
  next[side][field as 'shoulder'|'underarm'|'waist'|'hem']=rounded(sign*(point.x-160))
  if(symmetric)next[side==='left'?'right':'left'][field as 'shoulder'|'underarm'|'waist'|'hem']=next[side][field as 'shoulder'|'underarm'|'waist'|'hem']
  if(field==='underarm')next.underarmY=rounded(point.y)
  if(field==='waist')next.waistY=rounded(point.y)
  if(field==='hem')next.hemY=rounded(point.y)
 }
 const error=validatePreviewShape(next,design,warp);if(error)throw new Error(error)
 return next
}
export function inverseWarpPoint(target:Point,warp:PreviewWarp,seed:Point):Point {
 let p={...seed}
 for(let i=0;i<20;i++){
  const current=warpPoint(p,warp),ex=target.x-current.x,ey=target.y-current.y
  if(Math.hypot(ex,ey)<0.005)return p
  const px=warpPoint({x:p.x+0.01,y:p.y},warp),py=warpPoint({x:p.x,y:p.y+0.01},warp)
  const a=(px.x-current.x)/0.01,b=(py.x-current.x)/0.01,c=(px.y-current.y)/0.01,d=(py.y-current.y)/0.01,det=a*d-b*c
  if(Math.abs(det)<1e-9)break
  p={x:p.x+(ex*d-ey*b)/det,y:p.y+(ey*a-ex*c)/det}
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>320||p.y<0||p.y>480)break
 }
 throw new Error('This alignment leaves no room to move that handle. Use the shape sliders or adjust the alignment.')
}
