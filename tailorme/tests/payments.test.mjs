import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`,cache=new Map()
function moduleUrl(file){
 if(cache.has(file.href))return cache.get(file.href)
 let code=file.pathname.endsWith('/lib/supabase.ts')?'export let supabase=null;export function setSupabase(value){supabase=value}':file.pathname.endsWith('/services/shopUploads.ts')?'export async function transferStorageImage(){throw Error("Unexpected network upload")}':compile(readFileSync(file,'utf8'))
 code=code.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`;const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate));return `from '${moduleUrl(child)}'`})
 const result=url(code);cache.set(file.href,result);return result
}
const load=p=>import(moduleUrl(new URL(p,import.meta.url)))
const {paymentService,paymentAmount}=await load('../src/services/paymentService.ts'),{setSupabase}=await load('../src/lib/supabase.ts')
const {paymentReceiptService,uploadReceipt,validateReceipt,RECEIPT_BUCKET}=await load('../src/services/paymentReceiptService.ts')
const owner='c1000000-0000-4000-8000-000000000001',requestId='c4000000-0000-4000-8000-000000000001',draftId='c2000000-0000-4000-8000-000000000006',id='c3000000-0000-4000-8000-000000000006'
const row={id,owner_id:owner,request_id:requestId,draft_id:draftId,image_path:`${owner}/receipts/${requestId}/${draftId}/${id}.pdf`,payment_id:null}
const pdf=new File(['%PDF-1.7\nreceipt'],'receipt.pdf',{type:'application/pdf'})

test('money remains decimal text and reporting sends only immutable quote/bank versions, never client totals or bank snapshot values',async()=>{
 assert.equal(paymentAmount('00020.1'),'20.10');assert.equal(paymentAmount('2999999999.97'),'2999999999.97');assert.equal(paymentAmount('0.01'),'0.01')
 for(const input of ['0','0.00','-1','NaN','Infinity','1e2','1.001','9999999999999'])assert.throws(()=>paymentAmount(input))
 const calls=[];setSupabase({rpc:async(name,args)=>{calls.push({name,args});return{data:draftId,error:null}}})
 try{
  const submission={id:draftId,requestId,quoteId:'quote',method:'bank_transfer',amount:'20.10',paidOn:'2026-10-30',reference:'TX',receiptId:id,bankVersion:1,destination:{account_holder:'Holder',bank:'Bank',branch:'Branch',account_number:'00001234'},receiptPath:row.image_path}
  await paymentService.report(submission);await paymentService.report(submission);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].args.p_amount,'20.10');assert.equal(calls[0].args.p_bank_version,1);assert.equal(calls[0].args.p_receipt_id,id);assert.doesNotMatch(JSON.stringify(calls[0]),/00001234|receiptPath|destination|confirmed|total/)
  await paymentService.decide(draftId,'confirmed','',1,true);assert.equal(calls.at(-1).args.p_confirm_received,true);assert.equal(calls.at(-1).args.p_expected_version,1)
 }finally{setSupabase(null)}
})

test('receipt types/bytes/size validate before reserve, stable IDs recover partial/lost uploads without overwriting',async()=>{
 const files=[new File([new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])],'x.jpg',{type:'image/jpeg'}),new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'x.png',{type:'image/png'}),new File(['RIFF0000WEBP'],'x.webp',{type:'image/webp'}),pdf]
 assert.deepEqual(await Promise.all(files.map(validateReceipt)),['jpg','png','webp','pdf'])
 let ready=false,reserved=null;const calls=[],api={...paymentReceiptService,reserve:async(...args)=>{calls.push(args);return row},ready:async()=>ready}
 const options={file:pdf,id,requestId,draftId,userId:owner,progress(){},onReserved:u=>{reserved=u},api}
 for(const invalid of [new File(['<html>'],'x.pdf',{type:'application/pdf'}),new File(['%PDF-'],'x.pdf',{type:'text/html'}),new File([],'x.pdf',{type:'application/pdf'}),new File([new Uint8Array(5242881)],'x.pdf',{type:'application/pdf'})])await assert.rejects(uploadReceipt({...options,file:invalid}))
 assert.equal(calls.length,0)
 await assert.rejects(uploadReceipt({...options,send:async()=>{throw Error('Offline')}}),/Offline/);assert.deepEqual(reserved,row)
 await uploadReceipt({...options,send:async()=>{ready=true;throw Error('Lost response')}})
 await uploadReceipt({...options,send:async()=>{throw Error('Must not upload twice')}});assert.deepEqual(calls[0],calls[1])
 await assert.rejects(uploadReceipt({...options,userId:'stranger'}),/account or request changed/)
 await assert.rejects(uploadReceipt({...options,requestId:'different'}),/account or request changed/)
})

