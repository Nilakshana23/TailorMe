export const colourPresets=[['Charcoal','#303039'],['Ivory','#f3e6ce'],['Ruby','#a8324a'],['Navy','#243c63'],['Sage','#789783'],['Gold','#b08d35'],['Black','#000000'],['White','#ffffff'],['Silver','#bfc3c7'],['Taupe','#97877a'],['Chocolate','#57392d'],['Blush','#f4c6cf'],['Peach','#ffd4b8'],['Lavender','#d9ccf1'],['Mint','#c4ead7'],['Sky','#c5e4fa'],['Butter','#fff1ad'],['Coral','#ff735e'],['Scarlet','#e53030'],['Orange','#fa8c16'],['Yellow','#ffdc26'],['Lime','#a9d82e'],['Emerald','#15865b'],['Teal','#087e8b'],['Blue','#2364d2'],['Violet','#7543bb'],['Magenta','#c82e8a'],['Burgundy','#621c38']] as const
export const drawingColours=['#303039','#f3e6ce','#a8324a','#243c63','#789783','#b08d35'] as const
export const validHex=(value:unknown):value is string=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value)
export type DrawingStroke={mode?:'garment'|'canvas';kind?:'stroke'|'rectangle'|'ellipse';closed?:boolean;fill?:string|null;colour:string;width:number;points:[number,number][]}
export type DesignDrawing={version:1|2;strokes:DrawingStroke[]}
export const emptyDrawing=(version:1|2=1):DesignDrawing=>({version,strokes:[]})
export function canClose(points:[number,number][]):boolean {
 if(points.length<3)return false
 const p=[...points];if(p.length>3&&p[0][0]===p.at(-1)![0]&&p[0][1]===p.at(-1)![1])p.pop()
 const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 const on=(a:number[],b:number[],c:number[])=>cross(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1])
 let area=0
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];if(a[0]===b[0]&&a[1]===b[1])return false
  area+=a[0]*b[1]-b[0]*a[1]
  for(let j=i+2;j<p.length;j++){
   if(i===0&&j===p.length-1)continue
   const c=p[j],d=p[(j+1)%p.length]
   if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return false
  }
 }
 return Math.abs(area)>=100
}
export function validDrawing(value:unknown):value is DesignDrawing {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const d=value as DesignDrawing
 if(Object.keys(d).sort().join(',')!=='strokes,version'||![1,2].includes(d.version)||!Array.isArray(d.strokes)||d.strokes.length>32)return false
 let total=0
 for(const s of d.strokes){
  if(!s||typeof s!=='object'||!['colour','width','points'].every(k=>Object.hasOwn(s,k))||Object.keys(s).some(k=>!(d.version===1?['colour','width','points','mode']:['colour','width','points','mode','kind','closed','fill']).includes(k)))return false
  if(('mode' in s&&!['garment','canvas'].includes(s.mode??''))||(d.version===1?!drawingColours.includes(s.colour as typeof drawingColours[number]):!validHex(s.colour))||!Number.isInteger(s.width)||s.width<1||s.width>12||!Array.isArray(s.points)||s.points.length<2||s.points.length>256)return false
  total+=s.points.length
  if(total>4096||s.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isInteger(n)||n<0||n>10000)))return false
  if(d.version===2){
   if(('kind' in s&&!['stroke','rectangle','ellipse'].includes(s.kind??''))||('closed' in s&&typeof s.closed!=='boolean')||('fill' in s&&s.fill!==null&&!validHex(s.fill)))return false
   if(s.kind==='rectangle'||s.kind==='ellipse'){if(s.points.length!==2||s.points[0][0]===s.points[1][0]||s.points[0][1]===s.points[1][1])return false}
   else if(s.closed){if(!canClose(s.points))return false}
   else if(s.fill!==undefined&&s.fill!==null)return false
  }
 }
 return new TextEncoder().encode(JSON.stringify(d)).length<=98304
}
export function addDrawingStroke(drawing:DesignDrawing,stroke:DrawingStroke):DesignDrawing {
 const extended=stroke.kind!==undefined||stroke.closed!==undefined||stroke.fill!==undefined||!drawingColours.includes(stroke.colour as typeof drawingColours[number])
 const next:DesignDrawing={version:extended?2:drawing.version,strokes:[...drawing.strokes,stroke]}
 if(!validDrawing(next))throw new Error('Drawing limit or invalid shape: up to 32 items, 256 points per item and 4,096 points overall.')
 return next
}
export function drawingOutline(item:DrawingStroke):[number,number][] {
 if(item.kind!=='rectangle'&&item.kind!=='ellipse')return item.points
 const [a,b]=item.points,x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1])
 if(item.kind==='rectangle')return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
 return Array.from({length:64},(_,i)=>[x+w/2+Math.cos(i*Math.PI/32)*w/2,y+h/2+Math.sin(i*Math.PI/32)*h/2])
}
export function transformDrawingItem(item:DrawingStroke,x:number,y:number,width:number,height:number):DrawingStroke {
 const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY
 if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<1||height<1||x+width>10000||y+height>10000)throw new Error('Keep artwork inside the canvas with positive width and height.')
 return {...item,points:item.points.map(p=>[Math.round(x+(p[0]-minX)/Math.max(1,w)*width),Math.round(y+(p[1]-minY)/Math.max(1,h)*height)])}
}

