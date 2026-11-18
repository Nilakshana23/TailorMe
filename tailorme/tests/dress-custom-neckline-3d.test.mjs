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


const {necklineBoundary,dressNecklineMesh,shoulderY,neckHalfWidth}=await load('../src/utils/dressNecklineMesh.ts')
const {customNecklineDepthAt,validNeckline,necklineX}=await load('../src/utils/necklineGeometry.ts')
const {defaultDesign,designService,editableDesign,designFingerprint,validateDesignOptions}=await load('../src/services/designService.ts')
const {dressPreviewSpec,omittedPreviewDetails}=await load('../src/utils/dressPreview3d.ts')
const {createDressRenderer}=await load('../src/components/portal/dressWebglRenderer.ts')
const {setSupabase}=await load('../src/lib/supabase.ts')
const {default:Illustration}=await load('../src/components/portal/DesignIllustration.tsx')
const symmetric={depths:[65,90,110,90,65]},asymmetric={depths:[65,70,116,100,65]}
const sub=(a,b)=>a.map((n,i)=>n-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0)
function triangles(mesh){return Array.from({length:mesh.length/18},(_,i)=>[0,6,12].map(offset=>mesh.slice(i*18+offset,i*18+offset+3)))}
function hit(origin,direction,[a,b,c]){
 const edge1=sub(b,a),edge2=sub(c,a),p=cross(direction,edge2),det=dot(edge1,p)
 if(Math.abs(det)<1e-10)return null
 const t=sub(origin,a),u=dot(t,p)/det;if(u<0||u>1)return null
 const q=cross(t,edge1),v=dot(direction,q)/det;if(v<0||u+v>1)return null
 const distance=dot(edge2,q)/det;return distance>=0?distance:null
}

test('custom cubic mapping matches SVG segments exactly, including anchors and asymmetry',()=>{
 for(const curve of [symmetric,asymmetric,{depths:[65,120,65,120,65]}]){
  assert.equal(validNeckline(curve),true)
  for(let segment=0;segment<4;segment++)for(let step=0;step<=16;step++){
   const t=step/16,u=1-t,x=necklineX[segment]+8.5*t
   const svgY=u*u*u*curve.depths[segment]+3*u*u*t*curve.depths[segment]+3*u*t*t*curve.depths[segment+1]+t*t*t*curve.depths[segment+1]
   assert.ok(Math.abs(customNecklineDepthAt(curve,x)-svgY)<1e-10)
  }
  const boundary=necklineBoundary('square',undefined,curve)
  for(const p of boundary.filter(p=>p[2]>0&&Math.abs(p[0])<neckHalfWidth-1e-9))assert.ok(Math.abs(p[1]-(shoulderY-(customNecklineDepthAt(curve,160+p[0]*40/.31)-65)*.63/130))<1e-10)
  for(const x of [-neckHalfWidth,neckHalfWidth])assert.ok(boundary.some(p=>p[2]>0&&Math.abs(p[0]-x)<1e-9&&Math.abs(p[1]-shoulderY)<1e-10))
 }
 const boundary=necklineBoundary('round',undefined,asymmetric),height=x=>boundary.find(p=>p[2]>0&&Math.abs(p[0]-x)<1e-9)[1]
 assert.notEqual(height(-neckHalfWidth/2),height(neckHalfWidth/2))
})
test('custom openings replace preset surfaces without bridge triangles from front/detail and angled rays',()=>{
 for(const curve of [symmetric,asymmetric])for(const sleeve of ['sleeveless','short','long']){
  const mesh=dressNecklineMesh('midi','a-line','square',undefined,sleeve,curve),tris=triangles(mesh)
  for(const x of [-neckHalfWidth/2,0,neckHalfWidth/2]){
   const y=shoulderY-(customNecklineDepthAt(curve,160+x*40/.31)-65)*.63/130,z=.19*Math.sqrt(1-(x/.31)**2)
   for(const slope of [-.15,0,.15]){
    const frontHits=height=>tris.some(t=>{const d=hit([x+slope*(3-z),height,3],[-slope,0,-1],t);return d!==null&&d<3})
    assert.equal(frontHits(y+.015),false,'no fabric across the opening');assert.equal(frontHits(y-.015),true,'fabric begins below the applied curve')
   }
  }
  for(let i=0;i<mesh.length;i+=6){assert.ok(mesh.slice(i,i+6).every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...mesh.slice(i+3,i+6))-1)<1e-8)}
  assert.notDeepEqual(mesh,dressNecklineMesh('midi','a-line','square',undefined,sleeve))
 }
 assert.deepEqual(necklineBoundary('v',undefined,symmetric).filter(p=>p[2]<0),necklineBoundary('v',undefined,asymmetric).filter(p=>p[2]<0))
})
test('renderer preserves camera and valid GPU mesh on invalid custom geometry; reset removes the curve',()=>{
 const original=globalThis.window;globalThis.window=new EventTarget();const calls=[]
 const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,isContextLost:()=>false,getExtension:()=>null},{get(target,key){if(key in target)return target[key];if(String(key)===String(key).toUpperCase())return String(key);return(...args)=>calls.push([key,...args])}})
 class Canvas extends EventTarget{getContext(){return gl}getBoundingClientRect(){return{width:320,height:480}}}
 const matrix=()=>Array.from(calls.filter(c=>c[0]==='uniformMatrix4fv'&&c[1]==='matrix').at(-1)[3]),geometry=()=>Array.from(calls.filter(c=>c[0]==='bufferData').at(-1)[2])
 try{
  const renderer=createDressRenderer(new Canvas(),message=>assert.fail(message));renderer.update('#ABCDEF','midi','a-line','round');const preset=geometry();renderer.view('detail');renderer.rotate(.3,.1);renderer.zoom(-.1);const camera=matrix()
  renderer.update('#ABCDEF','midi','a-line','round',undefined,'long',asymmetric);const custom=geometry();assert.notDeepEqual(custom,preset);assert.deepEqual(matrix(),camera)
  const count=calls.filter(c=>c[0]==='deleteBuffer').length
  assert.match(renderer.update('#ABCDEF','midi','a-line','round',undefined,'long',{depths:[65,NaN,100,90,65]}),/previous valid geometry/)
  assert.deepEqual(geometry(),custom);assert.equal(calls.filter(c=>c[0]==='deleteBuffer').length,count)
  renderer.update('#ABCDEF','midi','a-line','round',undefined,'sleeveless',null);assert.deepEqual(geometry(),preset);assert.deepEqual(matrix(),camera);renderer.dispose()
 }finally{globalThis.window=original}
})
test('save/reopen uses the existing custom field and leaves unsupported-detail notices and collar rules intact',async()=>{
 const d={...defaultDesign,format_version:2,custom_neckline:asymmetric},before=designFingerprint(d),calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push([name,args]);return{data:{...args.p_fields,id:args.p_id,version:1},error:null}}})
 try{
  const saved=await designService.save('test',d,null),reopened=editableDesign(saved)
  assert.deepEqual(dressPreviewSpec(reopened).custom,asymmetric)
  assert.deepEqual(necklineBoundary('round',undefined,dressPreviewSpec(reopened).custom),necklineBoundary('round',undefined,asymmetric))
  assert.equal(calls[0][1].p_fields.custom_neckline,asymmetric);assert.ok(!Object.keys(calls[0][1].p_fields).some(k=>/3d|camera/.test(k)))
  assert.equal(designFingerprint(d),before);assert.ok(!omittedPreviewDetails(d).some(s=>/Custom neckline/.test(s)))
  assert.ok(omittedPreviewDetails({...d,collar_style:'shirt',refinement_geometry:{}}).some(s=>/Collar/.test(s)))
  assert.ok(validateDesignOptions({...d,collar_style:'shirt'}))
  const html=renderToString(React.createElement(Illustration,{design:d}));assert.match(html,/C145/)
 }finally{setSupabase(null)}
})

