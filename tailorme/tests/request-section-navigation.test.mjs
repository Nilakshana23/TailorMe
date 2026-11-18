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

const {revealRequestSection}=await load('../src/utils/requestSectionNavigation.ts')
function dom(){
 const names=['document','Node','MutationObserver','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'],original=Object.fromEntries(names.map(name=>[name,globalThis[name]]))
 const frames=new Map(),timers=new Map(),scrolls=[],focus=[];let serial=0,notify,present=false,busy=true,before=true,disconnected=false
 const heading={getBoundingClientRect:()=>({top:72+900-container.scrollTop}),setAttribute(name,value){assert.equal(name,'tabindex');assert.equal(value,'-1')},focus(options){focus.push(options)}}
 const target={getAttribute:()=>busy?'true':'false',querySelector:()=>heading}
 const preceding={compareDocumentPosition:()=>4},following={compareDocumentPosition:()=>2}
 const detail={querySelector:()=>present?target:null,querySelectorAll:()=>[...(before?[preceding]:[]),following]}
 const container={scrollTop:400,querySelector:()=>detail,getBoundingClientRect:()=>({top:72}),scrollTo(options){scrolls.push(options);this.scrollTop=options.top}}
 globalThis.document={querySelector:()=>container};globalThis.Node={DOCUMENT_POSITION_FOLLOWING:4}
 globalThis.MutationObserver=class {constructor(callback){notify=callback}observe(){}disconnect(){disconnected=true}}
 globalThis.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id};globalThis.cancelAnimationFrame=id=>frames.delete(id)
 globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id};globalThis.clearTimeout=id=>timers.delete(id)
 return{container,scrolls,focus,frames,timers,set(options){if('present'in options)present=options.present;if('busy'in options)busy=options.busy;if('before'in options)before=options.before},mutate(){notify()},flush(){while(frames.size){const pending=[...frames.entries()];frames.clear();for(const [,fn]of pending)fn()}},get disconnected(){return disconnected},restore(){Object.assign(globalThis,original)}}
}
test('async target and preceding sections are awaited, then the real portal scroller moves with a header gap and focus',()=>{
 const d=dom();let failed=false
 try{
  const cancel=revealRequestSection('request','#payments',()=>{failed=true})
  assert.equal(d.frames.size,0)
  d.set({present:true});d.mutate();assert.equal(d.frames.size,0,'loading target must not scroll')
  d.set({busy:false});d.mutate();assert.equal(d.frames.size,0,'preceding loading sections could still shift target')
  d.set({before:false});d.mutate();d.flush()
  assert.deepEqual(d.scrolls,[{top:876,behavior:'auto'}]);assert.deepEqual(d.focus,[{preventScroll:true}]);assert.equal(failed,false);assert.equal(d.disconnected,true);assert.equal(d.timers.size,0)
  cancel()
  d.container.scrollTop=0
  revealRequestSection('request','#payments',()=>{failed=true});d.flush();assert.equal(d.scrolls.length,2,'same-request/hash activation can reveal the section again')
 }finally{d.restore()}
})
test('missing section produces an unavailable notice, while cancelled/stale navigation never scrolls',()=>{
 const d=dom();let failed=0
 try{
  revealRequestSection('missing','#progress',()=>{failed++});for(const callback of [...d.timers.values()])callback()
  assert.equal(failed,1);assert.equal(d.disconnected,true);assert.deepEqual(d.scrolls,[])
  const cancel=revealRequestSection('request','#messages',()=>{failed++});d.set({present:true,busy:false,before:false});d.mutate();cancel();d.flush();assert.deepEqual(d.scrolls,[]);assert.equal(d.timers.size,0)
 }finally{d.restore()}
})