export type LineCleanupOptions={strength:'gentle'|'medium';indices?:number[];width?:number}
type DrawingPoint=[number,number]
// Work in renderer pixels (320 x 480), not an isotropic normalized square.
const pixelPoint=([x,y]:DrawingPoint):DrawingPoint=>[x*0.032,y*0.048]
const distance=(a:DrawingPoint,b:DrawingPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function segmentDistance(p:DrawingPoint,a:DrawingPoint,b:DrawingPoint){
 const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy
 const t=length===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length))
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
}
function intersectsItself(points:DrawingPoint[]){
 const cross=(a:DrawingPoint,b:DrawingPoint,c:DrawingPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
 const on=(a:DrawingPoint,b:DrawingPoint,c:DrawingPoint)=>cross(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1])
 for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++){
  const a=points[i],b=points[i+1],c=points[j],d=points[j+1]
  if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return true
 }
 return false
}
function cleanOpenStroke(points:DrawingPoint[],strength:LineCleanupOptions['strength']):DrawingPoint[]{
 const pixels=points.map(pixelPoint),last=points.length-1
 // Small marks, near-closed paths and crossings are deliberately left alone.
 if(points.length<4||distance(pixels[0],pixels[last])<4||intersectsItself(points))return points
 const xs=pixels.map(p=>p[0]),ys=pixels.map(p=>p[1])
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
 if(Math.hypot(maxX-minX,maxY-minY)<12)return points
 const anchors=new Set([0,last])
 for(let i=1;i<last;i++){
  const a=pixels[i-1],b=pixels[i],c=pixels[i+1],ab=distance(a,b),bc=distance(b,c)
  // Preserve extrema and turns of 35 degrees or more, including their neighbours.
  if(b[0]===minX||b[0]===maxX||b[1]===minY||b[1]===maxY)anchors.add(i)
  if(ab===0||bc===0||((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))/(ab*bc)<Math.cos(35*Math.PI/180)){
   anchors.add(i-1);anchors.add(i);anchors.add(i+1)
  }
 }
 const cap=strength==='gentle'?0.35:0.7,tolerance=strength==='gentle'?0.18:0.4
 // One non-iterative, displacement-capped weighted smoothing pass. Round once.
 const smoothed=points.map((p,i):DrawingPoint=>{
  if(anchors.has(i))return [...p]
  const a=pixels[i-1],b=pixels[i],c=pixels[i+1],dx=(a[0]+c[0]-2*b[0])/4,dy=(a[1]+c[1]-2*b[1])/4
  const scale=Math.min(1,cap/(Math.hypot(dx,dy)||1))
  return [Math.round((b[0]+dx*scale)/0.032),Math.round((b[1]+dy*scale)/0.048)]
 })
 const metric=smoothed.map(pixelPoint),keep=new Set(anchors),ordered=[...anchors].sort((a,b)=>a-b)
 // Iterative Ramer-Douglas-Peucker, split at protected anchors; <=256 points.
 const stack=ordered.slice(1).map((end,i)=>[ordered[i],end])
 while(stack.length){
  const [start,end]=stack.pop()!;let farthest=-1,max=tolerance
  for(let i=start+1;i<end;i++){const d=segmentDistance(metric[i],metric[start],metric[end]);if(d>max){max=d;farthest=i}}
  if(farthest!==-1){keep.add(farthest);stack.push([start,farthest],[farthest,end])}
 }
 const result=[...keep].sort((a,b)=>a-b).map(i=>smoothed[i])
 // Never collapse segments or introduce a crossing through rounding/simplification.
 if(result.some((p,i)=>i>0&&p[0]===result[i-1][0]&&p[1]===result[i-1][1])||intersectsItself(result))return points
 return result
}
export function cleanupDrawing(drawing:DesignDrawing,options:LineCleanupOptions):DesignDrawing {
 if(!validDrawing(drawing)||!['gentle','medium'].includes(options.strength)||
  (options.width!==undefined&&(!Number.isInteger(options.width)||options.width<1||options.width>12))||
  (options.indices!==undefined&&(!Array.isArray(options.indices)||options.indices.some(i=>!Number.isInteger(i)||i<0||i>=drawing.strokes.length))))throw new Error('Choose valid line cleanup settings.')
 const targets=options.indices===undefined?null:new Set(options.indices)
 const result:DesignDrawing={...drawing,strokes:drawing.strokes.map((s,i)=>{
  if(targets&&!targets.has(i))return s
  const points=s.closed||s.kind==='rectangle'||s.kind==='ellipse'?s.points:cleanOpenStroke(s.points,options.strength)
  return {...s,points:points.map(p=>[...p]),...(options.width===undefined?{}:{width:options.width})}
 })}
 if(!validDrawing(result))throw new Error('Cleanup exceeds the artwork limits. Keep the original sketch.')
 return result
}
