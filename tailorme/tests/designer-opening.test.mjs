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
const sketch={...model.defaultSketch,id:'11000000-0000-4000-8000-000000000001',owner_id:'owner',version:3,attached_at:null,name:'Evening sketch',notes:'Keep the gold border',sketch_category:'dress',decorations:{version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#123456',fill:'#FEDCBA',width:3,points:[[100,200],[4000,6000]]},{kind:'ellipse',mode:'canvas',colour:'#654321',fill:null,width:2,points:[[2000,1000],[9000,7000]]}]}}
const garment={...model.defaultDesign,id:'11000000-0000-4000-8000-000000000002',owner_id:'owner',version:4,attached_at:null,name:'Tailored kurti',design_kind:'garment',format_version:3,garment_type:'kurti',garment_options:{side_slits:'long'},custom_neckline:{depths:[65,80,104,90,65]},collar_style:'none',collar_colour:null,garment_fill:'#ABCDEF',decorations:{version:2,strokes:[{mode:'garment',colour:'#123456',width:2,points:[[1000,1000],[5000,6000]]},{kind:'rectangle',mode:'canvas',colour:'#ABCDEF',fill:'#FEDCBA',width:3,points:[[200,200],[3000,3000]]}]}}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
async function harness({initial,fetch=async id=>structuredClone([sketch,garment].find(row=>row.id===id)??null)}={}){
 const original=globalThis.window;globalThis.window=new EventTarget()
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],tree,blockCallback,blocked=null,route=initial,routeKey=0,history=[initial],index=0
 const reads=[],writes=[],scrolls=[],focuses=[]
 const container={scrollTop:1400,getBoundingClientRect:()=>({top:72}),scrollTo(options){scrolls.push(options);this.scrollTop=options.top}}
 const heading={closest(selector){assert.equal(selector,'.portal-content-scroll');return container},getBoundingClientRect:()=>({top:72+220-container.scrollTop}),focus(options){focuses.push(options)},scrollIntoView(){assert.fail('must scroll the portal container, not window')}}
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 const setRoute=id=>{route=id;routeKey++}
 const go=(id,{replace=false,pop=false}={})=>{
  const commit=()=>{if(!pop){if(replace)history[index]=id;else{history=history.slice(0,index+1);history.push(id);index++}}setRoute(id)}
  if(blockCallback?.()){blocked=commit;return false}commit();return true
 }
 const router={Link:()=>null,useParams:()=>({id:route}),useLocation:()=>({key:String(routeKey)}),useNavigate:()=>((path,options)=>go(path.split('/')[3],options)),useBlocker:fn=>{blockCallback=fn;return{state:blocked?'blocked':'unblocked',reset(){blocked=null},proceed(){const commit=blocked;blocked=null;commit?.()}}}}
 globalThis.__designerOpening={hooks,router,model:{...model,designService:{list:async()=>structuredClone([sketch,garment]),get:async id=>{reads.push(id);return fetch(id)},save:async(...args)=>{writes.push(args);return{...args[1],id:args[0],version:1,attached_at:null}},remove:async()=>{}}}}
 let code=ts.transpileModule(readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import (.*?) from ['"](.*?)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  if(spec==='react')return `const ${clause}=globalThis.__designerOpening.hooks;`
  if(spec==='react-router-dom')return `const ${clause}=globalThis.__designerOpening.router;`
  if(spec.endsWith('/designService'))return `const ${clause}=globalThis.__designerOpening.model;`
  if(spec.endsWith('/authService'))return 'const authError=cause=>cause.message;'
  if(clause.startsWith('{'))return 'const DashboardHeading=()=>null,DashboardPanel=()=>null;'
  return `const ${clause}=()=>null;`
 }).replace(/import ['"][^'"]+\.css['"];?/g,'')
 const {default:Page}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID())
 const render=()=>{cursor=0;tree=Page();const target=nodes(tree).find(n=>n.props?.id==='designer-editor-heading');if(target)target.props.ref.current=heading;return tree}
 const flush=async()=>{for(let i=0;i<4;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 return{render,flush,reads,writes,scrolls,focuses,container,get tree(){return tree},get dirty(){return blockCallback()},clickSaved(id){const link=nodes(tree).find(n=>n.props?.to===`/customer/designer/${id}`);assert.ok(link,'saved design has a real link');go(link.props.to.split('/')[3]);render()},back(){const next=index-1;if(next>=0){if(go(history[next],{pop:true}))index=next;render()}},forward(){const next=index+1;if(next<history.length){if(go(history[next],{pop:true}))index=next;render()}},navigate(id){go(id);render()},find(predicate){return nodes(tree).find(predicate)},dispose(){for(const cleanup of cleanups)cleanup?.();globalThis.window=original;delete globalThis.__designerOpening}}
}
function currentFields(ui){const active=ui.find(n=>n.type==='div'&&n.props.hidden===false&&nodes(n).some(child=>child.type?.name==='DesignDrawingEditor'));return nodes(active).find(n=>n.type?.name==='DesignDrawingEditor')?.props.design}
test('Open and edit loads a blank sketch before revealing/focusing its editor in the real portal scroller',async()=>{
 const pending=deferred(),ui=await harness({fetch:()=>pending.promise})
 try{
  ui.render();await ui.flush();ui.container.scrollTop=1400;ui.scrolls.length=0;ui.focuses.length=0
  ui.clickSaved(sketch.id);await ui.flush()
  assert.ok(ui.find(n=>n.props?.role==='status'&&n.props.children==='Loading selected design...'))
  assert.equal(ui.scrolls.length,0,'URL navigation alone cannot reveal an unloaded design')
  pending.resolve(structuredClone(sketch));await ui.flush()
  assert.deepEqual(currentFields(ui),model.editableDesign(sketch));assert.equal(ui.find(n=>n.props?.id==='design-name').props.value,sketch.name)
  assert.equal(ui.find(n=>n.props?.id==='sketch-notes').props.value,sketch.notes);assert.equal(ui.find(n=>n.props?.id==='sketch-category').props.value,sketch.sketch_category)
  assert.equal(ui.container.scrollTop,196);assert.deepEqual(ui.focuses.at(-1),{preventScroll:true});assert.equal(ui.writes.length,0);assert.equal(ui.dirty,false)
 }finally{ui.dispose()}
})
test('template design restores options, neckline, collar, fill and ordered artwork without saving',async()=>{
 const withCollar={...garment,collar_style:'peter_pan',collar_colour:'#FFFFFF'}
 const ui=await harness({initial:garment.id,fetch:async()=>structuredClone(withCollar)})
 try{ui.render();await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(withCollar));assert.equal(ui.find(n=>n.props?.id==='design-garment').props.value,'kurti');assert.equal(ui.dirty,false);assert.equal(ui.writes.length,0);assert.equal(ui.focuses.length,1)}finally{ui.dispose()}
})
test('different IDs reload in the same mounted page; stale successes and failures cannot replace the latest design',async()=>{
 const slow=deferred(),failed=deferred();let sketchRead=0
 const ui=await harness({fetch:id=>id===sketch.id?(++sketchRead===1?slow.promise:failed.promise):Promise.resolve(structuredClone(garment))})
 try{
  ui.render();await ui.flush();ui.clickSaved(sketch.id);await ui.flush();ui.clickSaved(garment.id);await ui.flush()
  assert.deepEqual(currentFields(ui),model.editableDesign(garment))
  slow.resolve(structuredClone(sketch));await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(garment))
  ui.clickSaved(sketch.id);await ui.flush();ui.clickSaved(garment.id);await ui.flush();failed.reject(Error('Late denied response'));await ui.flush()
  assert.deepEqual(currentFields(ui),model.editableDesign(garment));assert.equal(ui.find(n=>n.props?.role==='alert'&&String(n.props.children).includes('Late denied')),undefined);assert.equal(ui.writes.length,0)
 }finally{ui.dispose()}
})
test('direct-link/refresh and browser back/forward restore the selected editor, with no unchanged-work prompt',async()=>{
 const ui=await harness({initial:sketch.id})
 try{
  ui.render();await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(sketch));assert.equal(ui.dirty,false)
  ui.clickSaved(garment.id);await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(garment));assert.equal(ui.dirty,false)
  ui.back();await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(sketch))
  ui.forward();await ui.flush();assert.deepEqual(currentFields(ui),model.editableDesign(garment));assert.equal(ui.focuses.length,4)
 }finally{ui.dispose()}
 const refreshed=await harness({initial:sketch.id});try{refreshed.render();await refreshed.flush();assert.deepEqual(currentFields(refreshed),model.editableDesign(sketch))}finally{refreshed.dispose()}
})
test('unsaved edits require Keep editing or Discard before loading another saved design',async()=>{
 const ui=await harness({initial:sketch.id})
 try{
  ui.render();await ui.flush();ui.find(n=>n.props?.id==='sketch-notes').props.onChange({target:{value:'Unsaved note'}});ui.render();assert.equal(ui.dirty,true)
  ui.clickSaved(garment.id);await ui.flush();assert.deepEqual(ui.reads,[sketch.id]);assert.ok(ui.find(n=>n.props?.role==='alertdialog'))
  ui.find(n=>n.props?.children==='Keep editing').props.onClick();ui.render();assert.equal(currentFields(ui).notes,'Unsaved note')
  ui.clickSaved(garment.id);ui.find(n=>n.props?.children==='Discard and leave').props.onClick();ui.render();await ui.flush()
  assert.deepEqual(currentFields(ui),model.editableDesign(garment));assert.equal(ui.dirty,false);assert.equal(ui.writes.length,0)
 }finally{ui.dispose()}
})
test('missing/unauthorized/load-error states hide the old editor, offer retry and never focus failed content',async()=>{
 let denied=true;const ui=await harness({initial:sketch.id,fetch:async id=>{if(id===sketch.id)return structuredClone(sketch);if(denied)throw Error('Permission denied');return null}})
 try{
  ui.render();await ui.flush();const focused=ui.focuses.length;ui.navigate(garment.id);await ui.flush()
  assert.equal(currentFields(ui),undefined);assert.ok(ui.find(n=>n.props?.role==='alert'));assert.equal(ui.focuses.length,focused)
  denied=false;ui.find(n=>n.props?.children==='Retry loading').props.onClick();ui.render();await ui.flush()
  assert.ok(ui.find(n=>n.props?.role==='alert'&&nodes(n).some(child=>typeof child.props?.children==='string'&&child.props.children.includes('not found')))||ui.find(n=>n.props?.role==='alert'))
  assert.equal(currentFields(ui),undefined);assert.equal(ui.dirty,false);assert.equal(ui.writes.length,0)
 }finally{ui.dispose()}
})

