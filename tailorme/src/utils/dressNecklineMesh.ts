import {customNecklineDepthAt,validNeckline} from './necklineGeometry'
import type {CustomNeckline} from './necklineGeometry'
import {mannequinArm,sleeveRadius,sleeveSectionRadius} from './mannequinGeometry'
import {legacyBack,validBackNeckline} from './backNeckline'
import type {BackNeckline} from './backNeckline'
import {dressProfile} from './dressPreview3d'
import type {IllustrationSilhouette} from './dressPreview3d'
export type PresetNeckline='round'|'v'|'square'
export type MeshPoint=[number,number,number]
export const shoulderY=.78,neckHalfWidth=.31*17/40
// Same proportions as presetNecklinePath: shoulders at y=65, anchors
// x=143/177, waist y=195. A quadratic round curve reaches y=82.5,
// the V point y=110, and square corners y=95. No saved geometry is edited.
export function frontNecklineHeight(x:number,preset:PresetNeckline){
 if(Math.abs(x)>neckHalfWidth+1e-10)return shoulderY
 const u=Math.min(1,Math.abs(x)/neckHalfWidth),scale=(shoulderY-.15)/(195-65)
 const depth=preset==='v'?45*(1-u):preset==='square'?30:17.5*(1-u*u)
 return shoulderY-depth*scale
}
export function necklineBoundary(preset:PresetNeckline,back:BackNeckline=legacyBack,custom:CustomNeckline|null=null):MeshPoint[]{
 if(custom!==null&&!validNeckline(custom))throw Error('Invalid custom neckline. Reapply a valid curve or reset to a preset.')
 if(!validBackNeckline(back))throw Error('Invalid back neckline')
 const backHalf=.31*back.width/80,backEdge=Math.acos(backHalf/.31)
 const edge=Math.acos(neckHalfWidth/.31)
 const customAngles=custom?Array.from({length:65},(_,i)=>Math.acos((-17+34*i/64)/40)):[]
 const angles=[...customAngles,...Array.from({length:128},(_,i)=>i*Math.PI*2/128),Math.PI+backEdge,Math.PI*2-backEdge,edge,Math.PI-edge,Math.PI+edge,Math.PI*2-edge,Math.PI/2,Math.PI*1.5]
 const ordered=[...new Set(angles)].sort((a,b)=>a-b),points:MeshPoint[]=[]
 for(const angle of ordered){
  const x=.31*Math.cos(angle),z=.19*Math.sin(angle),inside=Math.abs(x)<neckHalfWidth-1e-10
  if(!custom&&preset==='square'&&(Math.abs(angle-edge)<1e-10||Math.abs(angle-(Math.PI-edge))<1e-10)){
   const top:MeshPoint=[x,shoulderY,z],bottom:MeshPoint=[x,frontNecklineHeight(x,preset),z]
   // Duplicated angular samples are intentional: the square has vertical sides,
   // not a slanted/chamfered connection to its horizontal lower boundary.
   points.push(...(angle<Math.PI/2?[top,bottom]:[bottom,top]));continue
  }
  if(back.preset==='square'&&(Math.abs(angle-(Math.PI+backEdge))<1e-10||Math.abs(angle-(Math.PI*2-backEdge))<1e-10)){
   const top:MeshPoint=[x,shoulderY,z],low:MeshPoint=[x,shoulderY-back.depth*.63/130,z]
   points.push(...(angle<Math.PI*1.5?[top,low]:[low,top]));continue
  }
  const u=Math.min(1,Math.abs(x)/backHalf),backY=shoulderY-back.depth*.63/130*(back.preset==='square'?1:back.preset==='v'?1-u:1-u*u)
  const y=z<0?(Math.abs(x)<=backHalf?backY:shoulderY):inside?(custom?shoulderY-(customNecklineDepthAt(custom,Math.max(143,Math.min(177,160+x*40/.31)))-65)*.63/130:frontNecklineHeight(x,preset)):shoulderY
  points.push([x,y,z])
 }
 return points
}
export function dressNecklineMesh(length:'short'|'midi'|'long',silhouette:IllustrationSilhouette,preset:PresetNeckline,back:BackNeckline=legacyBack,sleeve:'sleeveless'|'short'|'long'|'none'='sleeveless',custom:CustomNeckline|null=null,construction?:{profile:number[][];slitStart?:number;curvedHem?:boolean}){
 const boundary=necklineBoundary(preset,back,custom),vertices:number[]=[]
 const triangle=(a:MeshPoint,b:MeshPoint,c:MeshPoint)=>{
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i])
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],size=Math.hypot(...normal)
  if(size<1e-10)return
  for(const p of [a,b,c])vertices.push(...p,...normal.map(n=>n/size))
 }
 // Preserve x/z below neckline corners so no triangles bridge a square opening.
 // Taper only the outer chest (outside x=.2) for inner-arm clearance.
 const profiles=[[.39,.31,.19],...(construction?.profile??dressProfile(length,silhouette)).filter(row=>row[0]<.39)]
 let upper=boundary
 let band=0
 for(const [y,width,depth] of profiles){
  const lower:MeshPoint[]=boundary.map(([x,,z])=>[band===0&&Math.abs(x)>.2?Math.sign(x)*(.2+(Math.abs(x)-.2)*.07/.11):x/.31*width,y-(construction?.curvedHem&&y===construction.profile.at(-1)?.[0] ? .03*Math.abs(z/.19) : 0),z/.19*depth])
  for(let i=0;i<upper.length;i++){
   const next=(i+1)%upper.length
   if(band===0&&Math.abs(upper[i][0])>.27&&Math.abs(upper[next][0])>.27&&upper[i][0]*upper[next][0]>0)continue
   if(construction?.slitStart!==undefined&&y<construction.slitStart&&upper[i][1]<=construction.slitStart+1e-9&&Math.abs(boundary[i][2]/.19)<.055&&Math.abs(boundary[next][2]/.19)<.055&&boundary[i][0]*boundary[next][0]>0)continue
   triangle(upper[i],upper[next],lower[i]);triangle(upper[next],lower[next],lower[i])
  }
  if(band===0&&(sleeve==='short'||sleeve==='long')){
   const sleeveStart=vertices.length
   for(const side of [-1,1]){
    const indices=boundary.map((p,i)=>p[0]*side>.27?i:-1).filter(i=>i>=0).sort((a,b)=>boundary[a][2]-boundary[b][2])
    const seam=[...indices.map(i=>upper[i]),...indices.slice().reverse().map(i=>lower[i])]
    // The armhole is a vertical loop, whereas an arm cross-section is horizontal.
    // Route it over a raised shoulder cap before descending around the arm.
    // A direct seam-to-cuff ruled surface collapses to strips beside the torso.
    const rings=sleeveSurfaceRings(seam,side,sleeve)
    for(let row=0;row<rings.length-1;row++)for(let i=0;i<seam.length;i++){
     const j=(i+1)%seam.length,a=rings[row],b=rings[row+1]
     if(side===1){triangle(a[i],a[j],b[i]);triangle(a[j],b[j],b[i])}
     else{triangle(a[i],b[i],a[j]);triangle(a[j],b[i],b[j])}
    }
   }
   smoothSleeveNormals(vertices,sleeveStart)
  }
  band++;upper=lower
 }
 // Deliberately no top fan, cap, fill patch or line overlay across the opening.
 return vertices
}