test('private receipt signing and API cleanup exclude active drafts and preserve attached/foreign files',async()=>{
 let present=false;const calls=[]
 setSupabase({storage:{from:bucket=>{assert.equal(bucket,RECEIPT_BUCKET);return{createSignedUrl:async(path,seconds)=>{calls.push({path,seconds});return{data:{signedUrl:'https://private.test/temporary'}}},remove:async paths=>{calls.push({remove:paths});return{error:null}}}}},rpc:async(name,args)=>{calls.push({name,args});return{data:name==='unused_payment_receipts'?[row]:name==='payment_receipt_ready'?present:null,error:null}}})
 try{await paymentReceiptService.preview(row.image_path);assert.equal(calls[0].seconds,120);assert.equal(await paymentReceiptService.cleanup(owner,draftId),1);assert.deepEqual(calls[1],{name:'unused_payment_receipts',args:{p_exclude_draft:draftId}});assert.deepEqual(calls[2],{remove:[row.image_path]});assert.equal(calls.at(-1).name,'release_payment_receipt');const n=calls.length;await assert.rejects(paymentReceiptService.remove(row,'stranger'),/another customer/);assert.equal(calls.length,n);present=true;await assert.rejects(paymentReceiptService.remove(row,owner),/protected/);assert.equal(calls.at(-1).name,'payment_receipt_ready')}finally{setSupabase(null)}
 assert.doesNotMatch(read('../src/components/portal/PhotoStylingPreview.tsx'),/paymentReceiptService|uploadReceipt|request-payment-receipts/)
 assert.doesNotMatch(read('../src/pages/PublicTailorPage.tsx'),/TailorBankDetails|tailor_bank_accounts/)
})

