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

const {AuthContext}=await load('../src/auth/authContext.ts')
const {PortalContext}=await load('../src/auth/portalContext.ts')
const {default:Header}=await load('../src/components/SiteHeader.tsx')
const {default:Welcome}=await load('../src/pages/WelcomePage.tsx')
const {default:Guard}=await load('../src/auth/PortalGuard.tsx')
const {default:Login}=await load('../src/pages/LoginPage.tsx')
const {default:Signup}=await load('../src/pages/SignupPage.tsx')
const {default:Callback}=await load('../src/pages/AuthCallbackPage.tsx')
const {authRedirect}=await load('../src/lib/supabase.ts')
const {authPath,afterLogin,safeReturnDestination}=await load('../src/utils/authNavigation.ts')
const h=React.createElement,session={user:{id:'test-user'}}
function render(child,auth={},portal={},entry='/'){
 globalThis.__tailormeNavigation=null
 return renderToString(h(MemoryRouter,{initialEntries:[entry]},h(AuthContext.Provider,{value:{session:null,loading:false,error:null,recovery:false,...auth}},h(PortalContext.Provider,{value:{role:null,status:'loading',...portal}},child))))
}
test('landing guests have useful authentication, section and protected destination links',()=>{
 const html=render(h(Welcome))
 assert.ok(html.includes('href="/customer/designer"'))
 assert.ok(html.split('href="/tailors"').length>=5)
 assert.ok(html.includes('href="/login?returnTo=%2Ftailors"'))
 assert.ok(html.includes('href="/signup?returnTo=%2Ftailors"'))
 for(const section of ['top','collections','our-story']){
  assert.ok(html.includes('id="'+section+'"'))
  assert.ok(html.includes('href="/#'+section+'"'))
 }
 assert.doesNotMatch(html,/href="#"|aria-disabled|Search collections|shopping_bag|notifications|Marketplace|SUBSCRIBE|type="email"|profile avatar|north_east/)
 const header=render(h(Header));assert.doesNotMatch(header,/<img/)
})
test('trusted role dashboards replace guest auth links, unresolved account state stays neutral',()=>{
 for(const role of ['customer','tailor','admin']){
  const html=render(h(Header),{session},{role,status:'ready'})
  assert.match(html,new RegExp('href="/'+role+'/dashboard"'))
  assert.match(html,/My Dashboard/);assert.doesNotMatch(html,/Sign In|Sign Up/)
 }
 const restoring=render(h(Header),{loading:true})
 assert.match(restoring,/Restoring account/);assert.doesNotMatch(restoring,/Sign In|Sign Up|My Dashboard/)
 const roleLoading=render(h(Header),{session},{role:'customer',status:'loading'})
 assert.match(roleLoading,/Loading account/);assert.doesNotMatch(roleLoading,/Sign In|Sign Up|My Dashboard/)
 assert.ok(render(h(Header),{session},{status:'error'}).includes('href="/account"'))
})
test('direct directory, detail and designer access waits for auth and preserves query/hash context',()=>{
 for(const target of ['/tailors?city=Galle&page=2&design=saved-design','/tailors/shop-id?design=saved-design#portfolio','/customer/designer/saved-design']){
  const guard=h(Guard,target.startsWith('/tailors')?{authenticatedOnly:true}:{role:'customer'},h('p',null,'DESTINATION'))
  assert.match(render(guard,{loading:true},{},target),/Restoring your session/)
  assert.equal(globalThis.__tailormeNavigation,null)
  render(guard,{}, {},target)
  assert.deepEqual(globalThis.__tailormeNavigation,{to:authPath('/login',target),replace:true})
  for(const page of [Login,Signup]){
   const html=render(h(page),{}, {},authPath(page===Login?'/login':'/signup',target))
   assert.ok(html.includes(authPath(page===Login?'/signup':'/login',target).replaceAll('&','&amp;')))
  }
  authRedirect.returnTo=target
  render(h(Callback),{session,loading:true},{},authPath('/auth/callback',target))
  assert.equal(globalThis.__tailormeNavigation,null)
  render(h(Callback),{session},{},authPath('/auth/callback',target))
  assert.deepEqual(globalThis.__tailormeNavigation,{to:target,replace:true})
  delete authRedirect.returnTo
  assert.equal(afterLogin(target),target)
 }
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 for(const path of ['/tailors','/tailors/:id'])assert.ok(app.includes('<Route path="'+path+'" element={<PortalGuard authenticatedOnly>'))
})
test('return-path allowlist rejects external, encoded and malformed redirects',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/tailors%2f%2fevil.test','/auth/callback','/tailors/../login','/tailors\n//evil.test']){
  assert.equal(safeReturnDestination(value),null);assert.equal(afterLogin(value),'/dashboard')
 }
})
test('designer retains customer role restriction and browsing accepts authenticated roles',()=>{
 for(const role of ['tailor','admin']){
  render(h(Guard,{role:'customer'},'DESIGNER'),{session},{role,status:'ready'},'/customer/designer')
  assert.deepEqual(globalThis.__tailormeNavigation,{to:'/'+role+'/dashboard',replace:true})
 }
 for(const role of ['customer','tailor','admin'])assert.match(render(h(Guard,{authenticatedOnly:true},h('p',null,'BROWSE')),{session},{role,status:'loading'},'/tailors'),/BROWSE/)
})

