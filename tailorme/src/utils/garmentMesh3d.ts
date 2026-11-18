import type {GarmentType,GarmentOptions} from '../services/designService'
import type {CustomNeckline} from './necklineGeometry'
import {legacyBack} from './backNeckline'
import type {BackNeckline} from './backNeckline'
import {dressNecklineMesh} from './dressNecklineMesh'
import type {MeshPoint,PresetNeckline} from './dressNecklineMesh'
import type {IllustrationSilhouette} from './dressPreview3d'

type Row=[number,number,number]
const segments=64
function triangle(out:number[],a:MeshPoint,b:MeshPoint,c:MeshPoint){
 const u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],size=Math.hypot(...normal)
 if(size<1e-10)return
 for(const p of [a,b,c])out.push(...p,...normal.map(n=>n/size))
}
function join(out:number[],upper:MeshPoint[],lower:MeshPoint[]){
 for(let i=0;i<upper.length;i++){const j=(i+1)%upper.length;triangle(out,upper[i],upper[j],lower[i]);triangle(out,upper[j],lower[j],lower[i])}
}
function oval([y,width,depth]:Row,centre=0,elastic=false):MeshPoint[]{
 return Array.from({length:segments},(_,i)=>{const a=i*2*Math.PI/segments,r=elastic?1+.012*Math.cos(24*a):1;return[centre+width*r*Math.cos(a),y,depth*r*Math.sin(a)]})
}
function surface(rows:Row[],elastic=false){
 const out:number[]=[]
 for(let i=0;i<rows.length-1;i++)join(out,oval(rows[i],0,elastic&&i===0),oval(rows[i+1]))
 return out
}
export function garmentHem3d(type:GarmentType,length:'short'|'midi'|'long'){
 const hems:Record<GarmentType,Row>={dress:[-.48,-.90,-1.25],blouse:[.15,-.117,-.407],skirt:[-.48,-.90,-1.25],shirt:[-.02,-.238,-.456],trousers:[-.80,-1.25,-1.36],kurti:[-.505,-.795,-1.086],salwar_top:[-.36,-.65,-.94]}
 return hems[type][{short:0,midi:1,long:2}[length]]
}
export function topProfile3d(type:GarmentType,length:'short'|'midi'|'long',slits:GarmentOptions['side_slits']='none'){
 const hem=garmentHem3d(type,length),width=type==='blouse'?.30:type==='shirt'?.30:type==='kurti'?.40:.365
 const rows:Row[]=[[.15,type==='shirt'?.25:type==='salwar_top'?.245:.235,.175]]
 if(hem<-.08)rows.push([-.08,.305,.21])
 const slitDepth=slits==='long'?.32:slits==='short'?.16:0,slitStart=slitDepth?hem+Math.min(slitDepth,(.15-hem)*.6):undefined
 if(hem<.15)rows.push([hem,width,type==='blouse'?.21:type==='shirt'?.215:.23])
 if(slitStart!==undefined){
  const i=rows.findIndex(row=>row[0]<slitStart)
  if(i>0){const a=rows[i-1],b=rows[i],t=(slitStart-a[0])/(b[0]-a[0]);rows.splice(i,0,[slitStart,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t])}
 }
 return {profile:rows,slitStart,curvedHem:type==='shirt'||type==='salwar_top'}
}
function placket(out:number[],profile:number[][],hem:number){
 const depthAt=(y:number)=>{
  if(y>=.39)return .19
  const rows=[[.39,.31,.19],...profile];let i=rows.findIndex(r=>r[0]<=y);if(i<1)i=1
  const a=rows[i-1],b=rows[i],t=(y-a[0])/(b[0]-a[0]);return a[2]+(b[2]-a[2])*t
 }
 // Raised strip, edge bevels and small domed buttons, all using garment colour.
 const ys=[.47,.39,...profile.map(r=>r[0])].filter(y=>y>hem+.025);ys.push(hem+.025)
 for(let i=0;i<ys.length-1;i++)for(const side of [-1,1]){
  const y=ys[i],next=ys[i+1],a:MeshPoint=[side*.016,y,depthAt(y)+.001],b:MeshPoint=[0,y,depthAt(y)+.008],c:MeshPoint=[side*.016,next,depthAt(next)+.001],d:MeshPoint=[0,next,depthAt(next)+.008]
  if(side<0){triangle(out,a,c,b);triangle(out,b,c,d)}else{triangle(out,b,d,a);triangle(out,a,d,c)}
 }
 for(let y=.40;y>hem+.06;y-=.14)for(let i=0;i<12;i++){
  const a=i*Math.PI/6,b=(i+1)*Math.PI/6,z=depthAt(y)+.012
  triangle(out,[0,y,z+.003],[.006*Math.cos(a),y+.006*Math.sin(a),z],[.006*Math.cos(b),y+.006*Math.sin(b),z])
 }
}
function trousers(length:'short'|'midi'|'long',options:GarmentOptions){
 const out=surface([[.22,.24,.175],[.16,.25,.18],[-.13,.30,.215]],options.waist_style==='elastic'),end=garmentHem3d('trousers',length)
 // Each half of the hip oval joins one leg; the two inner arcs share an
 // identical curved crotch seam. There is no disk/skirt panel across the legs.
 for(const side of [-1,1]){
  const root:MeshPoint[]=Array.from({length:segments},(_,i)=>{
   const a=i*2*Math.PI/segments,c=Math.cos(a),outer=side*c>=-1e-10
   return [outer?.30*c:0,-.13-(outer?0:.26*Math.abs(c)),.215*Math.sin(a)]
  })
  let upper=root
  for(const y of [-.44,-.65,...(end<-.9?[-.9]:[]),end].filter((y,i,a)=>i===0||y<a[i-1])){
   const t=Math.min(1,(-y-.44)/.3),wide=options.leg_style==='wide',centre=side*(.13+(wide?.05*t:0))
   const bodyRadius=.095*Math.sqrt(Math.max(0,1-((y+.86)/.61)**2))
   const radius=wide?.12+.045*t:options.leg_style==='tapered'?Math.max(.115-(.115-.075)*Math.max(0,(-y-.44)/(Math.abs(end)-.44)),bodyRadius+.014):.12
   const lower=oval([y,radius,Math.max(bodyRadius+.02,wide?.18:.14)],centre)
   join(out,upper,lower);upper=lower
  }
 }
 return out
}
export function garmentMesh3d(type:GarmentType,length:'short'|'midi'|'long',silhouette:IllustrationSilhouette,neckline:PresetNeckline,back:BackNeckline=legacyBack,sleeve:'none'|'sleeveless'|'short'|'long'='sleeveless',custom:CustomNeckline|null=null,options:GarmentOptions={}){
 if(!['short','midi','long'].includes(length)||!['straight','a-line','flared'].includes(silhouette))throw Error('Unsupported preview length or silhouette.')
 if(type==='trousers'&&(!['flat','elastic'].includes(options.waist_style??'flat')||!['straight','tapered','wide'].includes(options.leg_style??'straight')))throw Error('Unsupported trouser options. Your saved options have not been changed.')
 if(['kurti','salwar_top'].includes(type)&&!['none','short','long'].includes(options.side_slits??'none'))throw Error('Unsupported side slits. Your saved options have not been changed.')
 if(type==='dress')return dressNecklineMesh(length,silhouette,neckline,back,sleeve,custom)
 if(type==='trousers')return trousers(length,options)
 if(type==='skirt'){
  const width={straight:.32,'a-line':.49,flared:.65}[silhouette]
  return surface([[.22,.24,.175],[.16,.25,.18],[-.13,.305,.215],[garmentHem3d(type,length),width,width*.7]])
 }
 if(!['blouse','shirt','kurti','salwar_top'].includes(type))throw Error('Unsupported template garment.')
 const construction=topProfile3d(type,length,type==='kurti'||type==='salwar_top'?options.side_slits:undefined)
 const out=dressNecklineMesh(length,silhouette,neckline,legacyBack,sleeve,custom,construction)
 if(type==='shirt')placket(out,construction.profile,garmentHem3d(type,length))
 return out
}
export function garmentFrame3d(type:GarmentType,detail=false){
 const bottom=type==='skirt'||type==='trousers'
 return detail?{distance:1.65,aimY:bottom?.02:.65}:type==='dress'?{distance:3.8,aimY:0}:bottom?{distance:3.1,aimY:-.5}:type==='blouse'?{distance:3.0,aimY:.28}:{distance:3.4,aimY:.05}
}

