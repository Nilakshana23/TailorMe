import type {GarmentType,GarmentOptions} from '../../services/designService'
import {garmentMesh3d,garmentFrame3d} from '../../utils/garmentMesh3d'
import type {CustomNeckline} from '../../utils/necklineGeometry'
import {mannequinArm} from '../../utils/mannequinGeometry'
import {legacyBack} from '../../utils/backNeckline'
import type {BackNeckline} from '../../utils/backNeckline'
// Original procedural geometry and renderer. No textures, models or network IO.
import type {PresetNeckline} from '../../utils/dressNecklineMesh'
import type {IllustrationSilhouette} from '../../utils/dressPreview3d'
type Vec=[number,number,number]
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v))
function multiply(a:number[],b:number[]){return Array.from({length:16},(_,i)=>{const row=i%4,col=Math.floor(i/4);return [0,1,2,3].reduce((sum,k)=>sum+a[k*4+row]*b[col*4+k],0)})}
function lathe(profile:number[][],center:Vec=[0,0,0]){
 const vertices:number[]=[]
 const point=(row:number[],angle:number):Vec=>[center[0]+row[1]*Math.cos(angle),center[1]+row[0],center[2]+row[2]*Math.sin(angle)]
 const triangle=(a:Vec,b:Vec,c:Vec)=>{
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  const length=Math.hypot(...n)||1
  for(const p of [a,b,c])vertices.push(...p,...n.map(value=>value/length))
 }
 for(let i=0;i<profile.length-1;i++)for(let j=0;j<48;j++){
  const a=j*Math.PI*2/48,b=(j+1)*Math.PI*2/48
  const p=point(profile[i],a),q=point(profile[i],b),r=point(profile[i+1],a),s=point(profile[i+1],b)
  triangle(p,q,r);triangle(q,s,r)
 }
 return vertices
}
function ellipsoid(center:Vec,width:number,height:number,depth:number){return lathe(Array.from({length:19},(_,i)=>{const t=i*Math.PI/18;return [height*Math.cos(t),Math.max(.001,width*Math.sin(t)),Math.max(.001,depth*Math.sin(t))]}),center)}
export function createDressRenderer(canvas:HTMLCanvasElement,onError:(message:string)=>void){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false})
 if(!gl)throw new Error('WebGL is unavailable in this browser or device.')
 const buffers=new Set<WebGLBuffer>(),shaders=new Set<WebGLShader>()
 let program:WebGLProgram|null=null,observer:ResizeObserver|null=null,disposed=false,yaw=.22,pitch=.08,distance=3.8,aimY=0,dress:WebGLBuffer|null=null,dressCount=0,colour=[.65,.2,.3],garmentType:GarmentType='dress'
 const listeners:Array<()=>void>=[]
 const dispose=()=>{
  if(disposed)return;disposed=true;observer?.disconnect();listeners.forEach(remove=>remove())
  buffers.forEach(buffer=>gl.deleteBuffer(buffer));shaders.forEach(shader=>gl.deleteShader(shader));if(program)gl.deleteProgram(program)
  gl.getExtension('WEBGL_lose_context')?.loseContext()
 }
 try{
  const compile=(type:number,source:string)=>{const shader=gl.createShader(type);if(!shader)throw Error('Unable to allocate 3D shader.');shaders.add(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('This device could not compile the 3D illustration.');return shader}
  const vertex=compile(gl.VERTEX_SHADER,'attribute vec3 position; attribute vec3 normal; uniform mat4 matrix; uniform mat4 rotation; varying vec3 lightNormal; void main(){gl_Position=matrix*vec4(position,1.0);lightNormal=(rotation*vec4(normal,0.0)).xyz;}')
  const fragment=compile(gl.FRAGMENT_SHADER,'precision mediump float; uniform vec3 colour; varying vec3 lightNormal; void main(){vec3 n=normalize(lightNormal)*(gl_FrontFacing?1.0:-1.0);float light=0.48+0.52*max(dot(n,normalize(vec3(0.4,0.7,1.0))),0.0);gl_FragColor=vec4(colour*light,1.0);}')
  program=gl.createProgram();if(!program)throw Error('Unable to allocate 3D renderer.')
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program)
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('This device could not initialize the 3D illustration.')
  gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE)
  const position=gl.getAttribLocation(program,'position'),normal=gl.getAttribLocation(program,'normal'),matrix=gl.getUniformLocation(program,'matrix'),rotation=gl.getUniformLocation(program,'rotation'),tint=gl.getUniformLocation(program,'colour')
  const upload=(data:number[])=>{const buffer=gl.createBuffer();if(!buffer)throw Error('Unable to allocate 3D geometry.');buffers.add(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return buffer}
  const neutral=[...ellipsoid([0,1.13,0],.15,.21,.15),...ellipsoid([0,.88,0],.085,.16,.085),...lathe([[.78,.25,.15],[.6,.27,.17],[.15,.2,.14],[-.13,.27,.18],[-.3,.22,.15]]),...[-1,1].flatMap(side=>ellipsoid([side*mannequinArm.x,mannequinArm.y,mannequinArm.z],mannequinArm.width,mannequinArm.height,mannequinArm.depth)),...ellipsoid([-.13,-.86,0],.095,.61,.10),...ellipsoid([.13,-.86,0],.095,.61,.10),...ellipsoid([-.13,-1.44,.07],.10,.06,.19),...ellipsoid([.13,-1.44,.07],.10,.06,.19)]
  const body=upload(neutral)
  const drawMesh=(buffer:WebGLBuffer,count:number,c:number[])=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);gl.uniform3fv(tint,c);gl.drawArrays(gl.TRIANGLES,0,count)}
  const draw=()=>{
   if(disposed||gl.isContextLost())return
   try{
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2)
    canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio))
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.98,.965,.935,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)
    const x=Math.cos(pitch),s=Math.sin(pitch),y=Math.cos(yaw),t=Math.sin(yaw)
    const rotate=multiply([1,0,0,0,0,x,s,0,0,-s,x,0,0,0,0,1],[y,0,-t,0,0,1,0,0,t,0,y,0,0,0,0,1])
    const f=1/Math.tan(Math.PI/8),aspect=canvas.width/canvas.height,near=.1,far=30
    const projection=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]
    // Fit width without unnecessarily shrinking the neckline on mobile.
    const view=[1,0,0,0,0,1,0,0,0,0,1,0,0,-aimY,-Math.max(distance,(distance<2?.40:.85)/(Math.tan(Math.PI/8)*aspect)),1]
    gl.uniformMatrix4fv(matrix,false,new Float32Array(multiply(projection,multiply(view,rotate))));gl.uniformMatrix4fv(rotation,false,new Float32Array(rotate))
    drawMesh(body,neutral.length/6,[.72,.70,.66]);if(dress)drawMesh(dress,dressCount,colour)
   }catch{onError('The 3D renderer stopped. Please use the 2D design.')}
  }
  const rotate=(dx:number,dy:number)=>{yaw=(yaw+dx)%(Math.PI*2);pitch=clamp(pitch+dy,-.65,.65);draw()}
  const zoom=(delta:number)=>{distance=clamp(distance+delta,1.2,7);draw()}
  let drag:{id:number;x:number;y:number;startX:number;startY:number;touch:boolean;locked:boolean}|null=null
  const down=(event:PointerEvent)=>{if(!event.isPrimary||event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,touch:event.pointerType==='touch',locked:false}}
  const move=(event:PointerEvent)=>{
   if(!drag||drag.id!==event.pointerId)return
   if(!drag.locked){const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;if(Math.abs(dx)<6&&Math.abs(dy)<6)return;if(drag.touch&&Math.abs(dy)>Math.abs(dx)){drag=null;return}drag.locked=true;canvas.setPointerCapture(event.pointerId)}
   rotate((event.clientX-drag.x)*.012,drag.touch?0:(event.clientY-drag.y)*.008);drag.x=event.clientX;drag.y=event.clientY
  }
  const up=()=>{if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null}
  const lost=(event:Event)=>{event.preventDefault();onError('WebGL context was lost. The 2D design remains available.')}
  for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['lostpointercapture',up],['webglcontextlost',lost]] as const){canvas.addEventListener(name,handler as EventListener);listeners.push(()=>canvas.removeEventListener(name,handler as EventListener))}
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(draw);observer.observe(canvas)}else{window.addEventListener('resize',draw);listeners.push(()=>window.removeEventListener('resize',draw))}
  return {
   update(hex:string,length:'short'|'midi'|'long',silhouette:IllustrationSilhouette,neckline:PresetNeckline='round',back:BackNeckline=legacyBack,sleeve:'sleeveless'|'short'|'long'|'none'='sleeveless',custom:CustomNeckline|null=null,garment:GarmentType='dress',options:GarmentOptions={}){
    if(disposed)return
    try{
     if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Unsupported preview colour.')
     const nextColour=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255)
     const vertices=garmentMesh3d(garment,length,silhouette,neckline,back,sleeve,custom,options);if(!vertices.length||vertices.some((n,i)=>!Number.isFinite(n)||(i%6<3&&Math.abs(n)>3)))throw Error('Invalid procedural garment geometry.');const next=upload(vertices);colour=nextColour;garmentType=garment;if(!dress){const frame=garmentFrame3d(garment);distance=frame.distance;aimY=frame.aimY}if(dress){gl.deleteBuffer(dress);buffers.delete(dress)}dress=next;dressCount=vertices.length/6;draw();return null
    }catch(cause){return `${cause instanceof Error?cause.message:'Unable to update the 3D illustration.'} ${dress?'The previous valid geometry is retained.':'No valid 3D geometry is available.'} Check the garment options or use 2D Design.`}
   },rotate,zoom,
   view(preset:'front'|'back'|'detail'){const frame=garmentFrame3d(garmentType,preset==='detail');yaw=preset==='back'?Math.PI:0;pitch=.08;distance=frame.distance;aimY=frame.aimY;draw()},
   reset(){const frame=garmentFrame3d(garmentType);yaw=.22;pitch=.08;distance=frame.distance;aimY=frame.aimY;draw()},dispose,
  }
 }catch(cause){dispose();throw cause}
}
