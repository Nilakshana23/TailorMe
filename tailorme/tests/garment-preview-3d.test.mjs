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



const {garmentMesh3d,garmentHem3d,garmentFrame3d}=await load('../src/utils/garmentMesh3d.ts')
const {dressNecklineMesh}=await load('../src/utils/dressNecklineMesh.ts')
const {defaultDesign,defaultSketch,switchGarment,designFingerprint,validateDesignOptions}=await load('../src/services/designService.ts')
const {dressPreviewSpec,omittedPreviewDetails}=await load('../src/utils/dressPreview3d.ts')
const {createDressRenderer}=await load('../src/components/portal/dressWebglRenderer.ts')
const types=['dress','blouse','skirt','shirt','trousers','kurti','salwar_top']
const make=(type,changes={})=>({...switchGarment(defaultDesign,type),...changes})
const mesh=d=>{const s=dressPreviewSpec(d);return garmentMesh3d(s.garment,s.length,'a-line',s.neckline,s.back,s.sleeve,s.custom,s.options)}
const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0)
function triangles(mesh){return Array.from({length:mesh.length/18},(_,i)=>[0,6,12].map(offset=>mesh.slice(i*18+offset,i*18+offset+3)))}
function hit(origin,direction,[a,b,c]){
 const edge1=sub(b,a),edge2=sub(c,a),p=cross(direction,edge2),det=dot(edge1,p)
 if(Math.abs(det)<1e-10)return null
 const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return null
 const q=cross(t,edge1),v=dot(direction,q)/det;if(v<0||u+v>1)return null
 const distance=dot(edge2,q)/det;return distance>=0?distance:null
}


