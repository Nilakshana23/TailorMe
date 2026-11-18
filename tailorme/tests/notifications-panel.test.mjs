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

const presentation=await load('../src/utils/notificationPresentation.ts')
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
const note=(n,read=false)=>({id:'notice-'+n,request_id:'request-'+n,kind:'message_received',created_at:'2026-11-12T06:00:00Z',read_at:read?'2026-11-12T07:00:00Z':null,confirmed_date:null,request:{customer_id:'requester',tailor_id:'provider'}})
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
async function harness({fetch=async()=>({rows:[note(1),note(2,true)],unread:1}),read=async()=>{},role='customer'}={}){
 const originals={window:globalThis.window,document:globalThis.document};globalThis.window=new EventTarget();globalThis.document=new EventTarget()
 const state=[],deps=[],cleanups=[],reads=[],pages=[],focus=[],navigations=[];let cursor=0,effects=[],tree,userId='requester'
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 globalThis.__notificationPanel={useNavigate:()=>((...args)=>navigations.push(args)),hooks,...presentation,Link:()=>null,usePortal:()=>({role}),useAuth:()=>({session:{user:{id:userId}}}),workService:{notifications:async page=>{pages.push(page);return fetch(page)},read:async id=>{reads.push(id);return read(id)}}}
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/NotificationBell.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import (.*?) from ['"](.*?)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  return `const ${clause}=${spec==='react'?'globalThis.__notificationPanel.hooks':'globalThis.__notificationPanel'};`
 }).replace(/import ['"][^'"]+\.css['"];?/g,'')
 const {default:Page}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID())
 const render=()=>{cursor=0;tree=Page();for(const n of nodes(tree)){if(n.props?.className==='notification-trigger')n.props.ref.current={focus(options){focus.push(['bell',options])}};if(n.props?.['aria-label']==='Close notifications')n.props.ref.current={focus(options){focus.push(['close',options])}}}return tree}
 const flush=async()=>{for(let i=0;i<3;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 return{render,flush,reads,pages,focus,navigations,get tree(){return tree},find(predicate){return nodes(tree).find(predicate)},button(label){return nodes(tree).find(n=>n.type==='button'&&(n.props?.['aria-label']===label||n.props?.children===label))},open(){nodes(tree).find(n=>n.props?.className==='notification-trigger').props.onClick();render()},setUser(id){userId=id;render()},dispose(){for(const cleanup of cleanups)cleanup?.();Object.assign(globalThis,originals);delete globalThis.__notificationPanel}}
}
test('opening a labelled non-modal dialog focuses Close, Escape/close return focus, and opening never marks items read',async()=>{
 const ui=await harness()
 try{
  ui.render();await ui.flush();assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined)
  ui.open();await ui.flush();const panel=ui.find(n=>n.props?.role==='dialog')
  assert.equal(panel.props['aria-labelledby'],'notification-panel-title');assert.equal(panel.props['aria-modal'],undefined)
  assert.deepEqual(ui.focus.at(-1),['close',{preventScroll:true}]);assert.equal(ui.reads.length,0)
  const escape=new Event('keydown',{cancelable:true});Object.defineProperty(escape,'key',{value:'Escape'});document.dispatchEvent(escape);ui.render();await ui.flush()
  assert.equal(escape.defaultPrevented,true);assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined);assert.equal(ui.focus.at(-1)[0],'bell')
  ui.open();await ui.flush();ui.button('Close notifications').props.onClick();ui.render();assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined);assert.equal(ui.focus.at(-1)[0],'bell')
 }finally{ui.dispose()}
})
test('unread rows have text, dot and tint, read rows stay neutral, positive counts cap visually, exact times are focusable',async()=>{
 const ui=await harness({fetch:async()=>({rows:[note(1),note(2,true)],unread:123})})
 try{
  ui.render();await ui.flush();ui.open();await ui.flush()
  assert.equal(ui.find(n=>n.props?.className==='notification-count').props.children,'99+')
  assert.equal(ui.find(n=>n.props?.className==='notification-panel-count').props['aria-label'],'123 unread notifications')
  const rows=nodes(ui.tree).filter(n=>n.type==='li');assert.match(rows[0].props.className,/notification-row-unread/);assert.doesNotMatch(rows[1].props.className,/notification-row-unread/)
  assert.ok(nodes(rows[0]).some(n=>n.props?.children==='Unread'));assert.ok(nodes(rows[0]).some(n=>n.props?.className==='notification-unread-dot'));assert.ok(!nodes(rows[1]).some(n=>n.props?.children==='Read'))
  const time=ui.find(n=>n.type==='time');assert.match(time.props['aria-label'],/Sri Lanka/);assert.match(time.props.title,/11:30:00/)
  assert.ok(ui.find(n=>n.props?.children==='Updates about your requests'));assert.ok(!nodes(ui.tree).some(n=>typeof n.props?.children==='string'&&n.props.children.includes('device push')))
 }finally{ui.dispose()}
 const zero=await harness({fetch:async()=>({rows:[],unread:0})});try{zero.render();await zero.flush();zero.open();await zero.flush();assert.equal(zero.find(n=>n.props?.className==='notification-count'),undefined);assert.equal(zero.find(n=>n.props?.className==='notification-panel-count'),undefined);assert.ok(zero.find(n=>n.props?.children==='No notifications yet.'))}finally{zero.dispose()}
})
test('refresh loading and failure retain existing rows and the last real count; retry can recover',async()=>{
 let calls=0;const pending=deferred()
 const ui=await harness({fetch:async()=>{calls++;if(calls===2)return pending.promise;return{rows:[note(1)],unread:1}}})
 try{
  ui.render();await ui.flush();ui.open();await ui.flush();ui.button('Refresh notifications').props.onClick();ui.render();await ui.flush()
  assert.ok(ui.find(n=>n.props?.children==='Refreshing notifications...'));assert.ok(ui.find(n=>n.type==='li'));assert.equal(ui.button('Refreshing notifications').props.disabled,true)
  pending.reject(Error('Offline'));await ui.flush();assert.ok(ui.find(n=>n.props?.role==='alert'));assert.ok(ui.find(n=>n.type==='li'));assert.equal(ui.find(n=>n.props?.className==='notification-count').props.children,1)
  ui.button('Refresh notifications').props.onClick();ui.render();await ui.flush();assert.equal(ui.find(n=>n.props?.role==='alert'),undefined)
  ui.setUser('another-user');assert.equal(ui.find(n=>n.type==='li'),undefined);assert.equal(ui.find(n=>n.props?.className==='notification-count'),undefined)
 }finally{ui.dispose()}
})
test('pagination preserves order, disables during loads and supports previous on an empty later page',async()=>{
 const first=Array.from({length:20},(_,i)=>note(i)),last=[note(20,true)]
 let empty=false
 const ui=await harness({fetch:async page=>({rows:page===0?first:page===1&&!empty?last:[],unread:20})})
 try{
  ui.render();ui.open();assert.ok(ui.find(n=>n.props?.children==='Loading notifications...'));await ui.flush()
  assert.deepEqual(nodes(ui.tree).filter(n=>n.type==='li').map(n=>n.key),first.map(row=>row.id));assert.equal(ui.button('Previous').props.disabled,true)
  ui.button('Next').props.onClick();ui.render();await ui.flush();assert.deepEqual(ui.pages,[0,1]);assert.equal(ui.button('Next').props.disabled,true);assert.ok(ui.find(n=>n.props?.to==='/customer/requests/request-20#messages'))
  empty=true;ui.button('Refresh notifications').props.onClick();ui.render();await ui.flush();assert.ok(ui.find(n=>n.props?.children==='No notifications on this page.'));assert.equal(ui.button('Previous').props.disabled,false)
  ui.button('Previous').props.onClick();ui.render();await ui.flush();assert.deepEqual(ui.pages,[0,1,1,0]);assert.equal(nodes(ui.tree).filter(n=>n.type==='li').length,20)
 }finally{ui.dispose()}
})
test('initial failures do not invent a count, can retry, and existing focus polling still refreshes',async()=>{
 let failed=true,calls=0
 const ui=await harness({fetch:async()=>{calls++;if(failed)throw Error('Offline');return{rows:[note(1)],unread:1}}})
 try{
  ui.render();ui.open();await ui.flush();assert.ok(ui.find(n=>n.props?.role==='alert'));assert.equal(ui.find(n=>n.props?.className==='notification-count'),undefined)
  failed=false;ui.button('Refresh notifications').props.onClick();ui.render();await ui.flush();assert.equal(calls,2);assert.equal(ui.find(n=>n.props?.role==='alert'),undefined)
  const focusCount=ui.focus.length;window.dispatchEvent(new Event('focus'));ui.render();await ui.flush();assert.equal(calls,3);assert.equal(ui.focus.length,focusCount,'background refresh does not steal focus')
  window.dispatchEvent(new Event('tailorme:notifications-changed'));ui.render();await ui.flush();assert.equal(calls,4)
 }finally{ui.dispose()}
})
test('mark-as-read is explicit, refreshes the real count, and navigation closes to the correct participant destination',async()=>{
 let marked=false
 const ui=await harness({role:'tailor',fetch:async()=>({rows:[{...note(1,marked),kind:'payment_confirmed'}],unread:marked?0:1}),read:async()=>{marked=true}})
 try{
  ui.render();await ui.flush();ui.open();await ui.flush();assert.deepEqual(ui.reads,[])
  ui.button('Mark as read').props.onClick();await ui.flush();assert.deepEqual(ui.reads,['notice-1']);assert.equal(ui.find(n=>n.props?.className==='notification-count'),undefined)
  const link=ui.find(n=>n.props?.className==='notification-row-link');assert.equal(link.props.to,'/tailor/orders/request-1#payments');link.props.onClick();ui.render();assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined);assert.equal(ui.focus.at(-1)[0],'bell')
  assert.equal(presentation.notificationDestination({...note(1),kind:'design_proposed'},'tailor','provider'),'/tailor/requests/request-1#design-proposals')
 }finally{ui.dispose()}
})
test('relative times are concise with exact Sri Lanka conversion and styles provide one scrolling body',()=>{
 const now=Date.parse('2026-11-12T06:05:00Z')
 assert.equal(presentation.notificationRelativeTime('2026-11-12T06:04:59Z',now),'Just now')
 assert.match(presentation.notificationRelativeTime('2026-11-12T06:00:00Z',now),/5 min/)
 assert.match(presentation.notificationExactTime('2026-11-12T06:00:00Z'),/11:30:00.*Sri Lanka/)
 const css=readFileSync(new URL('../src/components/portal/NotificationBell.css',import.meta.url),'utf8')
 assert.match(css,/notification-panel-body[^}]*overflow-y:auto/);assert.match(css,/notification-panel-header[^}]*flex-shrink:0/);assert.match(css,/notification-time:is\(:hover,:focus-within\)/);assert.match(css,/@media\(max-width:640px\)/)
})
test('whole row activates by mouse or native keyboard click, closes, navigates immediately and reads only that item',async()=>{
 let marked=false
 const pending=deferred(),ui=await harness({fetch:async()=>({rows:[note(1,marked),note(2)],unread:marked?1:2}),read:async()=>{await pending.promise;marked=true}})
 try{
  ui.render();await ui.flush();ui.open();await ui.flush()
  let link=ui.find(n=>n.props?.className==='notification-row-link')
  assert.ok(nodes(link).some(n=>n.type==='time'),'timestamp is inside the real row link')
  assert.ok(!nodes(link).some(n=>n.type==='button'),'read control is not nested in the anchor')
  let prevented=false;link.props.onClick({button:0,detail:1,preventDefault(){prevented=true}});ui.render()
  assert.equal(prevented,true);assert.equal(ui.navigations[0][0],'/customer/requests/request-1#messages');assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined);assert.deepEqual(ui.reads,['notice-1'])
  pending.resolve();await ui.flush();assert.equal(ui.find(n=>n.props?.className==='notification-count').props.children,1)
  ui.open();await ui.flush();link=ui.find(n=>n.props?.className==='notification-row-link')
  link.props.onClick({button:0,detail:0,preventDefault(){}});ui.render()
  assert.equal(ui.navigations.length,2,'Enter activation uses the same native anchor click path')
  assert.notEqual(ui.navigations[0][1].state.notificationActivation,ui.navigations[1][1].state.notificationActivation,'identical request/hash activation has a fresh navigation token')
  assert.deepEqual(ui.reads,['notice-1'],'a previously read item is not read again')
 }finally{ui.dispose()}
})
test('read failure cannot block navigation, and missing/private destinations show unavailable content instead of invented links',async()=>{
 const ui=await harness({role:'tailor',fetch:async()=>({rows:[{...note(1),kind:'stage_changed'}],unread:1}),read:async()=>{throw Error('Read failed')}})
 try{
  ui.render();await ui.flush();ui.open();await ui.flush();ui.find(n=>n.props?.className==='notification-row-link').props.onClick({button:0,preventDefault(){}});ui.render();await ui.flush()
  assert.equal(ui.navigations[0][0],'/tailor/orders/request-1#progress');assert.equal(ui.find(n=>n.props?.role==='dialog'),undefined)
  assert.ok(ui.find(n=>n.props?.className==='notification-feedback'));assert.equal(ui.find(n=>n.props?.className==='notification-count').props.children,1)
  assert.equal(presentation.notificationDestination({...note(1),request:null},'tailor','requester'),null)
  assert.equal(presentation.notificationDestination(note(1),'tailor','unrelated'),null)
  assert.equal(presentation.notificationDestination({...note(1),request_id:'//evil.test'},'customer','requester'),null)
 }finally{ui.dispose()}
 const missing=await harness({fetch:async()=>({rows:[{...note(1),request:null}],unread:1})})
 try{missing.render();await missing.flush();missing.open();await missing.flush();assert.ok(missing.find(n=>n.props?.className==='notification-unavailable'));assert.equal(missing.find(n=>n.props?.className==='notification-row-link'),undefined);assert.deepEqual(missing.navigations,[])}finally{missing.dispose()}
})
test('all supported event types resolve their real participant section and modified clicks keep native link behaviour',async()=>{
 for(const [kind,hash] of [['payment_confirmed','#payments'],['stage_changed','#progress'],['design_proposed','#design-proposals'],['message_received','#messages'],['quote_sent','#quotations'],['due_today','#work']]){
  assert.equal(presentation.notificationDestination({...note(1),kind},'tailor','provider'),'/tailor/requests/request-1'+hash)
  assert.equal(presentation.notificationDestination({...note(1),kind},'tailor','requester'),'/tailor/orders/request-1'+hash)
  assert.equal(presentation.notificationDestination({...note(1),kind},'customer','requester'),'/customer/requests/request-1'+hash)
 }
 const ui=await harness();try{ui.render();await ui.flush();ui.open();await ui.flush();ui.find(n=>n.props?.className==='notification-row-link').props.onClick({button:0,ctrlKey:true,preventDefault(){assert.fail('modified click must stay native')}});assert.deepEqual(ui.navigations,[])}finally{ui.dispose()}
})