test('real editor drafts do not change 2D/3D until Apply; Cancel preserves applied geometry and Reset restores preset',async()=>{
 const state=[];let cursor=0,fields={...defaultDesign,format_version:2},applies=0
 globalThis.__customCurveEditor={useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]}}
 const editorUrl=new URL('../src/components/portal/NecklineEditor.tsx',import.meta.url)
 let code=ts.transpileModule(readFileSync(editorUrl,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useRef,useState}=globalThis.__customCurveEditor;')
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(_,spec)=>'from '+JSON.stringify(spec.startsWith('.')?moduleUrl(new URL(spec+'.ts',editorUrl)):import.meta.resolve(spec)))
 const {default:Editor}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const text=n=>typeof n==='string'?n:!n||typeof n!=='object'?'':[n.props?.children].flat(Infinity).map(text).join('')
 const render=()=>{cursor=0;return Editor({design:fields,onApply:curve=>{applies++;fields={...fields,custom_neckline:curve}}})}
 const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n)===label)
 const mesh=()=>dressNecklineMesh('midi','a-line',fields.neckline,undefined,'sleeveless',dressPreviewSpec(fields).custom)
 const illustration=()=>renderToString(React.createElement(Illustration,{design:fields}))
 try{
  const preset=mesh(),preset2d=illustration();button(render(),'Edit neckline').props.onClick();let tree=render()
  nodes(tree).find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:false}});tree=render()
  nodes(tree).find(n=>n.props?.id==='neckline-depth-1').props.onChange({target:{value:'102'}});tree=render()
  assert.deepEqual(mesh(),preset);assert.equal(illustration(),preset2d);assert.equal(applies,0)
  button(tree,'Apply neckline').props.onClick();tree=render();const applied=mesh(),applied2d=illustration()
  assert.notDeepEqual(applied,preset);assert.notEqual(applied2d,preset2d);assert.equal(fields.custom_neckline.depths[1],102);assert.notEqual(fields.custom_neckline.depths[3],102)
  button(tree,'Edit neckline').props.onClick();tree=render();nodes(tree).find(n=>n.props?.id==='neckline-depth-2').props.onChange({target:{value:'120'}});tree=render();button(tree,'Cancel').props.onClick();tree=render()
  assert.deepEqual(mesh(),applied);assert.equal(illustration(),applied2d);assert.equal(applies,1)
  button(tree,'Reset to round preset').props.onClick();assert.equal(dressPreviewSpec(fields).custom,null);assert.deepEqual(mesh(),preset);assert.equal(applies,2)
 }finally{delete globalThis.__customCurveEditor}
})
