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

const model=await load('../src/services/designService.ts')
const {dressPreviewSpec,omittedPreviewDetails,dressProfile}=await load('../src/utils/dressPreview3d.ts')
const {default:Tabs}=await load('../src/components/portal/DesignPreviewTabs.tsx')
const {createDressRenderer}=await load('../src/components/portal/dressWebglRenderer.ts')
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
test('template garments have specs; sketches remain unsupported; actual colour/length sync and detail omissions are explicit without mutation',()=>{
 const design={...model.defaultDesign,custom_neckline:{depths:[65,80,104,90,65]},collar_style:'shirt',garment_fill:'#ABCDEF',sleeve:'long',length:'long',refinement_geometry:{waist:20},decorations:{version:2,strokes:[{mode:'canvas',points:[[1,1],[2,2]]}]}}
 const before=structuredClone(design)
 assert.deepEqual(dressPreviewSpec(design),{garment:'dress',options:{},custom:design.custom_neckline,back:{version:1,preset:'round',depth:7.2222222222,width:34},sleeve:'long',colour:'#ABCDEF',length:'long',neckline:'round'})
 assert.deepEqual(dressPreviewSpec({...model.defaultDesign,colour:'navy'}),{garment:'dress',options:{},custom:null,back:{version:1,preset:'round',depth:7.2222222222,width:34},sleeve:'sleeveless',colour:model.designColours.navy,length:'midi',neckline:'round'})
 assert.equal(dressPreviewSpec(model.defaultSketch),null)
 for(const garment_type of ['shirt','skirt','blouse','kurti','salwar_top','trousers'])assert.equal(dressPreviewSpec({...model.defaultDesign,garment_type}).garment,garment_type)
 const omissions=omittedPreviewDetails(design).join(' ')
 for(const detail of ['Collar','Drawings','fills','layer order','refinement'])assert.ok(omissions.includes(detail))
 assert.deepEqual(design,before)
 const profiles=['straight','a-line','flared'].map(shape=>dressProfile('midi',shape));assert.ok(profiles[0].at(-1)[1]<profiles[1].at(-1)[1]&&profiles[1].at(-1)[1]<profiles[2].at(-1)[1])
 assert.ok(dressProfile('short','a-line').at(-1)[0]>dressProfile('long','a-line').at(-1)[0])
})
test('2D remains the initial authoritative view and tab interactions support keyboard and unsupported states',async()=>{
 const html=renderToString(React.createElement(MemoryRouter,null,React.createElement(Tabs,{design:model.defaultDesign},React.createElement('p',null,'Existing 2D controls'))))
 assert.match(html,/role="tab" aria-selected="true"/);assert.match(html,/Existing 2D controls/);assert.doesNotMatch(html,/<canvas/)
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/DesignPreviewTabs.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 const state=[];let cursor=0,focused=false
 const hooks={Component:React.Component,Suspense:()=>null,lazy:()=>function LazyRenderer(){},useId:()=> 'preview-test',useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]}}
 globalThis.__previewTabs={...hooks,dressPreviewSpec,omittedPreviewDetails}
 code=code.replace(/import DesignIllustration from '[^']+';/, 'const DesignIllustration=()=>null;').replace(/import \{[^}]+\} from 'react';/,'const {Component,lazy,Suspense,useId,useRef,useState}=globalThis.__previewTabs;').replace(/import \{ dressPreviewSpec, omittedPreviewDetails \} from '[^']+';/,'const {dressPreviewSpec,omittedPreviewDetails}=globalThis.__previewTabs;').replace(/import '[^']+\.css';/g,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:View}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
 const render=design=>{cursor=0;const tree=View({design,children:'2D'});for(const node of nodes(tree).filter(n=>n.props?.role==='tab'))node.props.ref.current={focus(){focused=true}};return tree}
 try{
  let tree=render(model.defaultDesign);nodes(tree).find(n=>n.props?.children==='3D Preview').props.onClick();tree=render(model.defaultDesign)
  assert.equal(nodes(tree).find(n=>n.props?.role==='tab'&&n.props.children==='3D Preview').props['aria-selected'],true)
  assert.ok(nodes(tree).some(n=>n.type?.name==='LazyRenderer'))
  tree=render(model.defaultSketch);assert.ok(nodes(tree).some(n=>n.props?.role==='status'));assert.ok(!nodes(tree).some(n=>n.type?.name==='LazyRenderer'))
  const tablist=nodes(tree).find(n=>n.props?.role==='tablist');tablist.props.onKeyDown({key:'Home',preventDefault(){}});tree=render(model.defaultSketch)
  assert.equal(focused,true);assert.equal(nodes(tree).find(n=>n.props?.children==='2D Design').props['aria-selected'],true)
  nodes(tree).find(n=>n.props?.role==='tablist').props.onKeyDown({key:'ArrowRight',preventDefault(){}});tree=render({...model.defaultDesign,garment_type:'shirt'})
  assert.ok(!nodes(tree).some(n=>n.props?.role==='status'));assert.ok(nodes(tree).some(n=>n.type?.name==='LazyRenderer'))
 }finally{delete globalThis.__previewTabs}
})
function fakeCanvas(){
 let next=0;const calls=[]
 const gl=new Proxy({createShader:()=>({id:next++}),createProgram:()=>({id:next++}),createBuffer:()=>({id:next++}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_p,name)=>name,isContextLost:()=>false,getExtension:()=>({loseContext(){calls.push(['loseContext'])}})}, {get(target,key){if(key in target)return target[key];if(String(key)===String(key).toUpperCase())return String(key);return(...args)=>{calls.push([key,...args])}}})
 class Canvas extends EventTarget{width=0;height=0;getContext(){return gl}getBoundingClientRect(){return{width:480,height:400}}hasPointerCapture(){return false}setPointerCapture(){}releasePointerCapture(){}}
 return{canvas:new Canvas(),calls}
}
test('renderer updates colour/geometry, bounds camera controls and releases GPU/listeners on teardown; WebGL denial is clear',()=>{
 const original=globalThis.window;globalThis.window=new EventTarget()
 try{
  const {canvas,calls}=fakeCanvas(),errors=[]
  const renderer=createDressRenderer(canvas,message=>errors.push(message))
  renderer.update('#ABCDEF','long','flared')
  assert.ok(calls.some(call=>call[0]==='uniform3fv'&&call[1]==='colour'&&Math.abs(call[2][0]-171/255)<.0001))
  renderer.update('#123456','short','straight');assert.ok(calls.some(call=>call[0]==='deleteBuffer'))
  for(let i=0;i<100;i++){renderer.zoom(-1);renderer.rotate(.2,1)}
  assert.ok(calls.filter(call=>call[0]==='uniformMatrix4fv').every(call=>Array.from(call[3]).every(Number.isFinite)))
  renderer.reset();const before=calls.length;renderer.dispose();assert.ok(calls.length>before);assert.ok(calls.some(call=>call[0]==='deleteProgram'));assert.ok(calls.some(call=>call[0]==='deleteShader'));assert.ok(calls.some(call=>call[0]==='loseContext'))
  const after=calls.length;window.dispatchEvent(new Event('resize'));canvas.dispatchEvent(new Event('webglcontextlost'));assert.equal(calls.length,after);assert.deepEqual(errors,[])
  assert.throws(()=>createDressRenderer({getContext:()=>null},()=>{}),/WebGL is unavailable/)
 }finally{globalThis.window=original}
})
test('preview state never enters editable fields, save payloads or shared snapshot rendering',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts'),requests=[]
 setSupabase({rpc:async(name,args)=>{requests.push([name,args]);return{data:{...args.p_fields,id:args.p_id},error:null}}})
 const design={...model.defaultDesign,garment_fill:'#ABCDEF',camera:{yaw:2},previewSilhouette:'flared',zoom:4}
 try{
  await model.designService.save('design-id',design,null)
  assert.doesNotMatch(JSON.stringify(requests),/camera|yaw|previewSilhouette|zoom/)
  assert.equal(requests[0][1].p_fields.garment_fill,'#ABCDEF')
  assert.doesNotMatch(JSON.stringify(model.editableDesign(design)),/camera|previewSilhouette|zoom/)
  const page=readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8')
  assert.match(page,/<DesignPreviewTabs design=\{fields\}>/);assert.match(page,/<PhotoStylingPreview/)
  const shared=readFileSync(new URL('../src/components/portal/RequestDesign.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(shared,/3d|3D|DesignPreviewTabs/)
  const tabs=readFileSync(new URL('../src/components/portal/DesignPreviewTabs.tsx',import.meta.url),'utf8')
  assert.match(tabs,/lazy\(\(\)=>import\('\.\/DressPreview3d'\)\)/)
 }finally{setSupabase(null)}
})

