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

const {setSupabase}=await load('../src/lib/supabase.ts')
const {shopService}=await load('../src/services/shopService.ts')
const {requestService}=await load('../src/services/requestService.ts')
const {workService}=await load('../src/services/workService.ts')
const {safeReturnDestination,authPath,afterLogin}=await load('../src/utils/authNavigation.ts')
const {AuthContext}=await load('../src/auth/authContext.ts')
const {PortalContext}=await load('../src/auth/portalContext.ts')
const {default:Composer}=await load('../src/components/portal/RequestComposer.tsx')
const {default:Layout}=await load('../src/components/portal/PortalLayout.tsx')
const {default:Card}=await load('../src/components/portal/CustomerRequestCard.tsx')
const h=React.createElement,user='d1000000-0000-4000-8000-000000000001',provider='d1000000-0000-4000-8000-000000000002'
function render(child,role='tailor'){return renderToString(h(MemoryRouter,null,h(AuthContext.Provider,{value:{session:{user:{id:user}},loading:false}},h(PortalContext.Provider,{value:{role,status:'ready',profile:{id:user,full_name:'Requester A'}}},child))))}
function database(tables){
 const calls=[]
 return {calls,from(table){let rows=[...(tables[table]??[])],head=false,exact=false,start=0,end=Infinity
  const query={select(columns,options={}){calls.push(['select',table,columns,options]);head=!!options.head;exact=options.count==='exact';return this},eq(column,value){calls.push(['eq',column,value]);rows=rows.filter(row=>row[column]===value);return this},neq(column,value){calls.push(['neq',column,value]);rows=rows.filter(row=>row[column]!==value);return this},is(column,value){calls.push(['is',column,value]);rows=rows.filter(row=>row[column]===value);return this},lt(column,value){rows=rows.filter(row=>row[column]&&row[column]<value);return this},not(column,_op,value){rows=rows.filter(row=>row[column]!==value);return this},ilike(column,value){calls.push(['ilike',column,value]);rows=rows.filter(row=>row[column].toLowerCase().includes(value.replaceAll('%','').toLowerCase()));return this},order(column,{ascending=true}={}){rows.sort((a,b)=>String(a[column]).localeCompare(String(b[column]))*(ascending?1:-1));return this},range(a,b){calls.push(['range',a,b]);start=a;end=b;return this},limit(n){end=n-1;return this},then(resolve,reject){return Promise.resolve({data:head?null:rows.slice(start,end+1),count:exact?rows.length:null,error:null}).then(resolve,reject)}}
  return query
 }}
}
test('directory excludes only the owner in the database query before count and page, preserving filters and customer results',async()=>{
 const shops=[{owner_id:user,shop_name:'000 Own shop',is_published:true,city:'Colombo',specialties:'Bridal'},...Array.from({length:14},(_,i)=>({owner_id:'other-'+i,shop_name:'Shop '+i,is_published:true,city:'Colombo',specialties:'Bridal'}))]
 const db=database({tailor_profiles:shops});setSupabase(db)
 try{
  const fields={search:'',city:'Colombo',specialty:'Bridal',page:0,excludeOwnerId:user}
  const first=await shopService.directory(fields),second=await shopService.directory({...fields,page:1})
  assert.equal(first.count,14);assert.equal(first.shops.length,12);assert.equal(second.count,14);assert.equal(second.shops.length,2)
  assert.ok(!first.shops.some(row=>row.owner_id===user));assert.ok(db.calls.findIndex(call=>call[0]==='neq')<db.calls.findIndex(call=>call[0]==='range'))
  assert.ok(db.calls.some(call=>call[0]==='ilike'&&call[1]==='specialties'))
  const customer=await shopService.directory({...fields,excludeOwnerId:undefined});assert.equal(customer.count,15)
  const search=await shopService.directory({...fields,search:'Own shop'});assert.equal(search.count,0)
 }finally{setSupabase(null)}
})
test('received and outgoing requests have explicit independent query scopes; summaries count only addressed-provider work',async()=>{
 const rows=[{id:'outgoing',customer_id:user,tailor_id:provider,status:'accepted',completed_at:null,confirmed_date:'2020-01-01',created_at:'2026-10-30'},{id:'incoming',customer_id:provider,tailor_id:user,status:'pending',completed_at:null,confirmed_date:null,created_at:'2026-10-29'}]
 const db=database({tailoring_requests:rows});setSupabase(db)
 try{
  assert.deepEqual((await requestService.list(0,'all',{userId:user,side:'requester'})).map(row=>row.id),['outgoing'])
  assert.deepEqual((await requestService.list(0,'all',{userId:user,side:'provider'})).map(row=>row.id),['incoming'])
  const overview=await workService.overview(user);assert.deepEqual(overview.counts,[1,0,0,0]);assert.deepEqual(overview.priority,[])
 }finally{setSupabase(null)}
})
test('tailor ordering form/nav/card reuse role without customer tools; own shop and admin ordering stay disabled',()=>{
 const html=render(h(Composer,{tailorId:provider,available:true,designId:'unavailable-customer-design'}))
 assert.match(html,/Send tailoring request/);assert.match(html,/Reference images \(optional\)/);assert.match(html,/href="\/tailor\/orders"/)
 assert.doesNotMatch(html,/customer\/measurements|Review or change this design|Loading selected design|Optional measurement sharing/)
 assert.doesNotMatch(render(h(Composer,{tailorId:user,available:true})),/<form/)
 assert.doesNotMatch(render(h(Composer,{tailorId:provider,available:true}),'admin'),/<form/)
 const nav=render(h(Layout,null,'content'));assert.match(nav,/Received Requests/);assert.match(nav,/My Orders/);assert.match(nav,/href="\/tailor\/orders"/);assert.doesNotMatch(nav,/Dress Designer|My Measurements/)
 const card=render(h(Card,{request:{id:'outgoing',garment_type:'Dress',shop_name:'Provider B',customer_name:'A',status:'pending',quantity:1,preferred_date:'2026-12-01',created_at:'2026-10-31'},base:'/tailor/orders'}))
 assert.match(card,/href="\/tailor\/orders\/outgoing#messages"/);assert.match(card,/Provider B/);assert.match(card,/Awaiting tailor response/)
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 for(const path of ['/tailor/orders','/tailor/orders/:id'])assert.ok(app.includes('<Route path="'+path+'" element={<PortalGuard role="tailor">'))
})

