import type {DesignFields} from '../services/designService'
export type Point={x:number;y:number}
export type Landmark='leftShoulder'|'rightShoulder'|'leftWaist'|'rightWaist'|'leftHip'|'rightHip'|'hem'|'leftHem'|'rightHem'
export type AlignmentPoints=Partial<Record<Landmark,Point>>
export const landmarkLabels:Record<Landmark,string>={leftShoulder:'Photo-left shoulder',rightShoulder:'Photo-right shoulder',leftWaist:'Photo-left waist',rightWaist:'Photo-right waist',leftHip:'Photo-left hip',rightHip:'Photo-right hip',hem:'Desired hem centre',leftHem:'Photo-left outer leg hem',rightHem:'Photo-right outer leg hem'}
export function alignmentLandmarks(type:DesignFields['garment_type']):Landmark[]{
 return ['dress','kurti','salwar_top'].includes(type)?['leftShoulder','rightShoulder','leftWaist','rightWaist','leftHip','rightHip','hem']:['blouse','shirt'].includes(type)?['leftShoulder','rightShoulder','leftWaist','rightWaist','hem']:type==='trousers'?['leftWaist','rightWaist','leftHip','rightHip','leftHem','rightHem']:['leftWaist','rightWaist','leftHip','rightHip','hem']
}
export function validateAlignment(points:AlignmentPoints,type:DesignFields['garment_type']):string {
 const keys=alignmentLandmarks(type)
 for(const key of Object.keys(points) as Landmark[]){
  const p=points[key]
  if(!keys.includes(key)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>100||p.y<0||p.y>100)return 'Keep alignment points inside the photo.'
 }
 const rows=type==='trousers'?['Waist','Hip','Hem']:type==='skirt'?['Waist','Hip']:['blouse','shirt'].includes(type)?['Shoulder','Waist']:['Shoulder','Waist','Hip']
 let previousBottom=-1
 for(const row of rows){
  const left=points[`left${row}` as Landmark],right=points[`right${row}` as Landmark]
  if(left&&right){
   if(right.x-left.x<5||right.x-left.x>90)return 'Mark photo-left and photo-right points in order, between 5% and 90% of the photo width apart.'
   if(Math.abs(right.y-left.y)>15)return 'Keep each left/right pair at a similar height (within 15% of the photo height).'
  }
  const values=[left,right].filter((p):p is Point=>!!p)
  if(values.length){
   const top=Math.min(...values.map(p=>p.y)),bottom=Math.max(...values.map(p=>p.y))
   if(previousBottom>=0&&top<previousBottom+3)return 'Place waist below shoulders, hips below waist, and hem below the last marked row (at least 3% of photo height apart).'
   previousBottom=bottom
  }
 }
 if(points.hem&&previousBottom>=0&&points.hem.y<previousBottom+3)return 'Place the hem below the last marked row, at least 3% of photo height apart.'
 if(points.hem&&(points.hem.x<5||points.hem.x>95))return 'Keep the hem centre at least 5% from the photo sides.'
 return ''
}
export function updatedAlignment(points:AlignmentPoints,key:Landmark,point:Point,type:DesignFields['garment_type']):AlignmentPoints {
 const next={...points,[key]:{x:Math.round(point.x*10)/10,y:Math.round(point.y*10)/10}}
 const error=validateAlignment(next,type)
 if(error)throw new Error(error)
 return next
}
export type WarpRow={sourceY:number;sourceHalfWidth:number;left:Point;right:Point}
export type PreviewWarp={rows:WarpRow[]}
export function garmentHem(design:Pick<DesignFields,'garment_type'|'length'>){
 if(design.garment_type==='shirt')return {short:230,midi:275,long:320}[design.length]
 if(design.garment_type==='kurti')return {short:330,midi:390,long:450}[design.length]
 if(design.garment_type==='salwar_top')return {short:300,midi:360,long:420}[design.length]
 if(design.garment_type==='trousers')return {short:330,midi:420,long:455}[design.length]
 return design.garment_type==='blouse'?{short:195,midi:250,long:310}[design.length]:{short:300,midi:370,long:440}[design.length]
}
export function alignmentWarp(points:AlignmentPoints,design:DesignFields):PreviewWarp|null {
 if(validateAlignment(points,design.garment_type)||alignmentLandmarks(design.garment_type).some(key=>!points[key]))return null
 const hem=garmentHem(design),skirt=design.garment_type==='skirt',blouse=design.garment_type==='blouse'
 if(design.garment_type==='trousers')return {rows:[{sourceY:140,sourceHalfWidth:40,left:points.leftWaist!,right:points.rightWaist!},{sourceY:220,sourceHalfWidth:50,left:points.leftHip!,right:points.rightHip!},{sourceY:hem,sourceHalfWidth:trouserLegDimensions(design).outer,left:points.leftHem!,right:points.rightHem!}]}
 const specs:{name:'Shoulder'|'Waist'|'Hip';y:number;half:number}[]=skirt?[
  {name:'Waist',y:140,half:30},{name:'Hip',y:220,half:30+45*80/(hem-140)},
 ]:blouse?[
  {name:'Shoulder',y:65,half:40},{name:'Waist',y:160,half:30+5*30/(hem-130)},
 ]:design.garment_type==='shirt'?[{name:'Shoulder',y:65,half:40},{name:'Waist',y:180,half:34}]:[{name:'Shoulder',y:65,half:40},{name:'Waist',y:195,half:design.garment_type==='salwar_top'?32:30},{name:'Hip',y:250,half:design.garment_type==='kurti'?30+25*55/(hem-195):design.garment_type==='salwar_top'?32+18*55/(hem-195):30+45*55/(hem-195)}]
 const rows:WarpRow[]=specs.map(s=>({sourceY:s.y,sourceHalfWidth:s.half,left:points[`left${s.name}` as Landmark]!,right:points[`right${s.name}` as Landmark]!}))
 const last=rows.at(-1)!,hemPoint=points.hem!
 // Preserve the selected illustration's flare, bounded to the visible photo.
 const hemHalf=blouse?35:design.garment_type==='shirt'?42:design.garment_type==='kurti'?55:design.garment_type==='salwar_top'?50:75
 const half=Math.min(45,hemPoint.x,100-hemPoint.x,Math.max(2.5,(last.right.x-last.left.x)/2*hemHalf/last.sourceHalfWidth))
 const centre=hemPoint.x
 rows.push({sourceY:hem,sourceHalfWidth:hemHalf,left:{x:centre-half,y:hemPoint.y},right:{x:centre+half,y:hemPoint.y}})
 return {rows}
}
export function trouserLegDimensions(design:DesignFields){return design.garment_options?.leg_style==='wide'?{outer:90,inner:10}:design.garment_options?.leg_style==='tapered'?{outer:45,inner:25}:{outer:60,inner:15}}
export function warpPoint(point:Point,warp:PreviewWarp):Point {
 const rows=warp.rows
 const next=rows.findIndex(row=>row.sourceY>=point.y)
 const index=next<=0?(next===0?0:rows.length-2):next-1
 const a=rows[index],b=rows[index+1]
 const t=(point.y-a.sourceY)/(b.sourceY-a.sourceY)
 const lerp=(v:number,w:number)=>v+(w-v)*t
 const half=lerp(a.sourceHalfWidth,b.sourceHalfWidth)
 const u=(point.x-160)/(2*half)+0.5
 const left={x:lerp(a.left.x,b.left.x),y:lerp(a.left.y,b.left.y)},right={x:lerp(a.right.x,b.right.x),y:lerp(a.right.y,b.right.y)}
 // Permit sleeves beyond the torso; cap extrapolation to a small margin.
 return {x:Math.max(-25,Math.min(125,left.x+(right.x-left.x)*u)),y:Math.max(-25,Math.min(125,left.y+(right.y-left.y)*u))}
}
// Only used on this application's known, absolute SVG commands, never user SVG.
// Every coordinate/control point is mapped together, including neckline/sleeves.
export function warpIllustrationPath(path:string,warp:PreviewWarp):string {
 return sampleIllustrationPath(path,point=>warpPoint(point,warp),warp.rows.map(row=>row.sourceY))
}
export function sampleIllustrationPath(path:string,mapPoint:(point:Point)=>Point=point=>point,breaks:number[]=[]):string {
 const tokens=path.match(/[MLQCHZ]|-?\d+(?:\.\d+)?/g)??[]
 let x=0,y=0,startX=0,startY=0,index=0,result=''
 while(index<tokens.length){
  const command=tokens[index++]
  const count=command==='C'?3:command==='Q'?2:1
  const controls:Point[]=[{x,y}]
  if(command==='Z')controls.push({x:startX,y:startY})
  else if(command==='H')controls.push({x:Number(tokens[index++]),y})
  else for(let i=0;i<count;i++)controls.push({x:Number(tokens[index++]),y:Number(tokens[index++])})
  const end=controls.at(-1)!
  if(command==='M'){
   const point=mapPoint(end);result+=`M${point.x} ${point.y} `;startX=end.x;startY=end.y
  }else{
   const steps=Array.from({length:32},(_,i)=>(i+1)/32)
   if(controls.length===2&&end.y!==y)for(const row of breaks){const t=(row-y)/(end.y-y);if(t>0&&t<1)steps.push(t)}
   for(const t of steps.sort((a,b)=>a-b)){
    let level=controls
    while(level.length>1)level=level.slice(1).map((p,i)=>({x:level[i].x+(p.x-level[i].x)*t,y:level[i].y+(p.y-level[i].y)*t}))
    const point=mapPoint(level[0]);result+=`L${point.x} ${point.y} `
   }
   if(command==='Z')result+='Z'
  }
  x=end.x;y=end.y
 }
 return result
}
export type MeasurementKey='shoulder'|'bust'|'waist'|'hip'|'length'
export type PreviewMeasurements=Record<MeasurementKey,string>
export type MeasurementUnit='cm'|'in'
export const emptyMeasurements:PreviewMeasurements={shoulder:'',bust:'',waist:'',hip:'',length:''}
export const measurementLabels:Record<MeasurementKey,string>={shoulder:'Shoulder width',bust:'Bust circumference',waist:'Waist circumference',hip:'Hip circumference',length:'Garment length'}
export const toCentimetres=(value:number,unit:MeasurementUnit)=>unit==='in'?value*2.54:value
export const fromCentimetres=(value:number,unit:MeasurementUnit)=>unit==='in'?value/2.54:value
export function measurementError(key:MeasurementKey,value:string,unit:MeasurementUnit):string {
 if(value.trim()==='')return ''
 const cm=toCentimetres(Number(value),unit),max=key==='shoulder'?100:key==='length'?300:400
 return !Number.isFinite(cm)||cm<5-0.000002||cm>max+0.000002?`${measurementLabels[key]} must be between ${fromCentimetres(5,unit).toFixed(2)} and ${fromCentimetres(max,unit).toFixed(2)} ${unit==='in'?'inches':'cm'}, or left blank.`:''
}
export function convertMeasurements(values:PreviewMeasurements,from:MeasurementUnit,to:MeasurementUnit):PreviewMeasurements {
 return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,value.trim()===''?'':Number.isFinite(Number(value))?String(Number(fromCentimetres(toCentimetres(Number(value),from),to).toFixed(6))):value])) as PreviewMeasurements
}
export function estimatedHem(points:AlignmentPoints,values:PreviewMeasurements,unit:MeasurementUnit,photoAspect:number,type:DesignFields['garment_type']):Point {
 if(type==='skirt'||type==='trousers')throw new Error('Hem estimation requires shoulder marks; position the hem manually.')
 if(!points.leftShoulder||!points.rightShoulder||!values.shoulder||!values.length||measurementError('shoulder',values.shoulder,unit)||measurementError('length',values.length,unit)||!Number.isFinite(photoAspect)||photoAspect<=0)throw new Error('Mark both shoulders and enter valid shoulder width and garment length first.')
 const left=points.leftShoulder,right=points.rightShoulder
 const width=Math.hypot(right.x-left.x,(right.y-left.y)/photoAspect)
 const y=(left.y+right.y)/2+width*photoAspect*Number(values.length)/Number(values.shoulder)
 const point={x:(left.x+right.x)/2,y}
 if(y>100)throw new Error('The estimated hem falls outside the photo. Use the hem handle instead.')
 return point
}