test('all seven template types synchronize existing options without mutation; sketches remain unsupported',()=>{
 for(const type of types){const d=make(type,{garment_fill:'#123456'}),before=designFingerprint(d),s=dressPreviewSpec(d)
  assert.equal(validateDesignOptions(d),'');assert.equal(s.garment,type);assert.equal(s.colour,'#123456');assert.equal(s.sleeve,d.sleeve);assert.deepEqual(s.options,d.garment_options)
  mesh(d);assert.equal(designFingerprint(d),before)
  if(type!=='dress')assert.deepEqual(s.back,dressPreviewSpec(make('dress')).back)
 }
 assert.equal(dressPreviewSpec(defaultSketch),null)
 assert.deepEqual(mesh(defaultDesign),dressNecklineMesh('midi','a-line','round'))
 for(const type of ['shirt','kurti','salwar_top','blouse']){
  const d=make(type,{custom_neckline:{depths:[65,80,115,95,65]}});assert.deepEqual(dressPreviewSpec(d).custom,d.custom_neckline)
  assert.notDeepEqual(mesh(d),mesh({...d,custom_neckline:null}))
 }
 assert.ok(omittedPreviewDetails(make('shirt',{collar_style:null,garment_options:{collar:'point'}})).some(t=>/Collar/.test(t)))
 assert.ok(!omittedPreviewDetails(make('trousers')).some(t=>/sleeve|neckline|Detailed/.test(t)))
})
test('every garment and supported length emits bounded finite triangles with unit consistent normals and an open hem',()=>{
 const signatures=[]
 for(const type of types)for(const length of ['short','midi','long']){
  const m=mesh(make(type,{length}));assert.ok(m.length>100);assert.equal(m.length%18,0);assert.ok(m.every(Number.isFinite))
  for(let i=0;i<m.length;i+=18){const [a,b,c]=[0,6,12].map(o=>m.slice(i+o,i+o+3)),normal=m.slice(i+3,i+6),n=cross(sub(b,a),sub(c,a));assert.ok(Math.hypot(...n)>1e-10);assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-8);assert.ok(dot(n,normal)>0);assert.ok([...a,...b,...c].every(v=>Math.abs(v)<3))}
  const positions=Array.from({length:m.length/6},(_,i)=>m.slice(i*6,i*6+3)),hem=garmentHem3d(type,length)
  // Sleeves can extend below a cropped bodice; isolate the central garment.
  const body=positions.filter(p=>Math.abs(p[0])<.25)
  assert.ok(body.some(p=>Math.abs(p[1]-hem)<.04),'garment-specific hem reached: '+type)
  signatures.push(JSON.stringify(m))
 }
 assert.equal(new Set(signatures).size,21)
})
test('trousers have a joined crotch and two uncapped leg tubes, with length/leg/waist style geometry',()=>{
 for(const leg_style of ['straight','tapered','wide'])for(const length of ['short','midi','long']){
  const d=make('trousers',{length,garment_options:{waist_style:'flat',leg_style}}),m=mesh(d),tris=triangles(m),hem=garmentHem3d('trousers',length)
  for(const y of [-.5,hem+.01]){
   // A front ray in the space between the legs must pass through, not hit a skirt.
   assert.ok(!tris.some(t=>{const h=hit([0,y,3],[0,0,-1],t);return h!==null&&h<3}))
   for(const x of [-.13,.13])assert.ok(tris.some(t=>{const h=hit([x,y,3],[0,0,-1],t);return h!==null&&h<3}))
  }
  assert.ok(!tris.some(t=>t.every(p=>Math.abs(p[1]-hem)<1e-9)),'no disks across cuffs')
 }
 const straight=mesh(make('trousers')),wide=mesh(make('trousers',{garment_options:{waist_style:'flat',leg_style:'wide'}})),elastic=mesh(make('trousers',{garment_options:{waist_style:'elastic',leg_style:'straight'}}))
 assert.notDeepEqual(straight,wide);assert.notDeepEqual(straight,elastic)
})
test('side slits are actual openings; tops retain neck holes, open sleeves and distinct hems/placket',()=>{
 for(const type of ['kurti','salwar_top'])for(const side_slits of ['short','long']){
  const d=make(type,{garment_options:{side_slits}}),tris=triangles(mesh(d)),hem=garmentHem3d(type,'midi'),y=hem+.06
  const sideHit=ts=>ts.some(t=>{const h=hit([3,y,0],[-1,0,0],t);return h!==null&&h<3})
  assert.equal(sideHit(tris),false);assert.equal(sideHit(triangles(mesh({...d,garment_options:{side_slits:'none'}}))),true)
 }
 for(const type of ['blouse','shirt','kurti','salwar_top']){
  const d=make(type,{neckline:'v',custom_neckline:{depths:[65,90,115,85,65]}}),tris=triangles(mesh(d))
  assert.ok(!tris.some(t=>{const h=hit([0,.70,3],[0,0,-1],t);return h!==null&&h<3}),'no fabric over neckline '+type)
 }
 const shirt=mesh(make('shirt'));assert.ok(Array.from({length:shirt.length/6},(_,i)=>shirt.slice(i*6,i*6+3)).some(p=>Math.abs(p[0])<.017&&p[1]>.3&&p[2]>.195),'raised placket/buttons')
})