async function interactive(file,dependencies,seed={}){
 const slots=[],deps=[],cleanups=[];let cursor=0,effects=[]
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=i in seed?seed[i]:typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 globalThis.__ordering={useNavigate:()=>()=>{},...dependencies,hooks}
 let code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import (.*?) from ['"](.*?)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  if(spec.endsWith('/requestSectionNavigation'))return `import ${clause} from '${moduleUrl(new URL('../src/utils/requestSectionNavigation.ts',import.meta.url))}';`
  if(spec.endsWith('/notificationPresentation'))return `import ${clause} from '${moduleUrl(new URL('../src/utils/notificationPresentation.ts',import.meta.url))}';`
  if(spec==='react')return `const ${clause}=globalThis.__ordering.hooks;`
  if(clause.startsWith('{'))return `const ${clause}=globalThis.__ordering;`
  return `const ${clause}=(props)=>props.children??null;`
 }).replace(/import ['"][^'"]+\.css['"];?/g,'')
 const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID())
 return{render(props){cursor=0;return Component(props)},async flush(){for(const fn of effects.splice(0))fn();await new Promise(setImmediate)},dispose(){for(const fn of cleanups)fn?.()}}
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
test('tailor directory waits for restored auth and trusted role before personalized queries',async()=>{
 const original=globalThis.window;globalThis.window=new EventTarget();let loading=true,status='loading',calls=[]
 const ui=await interactive('../src/pages/TailorDirectoryPage.tsx',{useAuth:()=>({session:{user:{id:user}},loading}),usePortal:()=>({role:'tailor',status}),useSearchParams:()=>[new URLSearchParams('design=saved&page=2'),()=>{}],shopService:{directory:async filters=>{calls.push(filters);return{shops:[],count:0}}}})
 try{
  ui.render();await ui.flush();assert.equal(calls.length,0)
  loading=false;ui.render();await ui.flush();assert.equal(calls.length,0)
  status='ready';ui.render();await ui.flush();assert.equal(calls.length,1);assert.equal(calls[0].excludeOwnerId,user);assert.equal(calls[0].page,1)
 }finally{ui.dispose();globalThis.window=original;delete globalThis.__ordering}
})
test('tailor submit and ambiguous-response recovery return to My Orders and never auto-share stale customer data',async()=>{
 const fields={garment_type:'Dress',description:'Please make this dress for an event.',quantity:1,preferred_date:'2026-12-01'}
 for(const ambiguous of [false,true]){
  const sent=[],navigations=[]
  const ui=await interactive('../src/components/portal/RequestComposer.tsx',{usePortal:()=>({role:'tailor',status:'ready',profile:{id:user}}),useNavigate:()=>((...args)=>navigations.push(args)),validateRequest:()=>'',requestDefinitelyRejected:()=>false,authError:String,requestService:{send:async(...args)=>{sent.push(args);if(ambiguous)throw Error('Lost response');return{id:'saved-order'}},get:async()=>({id:'saved-order'})}},{0:fields,6:{values_cm:{waist:80},measured_on:'2026-10-31'},9:true})
  const tree=ui.render({tailorId:provider,available:true,designId:'customer-design'})
  await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
  assert.equal(sent.length,1);assert.equal(sent[0][3],undefined);assert.equal(sent[0][4],undefined)
  assert.equal(navigations[0][0],'/tailor/orders/saved-order');assert.equal(navigations[0][1].state.sent,true)
 }
 delete globalThis.__ordering
})
test('notifications use participant identity for incoming/outgoing links and keep the correct workflow anchor',async()=>{
 for(const outgoing of [true,false]){
  const ui=await interactive('../src/components/portal/NotificationBell.tsx',{useAuth:()=>({session:{user:{id:user}}}),usePortal:()=>({role:'tailor'}),Link:()=>null},{0:true,3:{key:`${user}:0:0`,rows:[{id:'alert',request_id:'order',request:{customer_id:outgoing?user:provider,tailor_id:outgoing?provider:user},kind:'payment_confirmed',created_at:'2026-10-31',read_at:null}],unread:1,error:''}})
  const tree=ui.render();assert.ok(nodes(tree).some(n=>n.props?.to===`${outgoing?'/tailor/orders':'/tailor/requests'}/order#payments`))
 }
 for(const path of ['/tailor/orders/order?filter=accepted#messages','/tailor/requests/order#payments','/customer/requests/order']){
  assert.equal(safeReturnDestination(path),path);assert.equal(afterLogin(path),path);assert.ok(authPath('/login',path).includes('returnTo='))
 }
 assert.equal(safeReturnDestination('//evil.test'),null);assert.equal(safeReturnDestination('/tailor/orders/../../admin/dashboard'),null)
 delete globalThis.__ordering
})
test('compatible tailor detail links redirect by participant identity, preserving workflow anchor and success state',async()=>{
 const id='d8000000-0000-4000-8000-000000000001',session={user:{id:user}}
 for(const outgoing of [true,false]){
  const Navigate=()=>null,location={search:'?filter=accepted',hash:'#payments',state:{sent:true},key:'detail'}
  const ui=await interactive('../src/pages/RequestsPage.tsx',{Navigate,useParams:()=>({id}),useAuth:()=>({session}),usePortal:()=>({role:'tailor'}),useLocation:()=>location,useSearchParams:()=>[new URLSearchParams('filter=accepted'),()=>{}],requestService:{get:async()=>({id,customer_id:outgoing?user:provider,tailor_id:outgoing?provider:user})}})
  try{
   ui.render({orders:!outgoing});await ui.flush();const tree=ui.render({orders:!outgoing})
   assert.equal(tree.type,Navigate);assert.equal(tree.props.to,`${outgoing?'/tailor/orders':'/tailor/requests'}/${id}?filter=accepted#payments`);assert.deepEqual(tree.props.state,{sent:true});assert.equal(tree.props.replace,true)
  }finally{ui.dispose()}
 }
 delete globalThis.__ordering
})
test('received and My Orders pages invoke the service with different participant filters',async()=>{
 const original=globalThis.window;globalThis.window=new EventTarget()
 const session={user:{id:user}},calls=[]
 try{
  for(const orders of [false,true]){
   const ui=await interactive('../src/pages/RequestsPage.tsx',{useParams:()=>({}),useAuth:()=>({session}),usePortal:()=>({role:'tailor'}),useLocation:()=>({search:'',hash:'',key:'list'}),useSearchParams:()=>[new URLSearchParams(),()=>{}],requestService:{list:async(...args)=>{calls.push(args);return[]}}})
   ui.render({orders});await ui.flush();ui.dispose()
  }
  assert.deepEqual(calls.map(call=>call[2]),[{userId:user,side:'provider'},{userId:user,side:'requester'}])
 }finally{globalThis.window=original;delete globalThis.__ordering}
})

