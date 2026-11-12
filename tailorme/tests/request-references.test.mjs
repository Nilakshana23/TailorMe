import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import ts from 'typescript'
import React from 'react'
import {renderToString} from 'react-dom/server'
const cache=new Map(),url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
function moduleUrl(file){
 if(cache.has(file.href))return cache.get(file.href)
 let code
 if(file.pathname.endsWith('/lib/supabase.ts'))code='export let supabase=null;export const configurationError=null;export function setSupabase(s){supabase=s}'
 else if(file.pathname.endsWith('/services/shopUploads.ts'))code='export async function transferStorageImage(){throw Error("Unexpected real upload")}'
 else if(file.pathname.endsWith('.css'))code='export default ""'
 else code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
  if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
  const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate));return `from '${moduleUrl(child)}'`
 }).replace(/import '[^']+\.css';/g,'')
 const result=url(code);cache.set(file.href,result);return result
}
const load=p=>import(moduleUrl(new URL(p,import.meta.url)))
const {requestReferenceService,uploadRequestReference,REQUEST_REFERENCE_BUCKET,isOwnReferencePath}=await load('../src/services/requestReferenceService.ts')
const {setSupabase}=await load('../src/lib/supabase.ts')
const owner='e1000000-0000-4000-8000-000000000001',batch='e3000000-0000-4000-8000-000000000001',id='e2000000-0000-4000-8000-000000000001'
const row={id,owner_id:owner,batch_id:batch,image_path:`${owner}/references/${batch}/${id}.jpg`,submitted_request_id:null}
const file=new File([new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])],'reference.jpg',{type:'image/jpeg'})

test('explicit uploads validate type/bytes/size before reserve, preserve failed slots and reconcile lost upload responses',async()=>{
 const calls=[],progress=[];let ready=false,reserved=null,uploaded=0
 const api={...requestReferenceService,reserve:async(...args)=>{calls.push(args);return row},ready:async()=>ready,remove:async()=>{throw Error('Unexpected automatic cleanup')}}
 const options={file,userId:owner,batchId:batch,id,progress:n=>progress.push(n),onReserved:u=>{reserved=u},api}
 for(const invalid of [new File(['<svg/>'],'x.svg',{type:'image/svg+xml'}),new File(['not jpeg'],'x.jpg',{type:'image/jpeg'}),new File([new Uint8Array(5242881)],'large.jpg',{type:'image/jpeg'})])await assert.rejects(uploadRequestReference({...options,file:invalid,send:async()=>{uploaded++}}))
 assert.equal(calls.length,0);assert.equal(uploaded,0)
 await assert.rejects(uploadRequestReference({...options,send:async()=>{uploaded++;throw Error('Offline')}}),/Offline/)
 assert.deepEqual(reserved,row,'reserved slot retained for safe retry/removal')
 const sent=await uploadRequestReference({...options,send:async()=>{uploaded++;ready=true;throw Error('Lost response')}})
 assert.deepEqual(sent,row);assert.equal(progress.at(-1),100)
 const again=await uploadRequestReference({...options,send:async()=>{throw Error('Should not reupload confirmed object')}})
 assert.deepEqual(again,row);assert.equal(uploaded,2);assert.deepEqual(calls[0],calls[1]);assert.equal(isOwnReferencePath(row.image_path,owner),true)
 await assert.rejects(uploadRequestReference({...options,userId:'other'}),/account changed/)
})

test('private previews have 120-second URLs; cleanup uses Storage API and protects submitted/foreign files',async()=>{
 let present=false;const calls=[]
 setSupabase({storage:{from:bucket=>{assert.equal(bucket,REQUEST_REFERENCE_BUCKET);assert.notEqual(bucket,'tailor-public');return{createSignedUrl:async(path,seconds)=>{calls.push({path,seconds});return{data:{signedUrl:'https://private.test/temporary'}}},remove:async paths=>{calls.push({remove:paths});return{error:null}}}}},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='request_reference_ready'?present:name==='unused_request_reference_uploads'?[row]:null,error:null}}})
 try{
  assert.equal(await requestReferenceService.preview(row.image_path),'https://private.test/temporary');assert.equal(calls[0].seconds,120)
  await requestReferenceService.remove(row,owner);assert.deepEqual(calls[1],{remove:[row.image_path]});assert.equal(calls.at(-1).name,'release_request_reference')
  assert.equal(await requestReferenceService.cleanup(owner,batch),1)
  assert.deepEqual(calls.find(call=>call.name==='unused_request_reference_uploads').args,{p_exclude_batch:batch})
  const length=calls.length;await assert.rejects(requestReferenceService.remove(row,'other'),/another customer/);assert.equal(calls.length,length)
  present=true;await assert.rejects(requestReferenceService.remove(row,owner),/protected/);assert.equal(calls.at(-1).name,'request_reference_ready','protected object slot is not released')
 }finally{setSupabase(null)}
})

