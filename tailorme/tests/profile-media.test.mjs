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

const {default:Card}=await load('../src/components/portal/CustomerRequestCard.tsx')
const {default:ShopCard}=await load('../src/components/shops/ShopCard.tsx')
const {default:MediaEditor}=await load('../src/components/portal/ShopMediaEditor.tsx')
const {AuthContext}=await load('../src/auth/authContext.ts')
const {PortalContext}=await load('../src/auth/portalContext.ts')
const {default:Account}=await load('../src/pages/AccountPage.tsx')
const {setSupabase}=await load('../src/lib/supabase.ts')
const {avatarService,replaceAvatar,validateAvatarImage,AVATAR_URL_SECONDS}=await load('../src/services/avatarService.ts')
const {uploadShopImage}=await load('../src/services/shopUploads.ts')
const {publicShopImage}=await load('../src/services/shopService.ts')
const h=React.createElement,userId='b7000000-0000-4000-8000-000000000001',other='b7000000-0000-4000-8000-000000000002'
const old=`${userId}/avatar/b7000000-0000-4000-8000-000000000003.jpg`
function render(child){return renderToString(h(MemoryRouter,null,child))}
const request={id:'request',garment_type:'Evening dress',shop_name:'Thread Shop',customer_name:'Avery',quantity:2,status:'accepted',work_stage:'cutting',completed_at:null,confirmed_date:'2026-10-30',preferred_date:'2026-11-05',created_at:'2026-10-20T00:00:00Z'}
test('shared customer/tailor/priority cards label metadata and distinguish commitments from preference',()=>{
 for(const tailor of [false,true]){
  const html=render(h(Card,{request,tailor,unread:0}))
  for(const label of ['Quantity','Requested on','Preferred date','Confirmed date','Customer preference','Work stage','View request','Message'])assert.ok(html.includes(label))
  assert.ok(html.indexOf('Confirmed date')<html.indexOf('Preferred date'))
  assert.ok(html.includes(tailor?'Avery':'Thread Shop'))
  assert.ok(html.includes('customer-request-confirmed'))
  assert.doesNotMatch(html,/customer-request-unread|Review quotations|Open the request/)
  const pending=render(h(Card,{request:{...request,status:'pending',confirmed_date:null},tailor,unread:3}))
  assert.ok(pending.includes(tailor?'Awaiting your response':'Awaiting tailor response'))
  assert.doesNotMatch(pending,/Work stage:|Overdue/);assert.match(pending,/3 unread messages/)
 }
 const completed=render(h(Card,{request:{...request,completed_at:'2026-10-30T00:00:00Z'}}))
 assert.doesNotMatch(completed,/Overdue/);assert.match(completed,/Completed/)
 const css=readFileSync(new URL('../src/pages/CustomerRequests.css',import.meta.url),'utf8')
 assert.match(css,/customer-request-metadata \{ display:grid/)
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
 const priority=readFileSync(new URL('../src/components/portal/AcceptedWork.tsx',import.meta.url),'utf8')
 assert.match(priority,/<CustomerRequestCard request=\{request\} tailor/)
})
test('cover stays a distinct persisted public path with compact initials fallback and replace/remove controls',async()=>{
 setSupabase({storage:{from:bucket=>({getPublicUrl:path=>({data:{publicUrl:`https://public.test/${bucket}/${path}`}})})}})
 try{
  const shop={owner_id:userId,shop_name:'Fine Make',cover_path:`${userId}/cover/cover.jpg`,accepting_requests:true,city:'Galle',specialties:'Dresses',years_experience:3}
  assert.equal(publicShopImage(shop.cover_path),`https://public.test/tailor-public/${shop.cover_path}`)
  const html=render(h(ShopCard,{shop}));assert.match(html,/src="https:\/\/public.test\/tailor-public/)
  const fallback=render(h(ShopCard,{shop:{...shop,cover_path:null}}));assert.match(fallback,/shop-brand-initials/);assert.match(fallback,/>FM</);assert.doesNotMatch(fallback,/<img/)
  const editor=render(h(MediaEditor,{shop,images:[],disabled:false,onShop(){},onImages(){},onBusy(){}}))
  assert.match(editor,/Shop photo \/ cover \(optional\)/);assert.match(editor,/Replace cover photo/);assert.match(editor,/Remove Cover/);assert.match(editor,/publicly visible/)
  const file=new File([new Uint8Array([255,216,255,0])],'cover.jpg',{type:'image/jpeg'})
  let persisted=null
  const result=await uploadShopImage({file,userId,kind:'cover',progress(){},transfer:async()=>{},cleanup:async()=>{},attach:async path=>{persisted=path;return{...shop,cover_path:path,is_published:true}}})
  assert.equal(result.result.cover_path,persisted);assert.equal(result.result.is_published,true)
 }finally{setSupabase(null)}
})
test('avatar upload failure preserves old reference; successful replacement cleans only after save',async()=>{
 const file=new File([new Uint8Array([255,216,255])],'photo.jpg',{type:'image/jpeg'})
 const calls=[]
 const options={file,userId,previous:old,progress(){},validate:async()=>{},transfer:async path=>{calls.push(['upload',path])},save:async path=>{calls.push(['save',path]);return path},cleanup:async path=>{calls.push(['cleanup',path])}}
 await assert.rejects(replaceAvatar({...options,transfer:async()=>{throw Error('Upload failed')}}),/Upload failed/)
 assert.equal(calls.length,1);assert.equal(calls[0][0],'cleanup');assert.notEqual(calls[0][1],old)
 calls.length=0
 await assert.rejects(replaceAvatar({...options,save:async()=>{throw Error('Save failed')}}),/Save failed/)
 assert.ok(!calls.some(([kind,path])=>kind==='cleanup'&&path===old))
 calls.length=0
 const result=await replaceAvatar(options)
 assert.deepEqual(calls.map(([kind])=>kind),['upload','save','cleanup'])
 assert.equal(calls[2][1],old);assert.notEqual(result.path,old)
 const retained=await replaceAvatar({...options,cleanup:async()=>{throw Error('Cleanup failed')}})
 assert.equal(retained.cleanupFailed,true)
})
test('private signed URLs are short lived; owner path checks and save/removal events refresh headers',async()=>{
 const originalWindow=globalThis.window;globalThis.window=new EventTarget();let events=0
 window.addEventListener('tailorme:avatar-changed',()=>events++)
 const calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push([name,args]);return{data:args.p_path,error:null}},storage:{from:bucket=>({createSignedUrl:async(path,seconds)=>{calls.push([bucket,path,seconds]);return{data:{signedUrl:'https://signed.test/temporary'},error:null}},remove:async paths=>{calls.push(['remove',paths]);return{error:null}}})}})
 try{
  assert.equal(await avatarService.signed(old,userId),'https://signed.test/temporary')
  assert.deepEqual(calls[0],['profile-avatars',old,AVATAR_URL_SECONDS]);assert.equal(AVATAR_URL_SECONDS,300)
  await assert.rejects(avatarService.signed(old,other),/unavailable/)
  await assert.rejects(avatarService.removeFile(old,other),/another account/)
  await avatarService.set(old,null);await avatarService.set(null,old);assert.equal(events,2)
  assert.deepEqual(calls.at(-1),['set_profile_avatar',{p_path:null,p_expected_path:old}])
  const profile={id:userId,full_name:'Avery Test',avatar_path:old}
  const html=render(h(AuthContext.Provider,{value:{session:{user:{id:userId}},loading:false}},h(PortalContext.Provider,{value:{profile,role:'customer',status:'ready'}},h(Account))))
  assert.match(html,/Personal profile photo \(optional\)/);assert.doesNotMatch(html,/Account type|Portal Role|<img/)
 }finally{setSupabase(null);globalThis.window=originalWindow}
})
test('avatar validation enforces file type, size, signature and successful decoding',async()=>{
 const previous=globalThis.createImageBitmap;let closed=false
 globalThis.createImageBitmap=async()=>({width:30,height:20,close(){closed=true}})
 try{
  await validateAvatarImage(new File([new Uint8Array([255,216,255])],'valid.jpg',{type:'image/jpeg'}));assert.equal(closed,true)
  await assert.rejects(validateAvatarImage(new File(['<svg/>'],'x.svg',{type:'image/svg+xml'})),/JPEG/)
  await assert.rejects(validateAvatarImage(new File([new Uint8Array(5242881)],'large.jpg',{type:'image/jpeg'})),/5 MB/)
  await assert.rejects(validateAvatarImage(new File(['not an image'],'x.jpg',{type:'image/jpeg'})),/contents/)
  globalThis.createImageBitmap=async()=>{throw Error('decode failed')}
  await assert.rejects(validateAvatarImage(new File([new Uint8Array([255,216,255])],'broken.jpg',{type:'image/jpeg'})),/decoded/)
 }finally{globalThis.createImageBitmap=previous}
})

