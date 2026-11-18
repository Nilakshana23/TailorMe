import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// Compile the real TSX components in memory. Stub only the Supabase transport:
// no environment files, tokens, accounts, or network requests are used by tests.
const modules = new Map()
function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let source
  if (url.pathname.endsWith('/lib/supabase.ts')) {
    source = 'export let supabase = null; export function setSupabase(value) { supabase = value; } export const configurationError = null; export const authRedirect = { present: true, error: null };'
  } else if (/\.(css|png)$/.test(url.pathname)) {
    source = 'export default "";'
  } else {
    source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText
    // SSR does not run Navigate effects. Record the real component's navigation
    // props at the router boundary so tests can assert destinations and replace.
    if (source.includes('import { Link, Navigate, useLocation }')) {
      source = source.replace('import { Link, Navigate, useLocation }', 'import { Link, useLocation }')
      source += '\nfunction Navigate(props) { globalThis.__tailormeNavigation = props; return null; }'
    }
    source = source.replace(/from\s+['"]([^'"]+)['"]/g, (_, specifier) => {
      if (!specifier.startsWith('.')) return `from '${import.meta.resolve(specifier)}'`
      let child = new URL(specifier, url)
      if (!existsSync(child)) {
        child = ['.ts', '.tsx'].map((extension) => new URL(specifier + extension, url)).find((candidate) => existsSync(candidate))
        assert.ok(child, `Module exists: ${specifier}`)
      }
      return `from '${moduleUrl(child)}'`
    }).replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(url.href, compiled)
  return compiled
}
const load = (path) => import(moduleUrl(new URL(path, import.meta.url)))


const {dressNecklineMesh,necklineBoundary,sleeveSurfaceRings}=await load('../src/utils/dressNecklineMesh.ts')
const {mannequinArm:arm,sleeveRadius,sleeveSectionRadius}=await load('../src/utils/mannequinGeometry.ts')
const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0)
function triangles(mesh){return Array.from({length:mesh.length/18},(_,i)=>[0,6,12].map(offset=>mesh.slice(i*18+offset,i*18+offset+3)))}
function hit(origin,direction,[a,b,c]){
 const edge1=sub(b,a),edge2=sub(c,a),p=cross(direction,edge2),det=dot(edge1,p)
 if(Math.abs(det)<1e-10)return null
 const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return null
 const q=cross(t,edge1),v=dot(direction,q)/det;if(v<0||u+v>1)return null
 const distance=dot(edge2,q)/det;return distance>=0?distance:null
}

test('sleeve cross-sections enclose both actual mannequin arms from shoulders to cuffs',()=>{
 for(const sleeve of ['short','long'])for(const side of [-1,1]){
  const boundary=necklineBoundary('round'),indices=boundary.map((p,i)=>p[0]*side>.27?i:-1).filter(i=>i>=0).sort((a,b)=>boundary[a][2]-boundary[b][2])
  const seam=[...indices.map(i=>boundary[i]),...indices.slice().reverse().map(i=>{const [x,,z]=boundary[i];return[Math.sign(x)*(.2+(Math.abs(x)-.2)*.07/.11),.39,z]})]
  const rings=sleeveSurfaceRings(seam,side,sleeve),tris=[]
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<seam.length;i++){
   const j=(i+1)%seam.length;tris.push([rings[row][i],rings[row][j],rings[row+1][i]],[rings[row][j],rings[row+1][j],rings[row+1][i]])
  }
  for(const y of sleeve==='short'?[.749,.74,.72,.69,.65,.6,.55,.5,.45,.4,.36]:[.749,.74,.72,.69,.65,.6,.55,.5,.45,.4,.3,.15,0,-.15])for(let i=0;i<48;i++){
   // Above the axilla, inward rays enter the bodice/neck opening rather than a closed tube.
   const a=i*Math.PI*2/48;if(y>.39&&side*Math.cos(a)<-1e-8)continue;const dir=[Math.cos(a),0,Math.sin(a)],origin=[side*arm.x,y,0]
   const size=Math.sqrt(1-((y-arm.y)/arm.height)**2),armDistance=size/Math.hypot(dir[0]/arm.width,dir[2]/arm.depth)
   const hits=tris.map(t=>hit(origin,dir,t)).filter(d=>d!==null&&d>1e-8).sort((a,b)=>a-b)
   assert.ok(hits.length,'closed arm cross-section '+JSON.stringify({sleeve,side,y,a}))
   assert.ok(hits[0]>armDistance+.005,'cloth clearance '+JSON.stringify({sleeve,side,y,a,hit:hits[0],armDistance}))
  }
 }
 assert.ok(sleeveRadius.x>arm.width&&sleeveRadius.z>arm.depth)
})



