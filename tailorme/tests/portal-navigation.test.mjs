import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/PortalLayout.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
code=code.replace(/import \{[^}]+\} from 'react';/,'const useEffect=(...a)=>globalThis.__portalNavigation.hooks.useEffect(...a),useRef=(...a)=>globalThis.__portalNavigation.hooks.useRef(...a),useState=(...a)=>globalThis.__portalNavigation.hooks.useState(...a);')
 .replace(/import \{ Link, NavLink, useLocation \} from '[^']+';/,'const Link=()=>null,NavLink=()=>null,useLocation=()=>globalThis.__portalNavigation.location;')
 .replace(/import \{ dashboardPath, usePortal \} from '[^']+';/,"const dashboardPath=role=>'/'+role+'/dashboard',usePortal=()=>({role:globalThis.__portalNavigation.role,profile:{full_name:'Local Account'},retry(){}});")
 .replace(/import (\w+) from '[^']+';/g,'const $1=()=>null;').replace(/import '[^']+\.css';/g,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const {default:Layout}=await import(url(code))
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
function harness(role){
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],tree,focuses=0,shows=0,closes=0
 const mediaListeners=new Set(),media={matches:false,addEventListener(_event,fn){mediaListeners.add(fn)},removeEventListener(_event,fn){mediaListeners.delete(fn)}}
 const body={style:{overflow:'auto'}},html={style:{overflow:'scroll'}},content={style:{overflow:'auto'},scrollTop:190},trigger={isConnected:true,focus(options){assert.equal(options.preventScroll,true);focuses++}}
 const modal={open:false,showModal(){this.open=true;shows++},close(){if(this.open){this.open=false;closes++;findDialog()?.props.onClose()}}}
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((value,j)=>value!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 globalThis.__portalNavigation={hooks,role,location:{key:'route-one'}}
 globalThis.document={body,documentElement:html,addEventListener(){},removeEventListener(){}}
 globalThis.window={matchMedia:query=>{assert.equal(query,'(min-width: 1024px)');return media}}
 const findDialog=()=>nodes(tree).find(n=>n.type==='dialog')
 const render=()=>{cursor=0;tree=Layout({children:'PAGE CONTENT'});for(const node of nodes(tree)){if(node.props?.className==='portal-menu-toggle')node.props.ref.current=trigger;if(node.type==='dialog')node.props.ref.current=modal;if(node.props?.className==='portal-content-scroll')node.props.ref.current=content}return tree}
 const settle=async()=>{for(let i=0;i<3;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 const toggle=()=>nodes(tree).find(n=>n.props?.className==='portal-menu-toggle')
 return{render,settle,get tree(){return tree},findDialog,toggle,body,html,content,modal,media,mediaListeners,get focuses(){return focuses},get shows(){return shows},get closes(){return closes},dispose(){for(const fn of cleanups)fn?.()}}
}

test('customer/tailor sidebars keep their own links, header has no duplicate menu, and admin retains its existing shell',async()=>{
 const original={window:globalThis.window,document:globalThis.document}
 try{for(const role of ['customer','tailor','admin']){
  const h=harness(role)
  try{
   h.render();await h.settle();const tree=h.tree,sidebar=nodes(tree).find(n=>n.type==='aside'),header=nodes(tree).find(n=>n.type==='header'),links=nodes(sidebar).map(n=>n.props?.to).filter(Boolean)
   assert.equal(links.includes(`/${role}/dashboard`),true);assert.equal(nodes(header).filter(n=>n.type==='nav').length,0,'top bar contains branding/account controls, not duplicated navigation')
   assert.equal(nodes(header).some(n=>n.props?.to==='/account'),true)
   if(role==='customer'){for(const route of ['/customer/measurements','/customer/designer','/customer/requests','/become-a-tailor'])assert.ok(links.includes(route));assert.ok(!links.includes('/tailor/profile'));assert.ok(!links.includes('/tailor/requests'))}
   if(role==='tailor'){assert.ok(links.includes('/tailor/profile'));assert.ok(links.includes('/tailor/requests'));assert.ok(!links.some(route=>route.startsWith('/customer/')));assert.ok(!links.includes('/become-a-tailor'))}
   if(role==='admin'){assert.ok(links.includes('/admin/tailor-applications'));assert.equal(h.findDialog(),undefined);assert.equal(nodes(tree).filter(n=>n.props?.className==='portal-content-scroll').length,0);assert.doesNotMatch(tree.props.className,/portal-fixed/)}else{
    assert.match(tree.props.className,/portal-fixed/);assert.equal(nodes(tree).filter(n=>n.props?.className==='portal-content-scroll').length,1);assert.ok(h.findDialog());assert.equal(h.toggle().props['aria-haspopup'],'dialog')
    const designer=nodes(sidebar).find(n=>n.props?.to===`/${role}/designer`);if(designer)assert.equal(designer.props.className({isActive:true}),'portal-nav-active')
   }
  }finally{h.dispose()}
 }}finally{Object.assign(globalThis,original);delete globalThis.__portalNavigation}
})

test('actual drawer uses native modal/focus semantics, closes on Escape/backdrop/navigation/resize, and restores scroll locks',async()=>{
 const original={window:globalThis.window,document:globalThis.document,Element:globalThis.Element}
 class LocalElement{closest(selector){return selector==='a'?this:null}}
 globalThis.Element=LocalElement
 const h=harness('customer')
 try{
  h.render();await h.settle()
  const open=async()=>{h.toggle().props.onClick();await h.settle();assert.equal(h.modal.open,true);assert.equal(h.body.style.overflow,'hidden');assert.equal(h.html.style.overflow,'hidden');assert.equal(h.content.style.overflow,'hidden');assert.equal(String(h.findDialog().props['aria-modal']),'true');assert.ok(nodes(h.findDialog()).some(n=>n.props?.autoFocus===true))}
  const closed=()=>{assert.equal(h.modal.open,false);assert.equal(h.toggle().props['aria-expanded'],false);assert.equal(h.body.style.overflow,'auto');assert.equal(h.html.style.overflow,'scroll');assert.equal(h.content.style.overflow,'auto');assert.equal(h.content.scrollTop,190)}
  await open();let cancelled=false;h.findDialog().props.onCancel({preventDefault(){cancelled=true}});await h.settle();closed();assert.equal(cancelled,true);assert.equal(h.focuses,1)
  await open();const backdrop={};h.findDialog().props.onClick({target:backdrop,currentTarget:backdrop});await h.settle();closed();assert.equal(h.focuses,2)
  await open();nodes(h.findDialog()).find(n=>n.type==='nav').props.onClick({target:new LocalElement()});await h.settle();closed()
  await open();globalThis.__portalNavigation.location={key:'route-two'};h.render();await h.settle();closed();globalThis.__portalNavigation.location={key:'route-one'};h.render();await h.settle();closed();assert.equal(h.shows,4,'Back navigation must not reopen the old drawer')
  await open();const focusBefore=h.focuses;h.media.matches=true;for(const fn of h.mediaListeners)fn();await h.settle();closed();assert.equal(h.focuses,focusBefore,'resizing to desktop does not focus the hidden hamburger')
  h.media.matches=false;await open();h.dispose();assert.equal(h.body.style.overflow,'auto');assert.equal(h.content.style.overflow,'auto');assert.equal(h.mediaListeners.size,0,'unmount removes responsive listener')
 }finally{h.dispose();Object.assign(globalThis,original);delete globalThis.__portalNavigation}
})