// Run real component event handlers with deterministic hooks and router/transport
// boundaries. No credentials, network or live account mutations are involved.
async function interactive(path, dependencies) {
 let code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 const slots=[];let cursor=0;const effects=[]
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect(fn){effects.push(fn)}}
 globalThis.__landingTest={...dependencies,hooks}
 code=code.replace(/import (.*?) from ['"](.*?)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  if(spec==='react')return `const ${clause}=globalThis.__landingTest.hooks;`
  if(spec.endsWith('/authNavigation'))return `import ${clause} from '${moduleUrl(new URL('../src/utils/authNavigation.ts',import.meta.url))}';`
  if(clause.startsWith('{'))return `const ${clause}=globalThis.__landingTest;`
  return `const ${clause}=()=>null;`
 })
 const {default:Component}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID())
 return {render(){cursor=0;return Component()},effects}
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
test('mobile navigation toggles, closes after a link, and Escape restores toggle focus',async()=>{
 const original={document:globalThis.document,Element:globalThis.Element}
 const listeners=new Map();let focused=false
 class Anchor {closest(selector){return selector==='a'?this:null}}
 globalThis.Element=Anchor
 globalThis.document={addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)}}
 try{
  const ui=await interactive('../src/components/SiteHeader.tsx',{Link:()=>null,useAuth:()=>({session:null,loading:false}),usePortal:()=>({role:null,status:'loading'}),dashboardPath:role=>'/'+role+'/dashboard'})
  let tree=ui.render(),toggle=nodes(tree).find(n=>n.type==='button')
  toggle.props.ref.current={focus(){focused=true}}
  assert.equal(toggle.props['aria-expanded'],false)
  assert.equal(nodes(tree).find(n=>n.props?.id==='mobile-navigation-links').props.hidden,true)
  toggle.props.onClick();tree=ui.render()
  const menu=nodes(tree).find(n=>n.props?.id==='mobile-navigation-links')
  assert.equal(menu.props.hidden,false)
  assert.ok(nodes(menu).some(n=>n.props?.to==='/tailors'))
  assert.ok(nodes(menu).some(n=>n.props?.href==='/#our-story'))
  menu.props.onClick({target:new Anchor()});tree=ui.render()
  assert.equal(nodes(tree).find(n=>n.type==='button').props['aria-expanded'],false)
  nodes(tree).find(n=>n.type==='button').props.onClick();ui.render()
  const cleanups=ui.effects.splice(0).map(fn=>fn())
  listeners.get('keydown')({key:'Escape'});tree=ui.render()
  assert.equal(nodes(tree).find(n=>n.type==='button').props['aria-expanded'],false)
  assert.equal(focused,true)
  cleanups.forEach(cleanup=>cleanup?.())
 }finally{Object.assign(globalThis,original);delete globalThis.__landingTest}
})
test('successful password sign-in navigates to the validated internal destination',async()=>{
 for(const destination of ['/tailors?city=Kandy&design=saved-design','/customer/designer/saved-design','//evil.test']){
  let navigated=null,calls=0
  const ui=await interactive('../src/pages/LoginPage.tsx',{Link:()=>null,useNavigate:()=>((to,options)=>{navigated={to,options}}),useLocation:()=>({search:'?'+new URLSearchParams({returnTo:destination})}),authService:{async signIn(){calls++;return{error:null}}},authError:String})
  const tree=ui.render(),form=nodes(tree).find(n=>n.type==='form')
  const inputs={email:{value:'test@example.test',validity:{typeMismatch:false}},password:{value:'test-only'}}
  await form.props.onSubmit({preventDefault(){},currentTarget:{elements:{namedItem:name=>inputs[name]}}})
  assert.equal(calls,1)
  assert.deepEqual(navigated,{to:destination==='//evil.test'?'/dashboard':destination,options:{replace:true}})
  assert.equal(inputs.password.value,'')
 }
 delete globalThis.__landingTest
})