test('central torso/hip and both trouser legs clear the actual neutral mannequin',()=>{
 const bodyRows=[[.78,.25,.15],[.6,.27,.17],[.15,.2,.14],[-.13,.27,.18],[-.3,.22,.15]]
 const bodySize=y=>{let i=bodyRows.findIndex(r=>r[0]<=y);i=Math.max(1,i);const a=bodyRows[i-1],b=bodyRows[i],t=(y-a[0])/(b[0]-a[0]);return[a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
 for(const type of types){
  const d=make(type,{length:'long'}),ts=triangles(mesh(d))
  for(const y of (['trousers','skirt'].includes(type)?[.15,0,-.13,-.25,-.29]:[.30,.20,.15,0,-.13,-.25]))for(const direction of [[0,0,1],[0,0,-1]]){
   const hits=ts.map(t=>hit([0,y,0],direction,t)).filter(h=>h!==null&&h>1e-8).sort((a,b)=>a-b)
   assert.ok(hits.length,type+' covered torso '+y);assert.ok(hits[0]>bodySize(y)[1]+.005,type+' front/back torso clearance '+y+' '+hits[0])
  }
 }
 for(const leg_style of ['straight','tapered','wide']){
  const ts=triangles(mesh(make('trousers',{length:'long',garment_options:{waist_style:'flat',leg_style}})))
  for(const side of [-1,1])for(const y of [-.55,-.75,-.9,-1.1,-1.25,-1.35])for(let i=0;i<32;i++){
   const a=i*2*Math.PI/32,d=[Math.cos(a),0,Math.sin(a)],size=Math.sqrt(1-((y+.86)/.61)**2),radius=size/Math.hypot(d[0]/.095,d[2]/.10)
   const hits=ts.map(t=>hit([side*.13,y,0],d,t)).filter(h=>h!==null&&h>1e-8).sort((a,b)=>a-b)
   assert.ok(hits.length);assert.ok(hits[0]>radius+.004,'leg clearance '+JSON.stringify({leg_style,side,y,a,h:hits[0],radius}))
   const nearest=ts.find(t=>{const h=hit([side*.13,y,0],d,t);return h!==null&&Math.abs(h-hits[0])<1e-9});assert.ok(dot(cross(sub(nearest[1],nearest[0]),sub(nearest[2],nearest[0])),d)>0,'leg faces point outward')
  }
 }
})
test('switching types preserves camera, changes buffers and detail targets, and disposal deletes every GPU buffer',()=>{
 const original=globalThis.window;globalThis.window=new EventTarget();const calls=[]
 const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,isContextLost:()=>false,getExtension:()=>null},{get(target,key){if(key in target)return target[key];if(String(key)===String(key).toUpperCase())return String(key);return(...args)=>calls.push([key,...args])}})
 class Canvas extends EventTarget{getContext(){return gl}getBoundingClientRect(){return{width:360,height:480}}}
 const matrix=()=>Array.from(calls.filter(c=>c[0]==='uniformMatrix4fv'&&c[1]==='matrix').at(-1)[3])
 try{
  const r=createDressRenderer(new Canvas(),message=>assert.fail(message));r.update('#ABCDEF','midi','a-line','round');r.rotate(.3,.1);r.zoom(-.2);const camera=matrix()
  for(const type of types){const s=dressPreviewSpec(make(type));assert.equal(r.update(s.colour,s.length,'a-line',s.neckline,s.back,s.sleeve,s.custom,s.garment,s.options),null);assert.deepEqual(matrix(),camera)}
  r.view('detail');assert.equal(garmentFrame3d('salwar_top',true).aimY,.65)
  const s=dressPreviewSpec(make('trousers'));r.update(s.colour,s.length,'a-line',s.neckline,s.back,s.sleeve,s.custom,s.garment,s.options);r.view('detail');assert.equal(garmentFrame3d('trousers',true).aimY,.02)
  assert.notDeepEqual(matrix(),camera);r.dispose();assert.equal(calls.filter(c=>c[0]==='deleteBuffer').length,calls.filter(c=>c[0]==='bufferData').length)
 }finally{globalThis.window=original}
})

test('trouser surfaces share the hip/crotch seam and leave only waist and leg cuffs open',()=>{
 for(const leg_style of ['straight','tapered','wide']){
  const m=mesh(make('trousers',{garment_options:{waist_style:'flat',leg_style}})),edges=new Map(),key=p=>JSON.stringify(p.map(n=>Math.round(n*1e8)/1e8)),hem=garmentHem3d('trousers','midi')
  for(const t of triangles(m))for(let i=0;i<3;i++){const edge=[key(t[i]),key(t[(i+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1)}
  for(const [edge,count] of edges){assert.ok(count<=2,'overlap '+count+' '+edge);if(count===1){const ps=edge.split('|').map(p=>JSON.parse(p));assert.ok(ps.every(p=>Math.abs(p[1]-.22)<1e-7)||ps.every(p=>Math.abs(p[1]-hem)<1e-7),'unjoined crotch/hip edge '+edge)}}
 }
})


test('unsupported persisted details are disclosed without resetting options; procedural bounds reject invalid inputs',()=>{
 const d=make('kurti',{refinement_geometry:{shoulder:40,waist:30,hem:60,sleeve_width:32,sleeve_length:120,waist_y:195,hem_y:370},collar_style:'stand'}),before=designFingerprint(d),omissions=omittedPreviewDetails(d).join(' ')
 assert.match(omissions,/Darts/);assert.match(omissions,/refinement/);assert.match(omissions,/Collar/);mesh(d);assert.equal(designFingerprint(d),before)
 assert.throws(()=>mesh(make('trousers',{garment_options:{waist_style:'flat',leg_style:'invented'}})),/Unsupported trouser/)
 assert.throws(()=>mesh(make('salwar_top',{garment_options:{side_slits:'invented'}})),/Unsupported side slits/)
})