test('sleeve rings follow the vertical arms; cuffs stay open, normals match winding and roots share bodice edges',()=>{
 for(const sleeve of ['short','long']){
  const mesh=dressNecklineMesh('midi','a-line','round',undefined,sleeve),edges=new Map(),key=p=>p.map(n=>n.toFixed(8)).join(',')
  for(let i=0;i<mesh.length;i+=18){
   const tri=[mesh.slice(i,i+3),mesh.slice(i+6,i+9),mesh.slice(i+12,i+15)],n=mesh.slice(i+3,i+6),crossed=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]))
   assert.ok([...tri.flat(),...n].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<1e-8);assert.ok(dot(n,crossed)>0)
   for(let j=0;j<3;j++){const edge=[key(tri[j]),key(tri[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1)}
   const centre=[0,1,2].map(k=>tri.reduce((sum,p)=>sum+p[k],0)/3)
   if(centre[1]<.30&&centre[1]>-.08&&Math.abs(centre[0])>.32)assert.ok(n[0]*(Math.abs(centre[0])-arm.x)*Math.sign(centre[0])+n[2]*centre[2]>0,'shaft normals face away from arm axis')
  }
  const cuffY=sleeve==='short'?.35:-.16
  for(const [edge,count] of edges){assert.ok(count<=2);if(count===1){const ps=edge.split('|').map(p=>p.split(',').map(Number));assert.ok(ps.every(p=>p[1]>.39)||ps.every(p=>Math.abs(p[1]+.9)<1e-7)||ps.every(p=>Math.abs(p[1]-cuffY)<1e-7),'root seam gap: '+edge)}}
  for(const side of [-1,1]){
   const cuff=Array.from({length:mesh.length/6},(_,i)=>mesh.slice(i*6,i*6+3)).filter(p=>Math.abs(p[1]-cuffY)<1e-9&&p[0]*side>.26)
   assert.ok(cuff.length>10);for(const p of cuff){const r=sleeveSectionRadius(sleeve,cuffY);assert.ok(Math.abs(((p[0]-side*arm.x)/r.x)**2+(p[2]/r.z)**2-1)<1e-8)}
  }
 }
 const bare=dressNecklineMesh('midi','a-line','round'),bareTriangles=triangles(bare)
 assert.ok(!bareTriangles.some(t=>t.some(p=>Math.abs(p[0])>.32)&&t.every(p=>p[1]>.39)),'sleeveless has no projecting shoulder/sleeve panels')
})

test('rounded shoulder keeps exact roots and tapered shaft sections shrink gently toward open cuffs',()=>{
 const boundary=necklineBoundary('round'),indices=boundary.map((p,i)=>p[0]>.27?i:-1).filter(i=>i>=0).sort((a,b)=>boundary[a][2]-boundary[b][2])
 const seam=[...indices.map(i=>boundary[i]),...indices.slice().reverse().map(i=>{const [x,,z]=boundary[i];return[.2+(x-.2)*.07/.11,.39,z]})]
 for(const sleeve of ['short','long']){
  const rings=sleeveSurfaceRings(seam,1,sleeve),end=sleeve==='short'?.35:-.16
  assert.deepEqual(rings[0],seam);assert.equal(rings.length,19)
  const upper=rings[10],cuff=rings.at(-1),radius=points=>Math.max(...points.map(p=>Math.abs(p[0]-arm.x)))
  assert.ok(radius(cuff)<radius(upper));assert.ok(radius(cuff)>radius(upper)*.70)
  for(let row=11;row<rings.length;row++)assert.ok(radius(rings[row])<radius(rings[row-1]))
  assert.ok(cuff.every(p=>Math.abs(p[1]-end)<1e-9))
  const crown=Math.floor(seam.length/4),angles=[]
  for(let row=1;row<10;row++){
   const a=sub(rings[row][crown],rings[row-1][crown]),b=sub(rings[row+1][crown],rings[row][crown])
   angles.push(Math.acos(Math.max(-1,Math.min(1,dot(a,b)/Math.hypot(...a)/Math.hypot(...b)))))
  }
  assert.ok(Math.max(...angles)<.35,'shoulder curvature is distributed across rings rather than a sharp elbow')
 }
})
test('back presets, depth and width alter actual cutout surfaces while retaining the front boundary',()=>{
 const back={version:1,preset:'round',depth:35,width:40}
 const covered=(b,x,y)=>triangles(dressNecklineMesh('midi','a-line','v',b,'short')).some(t=>{const d=hit([x,y,-3],[0,0,1],t);return d!==null&&d<3})
 assert.equal(covered(back,.0775,.67),false)
 assert.equal(covered({...back,preset:'v'},.0775,.67),true)
 assert.equal(covered(back,.0775,.63),true)
 assert.equal(covered({...back,preset:'square'},.0775,.63),false)
 assert.equal(covered({...back,depth:10},0,.68),true)
 assert.equal(covered({...back,depth:40},0,.68),false)
 assert.equal(covered({...back,preset:'v',width:20},.0775,.70),true)
 assert.equal(covered({...back,preset:'v',width:42},.0775,.70),false)
 for(const preset of ['round','v','square']){
  assert.deepEqual(necklineBoundary('v',{...back,preset}).filter(p=>p[2]>=0),necklineBoundary('v',back).filter(p=>p[2]>=0))
 }
})