test('request transport adds exact image IDs/notes while preserving measurement/design snapshot inputs and no-image compatibility',async()=>{
 const {requestService}=await load('../src/services/requestService.ts');const calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});return{data:{id:args.p_id},error:null}}})
 const fields={garment_type:'dress',description:'Please use these inspirations.',quantity:1,preferred_date:'2099-12-01'},images={batch,items:[{id,note:'Use this neckline'}],previews:[{image_path:row.image_path,note:'Use this neckline'}]},measurements={values_cm:{waist:80},measured_on:'2026-10-29'}
 try{
  await requestService.send('request-id','tailor',fields,{id:'design-id',version:3},measurements,images)
  await requestService.send('request-id','tailor',fields,{id:'design-id',version:3},measurements,images)
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].name,'send_tailoring_request_with_references');assert.deepEqual(calls[0].args.p_references,images.items)
  assert.equal(calls[0].args.p_reference_batch,batch);assert.equal(calls[0].args.p_share,true);assert.equal(calls[0].args.p_design_version,3);assert.deepEqual(calls[0].args.p_values,{waist:80})
  assert.equal(JSON.stringify(calls[0]).includes('image_path'),false,'local preview paths never enter the request payload')
  await requestService.send('other-request','tailor',fields)
  assert.equal(calls[2].name,'send_tailoring_request_with_measurements');assert.equal('p_references' in calls[2].args,false)
 }finally{setSupabase(null)}
})

test('upload UI is explicit, private and optional; styling preview has no reference-upload integration',async()=>{
 const {RequestReferenceEditor}=await load('../src/components/portal/RequestReferences.tsx'),{AuthContext}=await load('../src/auth/authContext.ts')
 const html=renderToString(React.createElement(AuthContext.Provider,{value:{session:{user:{id:owner}}}},React.createElement(RequestReferenceEditor,{disabled:false,onChange(){},onBusy(){}})))
 assert.match(html,/Add a private reference image/);assert.match(html,/type="file"/);assert.match(html,/accept="image\/jpeg,image\/png,image\/webp"/);assert.match(html,/No reference images will be shared/)
 const preview=readFileSync(new URL('../src/components/portal/PhotoStylingPreview.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(preview,/requestReferenceService|uploadRequestReference|REQUEST_REFERENCE_BUCKET/)
 const composer=readFileSync(new URL('../src/components/portal/RequestComposer.tsx',import.meta.url),'utf8')
 assert.match(composer,/references: references\?\.items.length \? structuredClone\(references\)/)
 assert.match(composer,/submission.measurements,submission.references/)
})

test('real reference editor handlers preserve notes/order, failed retry IDs and confirmed removals',async()=>{
 const state=[],deps=[];let cursor=0,effects=[],selection=null,busy=false,failUpload=true,failRemove=false
 const calls=[],removed=[]
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(fn)}}}
 const service={async remove(upload){removed.push(upload.id);if(failRemove)throw Error('Offline')},async cleanup(){return 0}}
 const upload=async options=>{calls.push(options.id);const saved={...row,id:options.id,batch_id:options.batchId,image_path:`${owner}/references/${options.batchId}/${options.id}.jpg`};options.onReserved(saved);if(failUpload)throw Error('Offline');return saved}
 globalThis.__referenceEditorTest={hooks,service,upload,auth:{session:{user:{id:owner}}}}
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/RequestReferences.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useRef,useState}=globalThis.__referenceEditorTest.hooks;')
  .replace(/import \{ useAuth \} from '[^']+';/,'const useAuth=()=>globalThis.__referenceEditorTest.auth;')
  .replace(/import \{ requestReferenceService, uploadRequestReference \} from '[^']+';/,'const requestReferenceService=globalThis.__referenceEditorTest.service,uploadRequestReference=globalThis.__referenceEditorTest.upload;')
  .replace(/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;')
  .replace(/import FormButton from '[^']+';/,'const FormButton=()=>null;')
  .replace(/import '[^']+\.css';/g,'')
  .replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {RequestReferenceEditor}=await import(url(code))
 const props={disabled:false,onChange:value=>{selection=value},onBusy:value=>{busy=value}}
 const render=()=>{cursor=0;return RequestReferenceEditor(props)}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const button=(tree,text)=>nodes(tree).find(n=>[n.props?.children].flat(Infinity).filter(value=>typeof value==='string'||typeof value==='number').join('')===text)
 const flush=async()=>{for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));return render()}
 let tree=await flush(render())
 const choose=()=>nodes(tree).find(n=>n.props?.type==='file').props.onChange({target:{files:[file],value:'chosen'}})
 choose();assert.equal(busy,true);tree=await flush();assert.equal(selection,null,'failed upload is excluded')
 failUpload=false;button(tree,'Retry reference 1').props.onClick();tree=await flush();assert.equal(calls[0],calls[1]);assert.equal(selection.items.length,1)
 nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Use this neckline'}});tree=render()
 choose();tree=await flush();assert.equal(selection.items.length,2);assert.equal(selection.items[0].note,'Use this neckline');assert.equal(selection.items[1].note,'')
 const originalIds=selection.items.map(item=>item.id);assert.equal(selection.previews[0].note,'Use this neckline')
 failRemove=true;await button(tree,'Remove reference 1').props.onClick();tree=await flush();assert.deepEqual(selection.items.map(item=>item.id),originalIds,'failed removal retains exact selection')
 failRemove=false;await button(tree,'Remove reference 1').props.onClick();tree=await flush();assert.deepEqual(selection.items.map(item=>item.id),originalIds.slice(1));assert.deepEqual(removed,[originalIds[0],originalIds[0]])
 assert.equal(busy,false)
 delete globalThis.__referenceEditorTest
})
