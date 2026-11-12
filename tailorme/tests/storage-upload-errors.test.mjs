import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const errorUrl=url(compile(readFileSync(new URL('../src/utils/storageUploadError.ts',import.meta.url),'utf8')))
const {storageUploadError}=await import(errorUrl)
const context={bucket:'request-chat-images',objectPath:'owner/chat/request/draft/upload.jpg',authenticatedUserId:'owner',contentType:'image/jpeg',bytes:12,upsert:false}

test('Storage errors retain actual code/message but never retain raw responses, credentials or URLs',()=>{
 const error=storageUploadError(400,JSON.stringify({statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy',secret:'never retain this field'}),context)
 assert.equal(error.httpStatus,400);assert.equal(error.storageCode,'Unauthorized');assert.equal(error.storageMessage,'new row violates row-level security policy');assert.match(error.message,/permission was denied/);assert.deepEqual(error.context,context)
 assert.doesNotMatch(JSON.stringify(error),/never retain|secret/)
 const secret='actual-session-secret',key='publishable-key-value'
 const sensitive=storageUploadError(400,JSON.stringify({code:'AccessDenied',message:`${secret} ${key} Bearer hidden-token https://private.test/signed?token=private data:image/jpeg;base64,imagebytes sb_secret_abc eyJabc.abc.abc`}),context,[secret,key])
 assert.doesNotMatch(sensitive.message,/actual-session-secret|publishable-key-value|hidden-token|private\.test|imagebytes|sb_secret_abc|eyJabc/)
 for(const response of ['<html>secret proxy response</html>','',JSON.stringify({message:{secret:'not a message'}})])assert.doesNotMatch(storageUploadError(502,response,context).message,/secret proxy|not a message/)
 for(const [code,message,hint] of [['BucketNotFound','Bucket not found',/bucket is unavailable/],['EntityTooLarge','Too large',/5 MB/],['InvalidMimeType','Unsupported MIME',/JPEG, PNG or WebP/],['Duplicate','Already exists',/original upload finished/]])assert.match(storageUploadError(400,JSON.stringify({code,message}),context).message,hint)
})

test('actual XHR upload captures Storage rejection, traces only safe fields, and preserves authenticated no-upsert transport',async()=>{
 const original=globalThis.XMLHttpRequest,requests=[];let response={status:400,body:JSON.stringify({statusCode:'403',error:'Unauthorized',message:'new row violates row-level security policy'})}
 const auth={user:{id:'owner'},access_token:'test-access-token'}
 globalThis.__uploadDiagnosticTest={supabase:{auth:{getSession:async()=>({data:{session:auth},error:null})}},env:{VITE_SUPABASE_URL:'https://project.test',VITE_SUPABASE_PUBLISHABLE_KEY:'test-publishable-key'}}
 globalThis.XMLHttpRequest=class{
  upload={};headers={};open(method,endpoint){this.method=method;this.endpoint=endpoint}setRequestHeader(name,value){this.headers[name]=value}
  send(file){this.file=file;requests.push(this);this.status=response.status;this.responseText=response.body;this.onload()}
 }
 let code=compile(readFileSync(new URL('../src/services/shopUploads.ts',import.meta.url),'utf8'))
 code=code.replace(/import \{ supabase \} from '[^']+';/,'const supabase=globalThis.__uploadDiagnosticTest.supabase;')
  .replace(/import \{ SHOP_BUCKET, isOwnShopPath, shopService \} from '[^']+';/,"const SHOP_BUCKET='tailor-public',isOwnShopPath=()=>false,shopService={};")
  .replace(/import \{ shopImageExtensions, validateShopImage \} from '[^']+';/,'const shopImageExtensions={},validateShopImage=()=>{};')
  .replace("from '../utils/storageUploadError'",`from '${errorUrl}'`)
  .replaceAll('import.meta.env','globalThis.__uploadDiagnosticTest.env')
 const {transferStorageImage}=await import(url(code))
 const file=new File([new Uint8Array(12)],'reference.jpg',{type:'image/jpeg'})
 try{
  await assert.rejects(transferStorageImage(context.bucket,context.objectPath,file,()=>{},(path,owner)=>path===context.objectPath&&owner==='owner'),error=>{
   assert.equal(error.httpStatus,400);assert.equal(error.storageCode,'Unauthorized');assert.match(error.message,/row-level security/);assert.deepEqual(error.context,context);assert.doesNotMatch(JSON.stringify(error),/test-access-token|test-publishable-key|reference\.jpg/);return true
  })
  assert.equal(requests[0].method,'POST');assert.equal(requests[0].endpoint,'https://project.test/storage/v1/object/'+context.bucket+'/'+context.objectPath)
  assert.equal(requests[0].headers['Content-Type'],'image/jpeg');assert.equal(requests[0].headers['x-upsert'],'false');assert.equal(requests[0].headers.Authorization,'Bearer test-access-token')
  response={status:200,body:'{}'};await transferStorageImage(context.bucket,context.objectPath,file,()=>{},()=>true)
  const n=requests.length;await assert.rejects(transferStorageImage(context.bucket,context.objectPath,file,()=>{},()=>false),/account changed/);assert.equal(requests.length,n)
 }finally{globalThis.XMLHttpRequest=original;delete globalThis.__uploadDiagnosticTest}
})