// Exported for geometric checks against the same arm coordinates used by WebGL.
export function sleeveSurfaceRings(seam:MeshPoint[],side:number,sleeve:'short'|'long'){
 const capY=mannequinArm.y+mannequinArm.height-.09
 const ring=(height:number):MeshPoint[]=>seam.map((_,i)=>{
  const angle=-Math.PI/2+i*2*Math.PI/seam.length,r=sleeveSectionRadius(sleeve,height)
  return [side*(mannequinArm.x+r.x*Math.cos(angle)),height,mannequinArm.z+r.z*Math.sin(angle)]
 })
 const upper=ring(.52)
 // Cubic shoulder: leave the exact shared root toward the raised cap, then
 // approach the shaft vertically. Multiple rings replace the old sharp elbow.
 const shoulder=Array.from({length:10},(_,row)=>{
  const t=(row+1)/10,u=1-t
  return seam.map((root,i):MeshPoint=>{
   const angle=-Math.PI/2+i*2*Math.PI/seam.length,c=Math.cos(angle)
   const cap:MeshPoint=[side*(mannequinArm.x+sleeveRadius.x*Math.SQRT1_2*c),capY+sleeveRadius.x*Math.SQRT1_2*c+.025*Math.max(0,c),mannequinArm.z+sleeveRadius.z*Math.sin(angle)]
   const approach:MeshPoint=[upper[i][0],.64,upper[i][2]]
   return [0,1,2].map(k=>u*u*u*root[k]+3*u*u*t*cap[k]+3*u*t*t*approach[k]+t*t*t*upper[i][k]) as MeshPoint
  })
 })
 const cuffY=sleeve==='short'?.35:-.16
 const shaft=Array.from({length:8},(_,i)=>ring(.52+(cuffY-.52)*(i+1)/8))
 return [seam,...shoulder,...shaft]
}

// Smooth only the sleeve surface, leaving neckline corners and bodice artwork
// geometry untouched. Area weighting avoids seams between longitudinal rings.
function smoothSleeveNormals(vertices:number[],start:number){
 const sums=new Map<string,number[]>(),key=(i:number)=>vertices.slice(i,i+3).map(n=>n.toFixed(9)).join(',')
 for(let i=start;i<vertices.length;i+=18){
  const a=vertices.slice(i,i+3),b=vertices.slice(i+6,i+9),c=vertices.slice(i+12,i+15)
  const u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  for(const offset of [0,6,12]){const k=key(i+offset),sum=sums.get(k)??[0,0,0];sums.set(k,sum.map((x,j)=>x+n[j]))}
 }
 for(let i=start;i<vertices.length;i+=6){
  const n=sums.get(key(i))!,size=Math.hypot(...n)
  if(size>1e-10&&n.reduce((sum,x,j)=>sum+x*vertices[i+3+j],0)>0)for(let j=0;j<3;j++)vertices[i+3+j]=n[j]/size
 }
}
