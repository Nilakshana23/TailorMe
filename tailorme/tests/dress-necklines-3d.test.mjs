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

const {dressNecklineMesh,frontNecklineHeight,necklineBoundary,neckHalfWidth,shoulderY}=await load('../src/utils/dressNecklineMesh.ts')
const {dressPreviewSpec,omittedPreviewDetails}=await load('../src/utils/dressPreview3d.ts')
const {defaultDesign,designFingerprint}=await load('../src/services/designService.ts')
const {createDressRenderer}=await load('../src/components/portal/dressWebglRenderer.ts')
const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0)
function triangles(mesh){return Array.from({length:mesh.length/18},(_,i)=>[0,6,12].map(offset=>mesh.slice(i*18+offset,i*18+offset+3)))}
function hit(origin,direction,[a,b,c]){
 const edge1=sub(b,a),edge2=sub(c,a),p=cross(direction,edge2),det=dot(edge1,p)
 if(Math.abs(det)<1e-10)return null
 const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return null
 const q=cross(t,edge1),v=dot(direction,q)/det;if(v<0||u+v>1)return null
 const distance=dot(edge2,q)/det;return distance>=0?distance:null
}
test('round, V and square boundaries match the 2D preset depths and preserve square vertical corners',()=>{
 const scale=(shoulderY-.15)/130
 assert.equal(frontNecklineHeight(0,'v'),shoulderY-45*scale)
 assert.equal(frontNecklineHeight(0,'round'),shoulderY-17.5*scale)
 assert.equal(frontNecklineHeight(0,'square'),shoulderY-30*scale)
 assert.equal(frontNecklineHeight(neckHalfWidth/2,'v'),shoulderY-22.5*scale)
 assert.equal(frontNecklineHeight(neckHalfWidth/2,'round'),shoulderY-17.5*.75*scale)
 const square=necklineBoundary('square')
 for(const sign of [-1,1]){
  const edge=square.filter(([x,,z])=>Math.abs(x-sign*neckHalfWidth)<1e-9&&z>0)
  assert.equal(edge.length,2);assert.deepEqual(edge.map(p=>p[1]).sort(),[shoulderY-30*scale,shoulderY].sort())
 }
 const back=preset=>necklineBoundary(preset).filter(p=>p[2]<0)
 assert.deepEqual(back('round'),back('v'));assert.deepEqual(back('v'),back('square'))
})
test('cutouts have no garment triangles in front of the exposed mannequin from front and angled rays',()=>{
 for(const preset of ['round','v','square']){
  const mesh=triangles(dressNecklineMesh('midi','a-line',preset)),y=(frontNecklineHeight(0,preset)+shoulderY)/2
  for(const angle of [-.5,0,.5]){
   const origin=[3*Math.sin(angle),y,3*Math.cos(angle)],target=[0,y,.16],difference=sub(target,origin),distance=Math.hypot(...difference),direction=difference.map(n=>n/distance)
   const hits=mesh.map(triangle=>hit(origin,direction,triangle)).filter(value=>value!==null)
   assert.ok(!hits.some(value=>value<distance-1e-6),`${preset}: opening stays clear before mannequin at angle ${angle}`)
   assert.ok(hits.some(value=>value>distance),`${preset}: the intact back remains behind the mannequin`)
  }
  const below=frontNecklineHeight(0,preset)-.04
  assert.ok(mesh.some(triangle=>{const t=hit([0,below,3],[0,0,-1],triangle);return t!==null&&t<3}),`${preset}: filled front surface remains below cutout`)
 }
 const square=triangles(dressNecklineMesh('short','straight','square')),y=(frontNecklineHeight(0,'square')+shoulderY)/2
 for(const sign of [-1,1]){
  assert.ok(!square.some(t=>{const d=hit([sign*neckHalfWidth*.99,y,3],[0,0,-1],t);return d!==null&&d<3}))
  assert.ok(square.some(t=>{const d=hit([sign*neckHalfWidth*1.01,y,3],[0,0,-1],t);return d!==null&&d<3}))
 }
})
test('every emitted triangle has finite unit outward normals, valid area, and selected length/silhouette',()=>{
 for(const preset of ['round','v','square'])for(const length of ['short','midi','long'])for(const shape of ['straight','a-line','flared']){
  const mesh=dressNecklineMesh(length,shape,preset);assert.ok(mesh.every(Number.isFinite))
  const hem={short:-.48,midi:-.9,long:-1.25}[length]
  assert.equal(Math.min(...mesh.filter((_,i)=>i%6===1)),hem)
  for(let i=0;i<mesh.length;i+=18){
   const [a,b,c]=[0,6,12].map(offset=>mesh.slice(i+offset,i+offset+3)),normal=mesh.slice(i+3,i+6),centroid=a.map((n,j)=>(n+b[j]+c[j])/3)
   assert.ok(Math.hypot(...cross(sub(b,a),sub(c,a)))>1e-10)
   assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-9)
   assert.ok(normal[0]*centroid[0]+normal[2]*centroid[2]>0,'surface normals face radially outward')
  }
 }
})
test('preset changes synchronize without mutation and only unsupported details remain omitted',()=>{
 for(const neckline of ['round','v','square']){
  const design={...defaultDesign,neckline,custom_neckline:{depths:[65,80,104,90,65]},collar_style:'shirt',sleeve:'long'},before=designFingerprint(design)
  assert.equal(dressPreviewSpec(design).neckline,neckline)
  const omissions=omittedPreviewDetails(design).join(' ');assert.doesNotMatch(omissions,/Custom neckline/);assert.match(omissions,/Collar/)
  dressNecklineMesh('long','flared',neckline);assert.equal(designFingerprint(design),before)
 }
 assert.ok(!omittedPreviewDetails(defaultDesign).some(text=>text.startsWith('Neckline shape')))
})
test('renderer replaces geometry immediately while preserving current camera; Front/Back/Detail and reset are distinct',()=>{
 const original=globalThis.window;globalThis.window=new EventTarget();const calls=[]
 const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,isContextLost:()=>false,getExtension:()=>null},{get(target,key){if(key in target)return target[key];if(String(key)===String(key).toUpperCase())return String(key);return(...args)=>calls.push([key,...args])}})
 class Canvas extends EventTarget{getContext(){return gl}getBoundingClientRect(){return{width:320,height:480}}}
 const lastMatrix=()=>Array.from(calls.filter(c=>c[0]==='uniformMatrix4fv'&&c[1]==='matrix').at(-1)[3])
 try{
  const renderer=createDressRenderer(new Canvas(),message=>assert.fail(message))
  renderer.update('#ABCDEF','midi','a-line','round');renderer.rotate(.4,.1);renderer.zoom(-.2);const camera=lastMatrix()
  const first=Array.from(calls.filter(c=>c[0]==='bufferData').at(-1)[2])
  renderer.update('#ABCDEF','midi','a-line','v');assert.deepEqual(lastMatrix(),camera)
  assert.notDeepEqual(Array.from(calls.filter(c=>c[0]==='bufferData').at(-1)[2]),first)
  const b={version:1,preset:'square',depth:40,width:42}
  renderer.update('#123456','long','a-line','v',b,'long');assert.deepEqual(lastMatrix(),camera)
  const uploaded=calls.filter(c=>c[0]==='bufferData').length,deleted=calls.filter(c=>c[0]==='deleteBuffer').length
  assert.match(renderer.update('#123456','long','a-line','v',{...b,depth:NaN},'long'),/previous valid geometry/)
  assert.equal(calls.filter(c=>c[0]==='bufferData').length,uploaded);assert.equal(calls.filter(c=>c[0]==='deleteBuffer').length,deleted)
  renderer.view('front');const front=lastMatrix();renderer.view('back');assert.notDeepEqual(lastMatrix(),front)
  renderer.view('detail');assert.notDeepEqual(lastMatrix(),front);assert.ok(lastMatrix()[15]<front[15],'detail moves the camera closer on mobile too')
  renderer.reset();assert.ok(lastMatrix().every(Number.isFinite));renderer.dispose()
 }finally{globalThis.window=original}
})
test('React prop changes update the same renderer and accessible view controls call the camera presets',async()=>{
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],creates=0,disposed=0,props={colour:'#ABCDEF',length:'midi',neckline:'round'},tree
 const updates=[],views=[]
 const hooks={useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 globalThis.__necklineSync={hooks,createDressRenderer:()=>{creates++;return{update:(...args)=>updates.push(args),view:value=>views.push(value),rotate(){},zoom(){},reset(){views.push('reset')},dispose(){disposed++}}}}
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/DressPreview3d.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useRef,useState}=globalThis.__necklineSync.hooks;').replace(/import \{ createDressRenderer \} from '[^']+';/,'const {createDressRenderer}=globalThis.__necklineSync;').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Preview}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const render=()=>{cursor=0;tree=Preview(props);const canvas=nodes(tree).find(n=>n.type==='canvas');if(canvas)canvas.props.ref.current={}}
 const flush=async()=>{for(let i=0;i<3;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 try{
  render();await flush();assert.equal(creates,1);assert.deepEqual(updates.at(-1),['#ABCDEF','midi','a-line','round',undefined,undefined,null,'dress',{}])
  for(const neckline of ['v','square','round']){props={...props,neckline};render();await flush();assert.equal(updates.at(-1)[3],neckline);assert.equal(creates,1);assert.deepEqual(views,[])}
  props={...props,colour:'#123456',length:'long'};render();await flush();assert.deepEqual(updates.at(-1),['#123456','long','a-line','round',undefined,undefined,null,'dress',{}])
  props={...props,custom:{depths:[65,90,115,80,65]}};render();await flush();assert.deepEqual(updates.at(-1)[6],props.custom);assert.equal(creates,1);assert.deepEqual(views,[])
  props={...props,custom:null};render();await flush();assert.equal(updates.at(-1)[6],null);assert.equal(creates,1)
  props={...props,garment:'trousers',options:{waist_style:'elastic',leg_style:'wide'},custom:null};render();await flush();assert.equal(updates.at(-1)[7],'trousers');assert.deepEqual(updates.at(-1)[8],props.options);assert.equal(creates,1);assert.deepEqual(views,[])
  for(const label of ['Front','Back','Detail','Reset view']){const button=nodes(tree).find(n=>n.type==='button'&&n.props.children===label);assert.equal(button.props.type,'button');button.props.onClick()}
  assert.deepEqual(views,['front','back','detail','reset'])
 }finally{for(const cleanup of cleanups)cleanup?.();assert.equal(disposed,1);delete globalThis.__necklineSync}
})