async function hookComponent(file,dependencies,seed={}){
 const slots=[],effects=[],cleanups=[];let cursor=0
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=i in seed?seed[i]:typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i]},useEffect(fn){effects.push(fn)}}
 globalThis.__profileMedia={...dependencies,hooks}
 let code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import (.*?) from ['"](.*?)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  if(spec==='react')return `const ${clause}=globalThis.__profileMedia.hooks;`
  if(clause.startsWith('{'))return `const ${clause}=globalThis.__profileMedia;`
  return `const ${clause}=(props)=>props.children??null;`
 }).replace(/import ['"][^'"]+\.css['"];?/g,'')
 const {default:Component,...exports}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+crypto.randomUUID())
 return{render(props){cursor=0;return Component(props)},exports,async flush(){for(const fn of effects.splice(0))cleanups.push(fn());await new Promise(setImmediate)},dispose(){for(const fn of cleanups)fn?.()}}
}
const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
test('notification badge is absent at zero, capped visually and exposes the actual count; opening/read actions still work',async()=>{
 for(const unread of [0,3,123]){
  let reads=0
  const ui=await hookComponent('../src/components/portal/NotificationBell.tsx',{useAuth:()=>({session:{user:{id:userId}}}),usePortal:()=>({role:'customer'}),Link:()=>null,workService:{read:async()=>{reads++}}},{3:{key:`${userId}:0:0`,rows:[{id:'notice',request_id:'req',kind:'message_received',created_at:'2026-10-30T00:00:00Z',read_at:null}],unread,error:''}})
  let tree=ui.render(),button=nodes(tree).find(n=>n.type==='button')
  assert.equal(button.props['aria-label'],`Notifications, ${unread} unread`)
  const badge=nodes(tree).find(n=>n.props?.className==='notification-count')
  if(unread===0)assert.equal(badge,undefined);else assert.equal(badge.props.children,unread>99?'99+':unread)
  button.props.onClick();tree=ui.render()
  assert.ok(nodes(tree).some(n=>n.props?.id==='request-notification-list'))
  const read=nodes(tree).find(n=>n.props?.children==='Mark as read');read.props.onClick();await new Promise(setImmediate)
  assert.equal(reads,1)
 }
 const css=readFileSync(new URL('../src/pages/Dashboards.css',import.meta.url),'utf8')
 assert.match(css,/button.notification-trigger \{ position:relative/)
 assert.match(css,/notification-count \{ position:absolute/)
 delete globalThis.__profileMedia
})
test('shop and private avatar broken images fall back to initials; private URLs never leak across account changes',async()=>{
 const shop=await hookComponent('../src/components/shops/ShopCard.tsx',{Link:()=>null,publicShopImage:path=>path?'https://public.test/cover':'',shopInitials:()=> 'FM'})
 let tree=shop.exports.ShopImage({path:'cover',alt:'Cover',shopName:'Fine Make'})
 assert.equal(tree.type,'img');tree.props.onError()
 // ShopImage is a named component, so reset the hook cursor through its wrapper.
 const reset=await hookComponent('../src/components/shops/ShopCard.tsx',{Link:()=>null,publicShopImage:()=> 'https://public.test/cover',shopInitials:()=> 'FM'},{0:'https://public.test/cover'})
 tree=reset.exports.ShopImage({path:'cover',alt:'Cover',shopName:'Fine Make'})
 assert.equal(tree.type,'div');assert.match(tree.props.className,/shop-image-placeholder/)
 const original=globalThis.window;globalThis.window=new EventTarget()
 let session={user:{id:userId}}
 const avatar=await hookComponent('../src/components/portal/ProfileAvatar.tsx',{useAuth:()=>({session}),ownsAvatarPath:(path,id)=>path.startsWith(id+'/'),avatarService:{signed:async()=> 'https://signed.test/photo'}})
 try{
  const props={path:old,userId,name:'Avery Test'}
  tree=avatar.render(props);assert.equal(nodes(tree).some(n=>n.type==='img'),false)
  await avatar.flush();tree=avatar.render(props)
  const img=nodes(tree).find(n=>n.type==='img');assert.equal(img.props.src,'https://signed.test/photo')
  img.props.onError();tree=avatar.render(props)
  assert.equal(nodes(tree).some(n=>n.type==='img'),false);assert.ok(nodes(tree).some(n=>n.props?.children==='AT'))
  session={user:{id:other}};tree=avatar.render(props)
  assert.equal(nodes(tree).some(n=>n.type==='img'),false)
 }finally{avatar.dispose();globalThis.window=original;delete globalThis.__profileMedia}
})