test('real payment UI requires review and actual-funds confirmation, preserves failed retries and supports corrected reports',async()=>{
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],tree,user='customer',role='customer',fail=true
 const bank={owner_id:'tailor',account_holder:'Holder',bank:'Bank',branch:'Branch',account_number:'00001234',version:1}
 const server={eligible:true,quote_id:'quote',total:'120.30',confirmed:'0.00',awaiting:'0.00',balance:'120.30',bank,payments:[]},reports=[],decisions=[]
 const request={id:'request',customer_id:'customer',tailor_id:'tailor',status:'accepted',completed_at:null,version:2}
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 const service={async state(){return structuredClone(server)},async report(s){reports.push(structuredClone(s));if(fail)throw Error('Offline');server.payments.unshift({id:s.id,request_id:'request',method:s.method,amount:s.amount,paid_on:s.paidOn,reference:s.reference,receipt_path:s.receiptPath,destination:s.destination,created_at:'2026-10-30T01:00:00Z',status:'pending',version:1});server.awaiting=s.amount;return s.id},async decide(id,status,reason,version,confirm){decisions.push({id,status,reason,version,confirm});if(fail)throw Error('Response lost');const p=server.payments.find(p=>p.id===id);p.status=status;p.version=2;p.reason=reason;p.decided_at='2026-10-30T02:00:00Z';return id}}
 const original={window:globalThis.window,document:globalThis.document};globalThis.window=new EventTarget();globalThis.document={visibilityState:'visible'}
 globalThis.__paymentsUI={hooks,service,auth:()=>({session:{user:{id:user}}}),portal:()=>({role}),amount:paymentAmount}
 let code=compile(read('../src/components/portal/RequestPayments.tsx'))
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useRef,useState}=globalThis.__paymentsUI.hooks;')
  .replace(/import \{ useAuth \} from '[^']+';/,'const useAuth=globalThis.__paymentsUI.auth;')
  .replace(/import \{ usePortal \} from '[^']+';/,'const usePortal=globalThis.__paymentsUI.portal;')
  .replace(/import \{ requestToday \} from '[^']+';/,"const requestToday=()=> '2026-10-30';")
  .replace(/import \{ paymentService, paymentAmount \} from '[^']+';/,'const paymentService=globalThis.__paymentsUI.service,paymentAmount=globalThis.__paymentsUI.amount;')
  .replace(/import \{ lkr \} from '[^']+';/,"const lkr=value=>'LKR '+value;")
  .replace(/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;')
  .replace(/import PaymentReceiptEditor, \{ ReceiptView \} from '[^']+';/,'const PaymentReceiptEditor=()=>null,ReceiptView=()=>null;')
  .replace(/import FormButton from '[^']+';/,'const FormButton=()=>null;').replace(/import '[^']+\.css';/g,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Page,BankDestination}=await import(url(code)),nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const render=()=>{cursor=0;tree=Page({request})},settle=async()=>{for(let i=0;i<5;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 const button=text=>nodes(tree).find(n=>n.props?.children===text),input=id=>nodes(tree).find(n=>n.props?.id===id),form=()=>nodes(tree).find(n=>n.type==='form')
 const change=(id,value)=>{input(id).props.onChange({target:{value}});render()}
 const reset=()=>{for(const cleanup of cleanups)cleanup?.();state.length=0;deps.length=0;cleanups.length=0;effects=[];render()}
 try{
  server.eligible=false;server.bank=null;render();await settle();assert.equal(form(),undefined,'bank/payment controls are unavailable before quotation acceptance')
  server.eligible=true;server.bank=bank
  window.dispatchEvent(new CustomEvent('tailorme:quotation-changed',{detail:{requestId:'another-request'}}));await settle();assert.equal(form(),undefined,'another request event cannot change eligibility')
  window.dispatchEvent(new CustomEvent('tailorme:quotation-changed',{detail:{requestId:'request'}}));await settle();assert.ok(form(),'accepted quotation immediately refreshes payment eligibility')
  change('payment-method','bank_transfer');assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Bank transfer destination'),'transfer destination is shown directly in the selected method')
  server.bank=null;window.dispatchEvent(new CustomEvent('tailorme:quotation-changed',{detail:{requestId:'request'}}));await settle()
  assert.ok(nodes(tree).some(n=>n.props?.children==='The tailor has not added bank details yet'));assert.equal(button('Review payment report').props.disabled,true,'missing bank details disable transfer submission')
  server.bank=bank;window.dispatchEvent(new CustomEvent('tailorme:quotation-changed',{detail:{requestId:'request'}}));await settle();change('payment-method','cash')
  change('payment-amount','20.10');form().props.onSubmit({preventDefault(){}});await settle();assert.equal(reports.length,0,'review does not submit or count money')
  button('Back to edit').props.onClick();await settle();assert.equal(reports.length,0)
  form().props.onSubmit({preventDefault(){}});await settle();button('Submit for tailor verification').props.onClick();await settle();assert.equal(reports.length,1);assert.ok(button('Retry same payment report'));assert.equal(button('Back to edit'),undefined,'ambiguous submission cannot mutate its frozen report')
  fail=false;button('Retry same payment report').props.onClick();await settle();assert.deepEqual(reports[0],reports[1]);assert.equal(input('payment-amount').props.value,'')
  change('payment-method','bank_transfer');change('payment-amount','30.20');change('payment-reference','TX-123');nodes(tree).find(n=>n.props?.onReady).props.onReady({...row,id:'receipt-id',image_path:row.image_path});render();form().props.onSubmit({preventDefault(){}});await settle()
  const destination=nodes(tree).find(n=>n.props?.bank?.account_number==='00001234');assert.ok(destination,'review includes exact bank destination');button('Submit for tailor verification').props.onClick();await settle();assert.equal(reports.at(-1).bankVersion,1);assert.equal(reports.at(-1).receiptId,'receipt-id')
  user='tailor';role='tailor';reset();await settle();assert.equal(form(),undefined,'tailor cannot report customer payments')
  button('Review payment receipt').props.onClick();await settle();assert.ok(nodes(tree).some(n=>n.type==='p'&&String(n.props.children).includes('Check your bank account')))
  assert.equal(button('Confirm receipt of money').props.disabled,true);button('Confirm receipt of money').props.onClick();await settle();assert.equal(decisions.length,0,'receipt preview alone cannot confirm money')
  nodes(tree).find(n=>n.props?.type==='checkbox').props.onChange({target:{checked:true}});render();fail=true;button('Confirm receipt of money').props.onClick();await settle();assert.ok(button('Retry same payment decision'));fail=false;button('Retry same payment decision').props.onClick();await settle();assert.deepEqual(decisions[0],decisions[1]);assert.equal(decisions[0].confirm,true)
  button('Review payment receipt').props.onClick();await settle();button('Reject payment report').props.onClick();await settle();assert.equal(decisions.length,2,'rejection requires a reason');nodes(tree).find(n=>n.type==='textarea').props.onChange({target:{value:'Cash not received'}});render();button('Reject payment report').props.onClick();await settle();assert.equal(decisions.at(-1).status,'rejected');assert.equal(server.payments.length,2,'rejection preserves submissions')
  user='stranger';render();await settle();assert.equal(tree,null)
  // Render the actual reusable destination and exercise clipboard outcomes.
  for(const cleanup of cleanups)cleanup?.();state.length=0;cursor=0
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),copied=[]
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async value=>{copied.push(value)}}}})
  try{
   let destination=BankDestination({bank})
   for(const value of ['Holder','Bank','Branch','00001234'])assert.ok(nodes(destination).some(n=>n.props?.children===value),`full destination includes ${value}`)
   nodes(destination).find(n=>n.props?.['aria-label']==='Copy full account number').props.onClick();await new Promise(setImmediate);cursor=0;destination=BankDestination({bank})
   assert.deepEqual(copied,['00001234']);assert.equal(typeof copied[0],'string');assert.ok(nodes(destination).some(n=>n.props?.role==='status'&&n.props.children==='Account number copied.'))
   globalThis.navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied')}
   nodes(destination).find(n=>n.props?.['aria-label']==='Copy full account number').props.onClick();await new Promise(setImmediate);cursor=0;destination=BankDestination({bank})
   assert.ok(nodes(destination).some(n=>String(n.props?.children).includes('copy it manually')))
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator}
 }finally{for(const cleanup of cleanups)cleanup?.();Object.assign(globalThis,original);delete globalThis.__paymentsUI}
})
