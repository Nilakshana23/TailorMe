import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const cache=new Map()
function moduleUrl(file){
 if(cache.has(file.href))return cache.get(file.href)
 let code=file.pathname.endsWith('/lib/supabase.ts')?'export let supabase=null;export function setSupabase(value){supabase=value}':file.pathname.endsWith('/services/shopUploads.ts')?'export async function transferStorageImage(){throw Error("Unexpected real upload")}':compile(readFileSync(file,'utf8'))
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`;const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate));return `from '${moduleUrl(child)}'`})
 const result=url(code);cache.set(file.href,result);return result
}
const load=p=>import(moduleUrl(new URL(p,import.meta.url)))
const {chatImageService,uploadChatImage,CHAT_IMAGE_BUCKET}=await load('../src/services/chatImageService.ts')
const {setSupabase}=await load('../src/lib/supabase.ts')
const owner='f1000000-0000-4000-8000-000000000001',requestId='f4000000-0000-4000-8000-000000000001',draftId='f3000000-0000-4000-8000-000000000001',id='f2000000-0000-4000-8000-000000000001'
const row={id,owner_id:owner,request_id:requestId,draft_id:draftId,image_path:`${owner}/chat/${requestId}/${draftId}/${id}.jpg`,message_id:null}
const file=new File([new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])],'image.jpg',{type:'image/jpeg'})

test('chat upload validates bytes/size before reservation and safely reconciles partial/lost responses',async()=>{
 let ready=false,reserved=null;const calls=[]
 const api={...chatImageService,reserve:async(...args)=>{calls.push(args);return row},ready:async()=>ready}
 const options={id,requestId,draftId,file,userId:owner,progress(){},onReserved:u=>{reserved=u},api}
 for(const invalid of [new File(['<svg/>'],'image.svg',{type:'image/svg+xml'}),new File(['not jpeg'],'image.jpg',{type:'image/jpeg'}),new File([new Uint8Array(5242881)],'large.jpg',{type:'image/jpeg'})])await assert.rejects(uploadChatImage({...options,file:invalid}))
 assert.equal(calls.length,0)
 await assert.rejects(uploadChatImage({...options,send:async()=>{throw Error('Offline')}}),/Offline/);assert.deepEqual(reserved,row)
 const saved=await uploadChatImage({...options,send:async()=>{ready=true;throw Error('Response lost')}});assert.deepEqual(saved,row)
 await uploadChatImage({...options,send:async()=>{throw Error('Must not upload twice')}});assert.deepEqual(calls[0],calls[1])
 await assert.rejects(uploadChatImage({...options,requestId:'different'}),/conversation changed/)
 await assert.rejects(uploadChatImage({...options,userId:'different'}),/account or conversation changed/)
 let checks=0;const diagnostic=Error('Storage: Unauthorized / row-level security')
 await assert.rejects(uploadChatImage({...options,api:{...api,ready:async()=>{if(++checks>1)throw Error('Reconciliation offline');return false}},send:async()=>{throw diagnostic}}),error=>error===diagnostic,'a failed ready check cannot mask the original Storage response')
})

test('private URLs expire in 120 seconds and cleanup uses only caller Storage API paths and excludes active draft',async()=>{
 let present=false;const calls=[]
 setSupabase({storage:{from:bucket=>{assert.equal(bucket,CHAT_IMAGE_BUCKET);assert.notEqual(bucket,'tailor-public');return{createSignedUrl:async(path,seconds)=>{calls.push({path,seconds});return{data:{signedUrl:'https://private.test/temporary'}}},remove:async paths=>{calls.push({remove:paths});return{error:null}}}}},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='chat_image_ready'?present:name==='unused_chat_images'?[row]:null,error:null}}})
 try{
  assert.equal(await chatImageService.preview(row.image_path),'https://private.test/temporary');assert.equal(calls[0].seconds,120)
  assert.equal(await chatImageService.cleanup(owner,draftId),1);assert.deepEqual(calls[1],{name:'unused_chat_images',args:{p_exclude_draft:draftId}});assert.deepEqual(calls[2],{remove:[row.image_path]});assert.equal(calls.at(-1).name,'release_chat_image')
  const n=calls.length;await assert.rejects(chatImageService.remove(row,'foreign'),/another participant/);assert.equal(calls.length,n)
  present=true;await assert.rejects(chatImageService.remove(row,owner),/protected/);assert.equal(calls.at(-1).name,'chat_image_ready')
 }finally{setSupabase(null)}
})

test('image-only transport sends exact IDs without URLs and legacy text transport remains unchanged',async()=>{
 const {messageService}=await load('../src/services/messageService.ts'),{validateMessage,conversationSync,mergeMessages}=await load('../src/utils/requestMessages.ts');const calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push({name,args});return{data:{id:args.p_id},error:null}}})
 try{
  await messageService.send(draftId,requestId,'',[row]);await messageService.send(draftId,requestId,'',[row]);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[0],{name:'send_request_image_message',args:{p_id:draftId,p_request_id:requestId,p_body:'',p_images:[id]}})
  await messageService.send('text',requestId,'Legacy');assert.equal(calls[2].name,'send_request_message');assert.equal('p_images' in calls[2].args,false)
  assert.equal(validateMessage('',1),'');assert.ok(validateMessage('',0));assert.ok(validateMessage('caption',4));assert.ok(validateMessage('x'.repeat(2001),1))
  let rows=[],server=[{id:draftId,request_id:requestId,sequence:1,sender_id:owner,body:'',images:[{id,image_path:row.image_path}]}]
  const sync=conversationSync({latest:async()=>({rows:server,hasMore:false}),after:async cursor=>server.filter(m=>m.sequence>cursor),meta:async()=>{}},incoming=>{rows=mergeMessages(rows,incoming)},()=>assert.fail('reconciliation failed'))
  await sync.refresh();server=[...server,{...server[0],id:'second',sequence:2}];await sync.refresh();await sync.refresh();assert.equal(rows.length,2);assert.deepEqual(rows[1].images,server[1].images);sync.stop()
 }finally{setSupabase(null)}
 const preview=read('../src/components/portal/PhotoStylingPreview.tsx');assert.doesNotMatch(preview,/chatImageService|uploadChatImage|request-chat-images/)
})

test('real image composer preserves failed selections and IDs, blocks partial sends and removes only after confirmation',async()=>{
 const state=[],deps=[];let cursor=0,effects=[],images=[],blocked=false,fail=true,failRemove=false
 const calls=[],removed=[]
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn)}}}
 const api={async remove(upload){removed.push(upload.id);if(failRemove)throw Error('Offline')},async cleanup(){return 0},async preview(){return 'https://private.test/temporary'}}
 globalThis.__chatImagesTest={hooks,api,upload:async options=>{calls.push(options.id);const saved={...row,id:options.id,image_path:`${owner}/chat/${requestId}/${draftId}/${options.id}.jpg`};options.onReserved(saved);if(fail)throw Error('Offline');return saved},auth:{session:{user:{id:owner}}}}
 let code=compile(read('../src/components/portal/ChatImages.tsx'))
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useRef,useState}=globalThis.__chatImagesTest.hooks;')
  .replace(/import \{ useAuth \} from '[^']+';/,'const useAuth=()=>globalThis.__chatImagesTest.auth;')
  .replace(/import \{ chatImageService, uploadChatImage \} from '[^']+';/,'const chatImageService=globalThis.__chatImagesTest.api,uploadChatImage=globalThis.__chatImagesTest.upload;')
  .replace(/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;')
  .replace(/import FormButton from '[^']+';/,'const FormButton=()=>null;').replace(/import '[^']+\.css';/g,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Editor,ChatImageView}=await import(url(code))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const button=(tree,text)=>nodes(tree).find(n=>[n.props?.children].flat(Infinity).filter(v=>typeof v==='string'||typeof v==='number').join('')===text)
 const props={requestId,draftId,disabled:false,onChange:v=>{images=v},onBusy:v=>{blocked=v}}
 const render=()=>{cursor=0;return Editor(props)}
 const flush=async()=>{for(const effect of effects.splice(0))effect();await new Promise(setImmediate);return render()}
 let tree=await flush(render())
 const choose=()=>nodes(tree).find(n=>n.props?.type==='file').props.onChange({target:{files:[file],value:'chosen'}})
 choose();tree=await flush();assert.equal(images.length,0);assert.equal(blocked,true)
 fail=false;button(tree,'Retry image 1').props.onClick();tree=await flush();assert.equal(calls[0],calls[1]);assert.equal(images.length,1);assert.equal(blocked,false)
 choose();tree=await flush();choose();tree=await flush();assert.equal(images.length,3);assert.equal(button(tree,'Attach image').props.disabled,true)
 failRemove=true;await button(tree,'Remove image 1').props.onClick();tree=await flush();assert.equal(images.length,3)
 failRemove=false;await button(tree,'Remove image 1').props.onClick();tree=await flush();assert.equal(images.length,2);assert.equal(removed[0],removed[1]);assert.equal(blocked,false)
 // Exercise the actual enlarged-preview handlers with a native dialog contract.
 state.length=0;deps.length=0;effects=[];let opened=0,closed=0
 const renderView=()=>{cursor=0;return ChatImageView({image:row,number:1})}
 let view=renderView();const cleanup=effects.splice(0).map(effect=>effect());await new Promise(setImmediate);view=renderView()
 const dialog=nodes(view).find(n=>n.type==='dialog');dialog.props.ref.current={showModal(){opened++},close(){closed++}}
 assert.equal(dialog.props['aria-label'],'Enlarged message image 1');nodes(view).find(n=>n.props?.['aria-label']==='Enlarge message image 1').props.onClick();assert.equal(opened,1)
 assert.equal(button(view,'Close image').props.autoFocus,true);button(view,'Close image').props.onClick();assert.equal(closed,1)
 for(const dispose of cleanup)dispose?.()
 delete globalThis.__chatImagesTest
})
