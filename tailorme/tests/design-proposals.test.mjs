import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const image={id:'upload-id',image_path:'tailor/chat/request/proposal/upload.jpg'}

test('proposal transport freezes IDs/version inputs, preserves Storage paths locally and reads participant-scoped history',async()=>{
 const calls=[],queries=[]
 const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{id:args.p_id},error:null}},from:table=>{const query={table};queries.push(query);return{select(){return this},eq(key,value){query[key]=value;return this},order(key){query.order??=[];query.order.push(key);return this},then(resolve){resolve({data:[],error:null})}}}}
 globalThis.__proposalDb=db
 const code=compile(read('../src/services/designProposalService.ts')).replace(/import \{ supabase \} from '[^']+';/,'const supabase=globalThis.__proposalDb;')
 const {designProposalService:service}=await import(url(code))
 const submission={id:'proposal',requestId:'request',explanation:'Use these sleeves',images:[image],requestVersion:4,designVersion:1}
 await service.propose(submission);await service.propose(submission);assert.deepEqual(calls[0],calls[1]);assert.deepEqual(calls[0].args.p_images,['upload-id']);assert.equal(calls[0].args.p_expected_design_version,1);assert.equal(calls[0].args.p_expected_request_version,4);assert.equal(JSON.stringify(calls[0]).includes('image_path'),false)
 await service.decide('proposal','accepted',1,true);assert.deepEqual(calls.at(-1),{name:'decide_request_design',args:{p_id:'proposal',p_status:'accepted',p_expected_version:1,p_confirm:true}})
 await service.load('request');assert.deepEqual(queries.map(q=>q.table),['design_change_proposals','request_agreed_designs']);assert.ok(queries.every(q=>q.request_id==='request'));assert.deepEqual(queries[1].order,['version'])
 delete globalThis.__proposalDb
})

test('actual proposal UI requires separate acceptance confirmation, retries frozen decisions/submissions and retains history',async()=>{
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],tree,role='customer',user='customer',fail=true,designPending=false
 let proposals=[{id:'proposal',request_id:'request',explanation:'Use these sleeves',images:[image],base_version:0,request_version:2,status:'pending',version:1,created_at:'2026-10-30T00:00:00Z',decided_at:null}],designs=[{request_id:'request',version:0,original_snapshot:null,images:[],explanation:'',agreed_at:'2026-10-30T00:00:00Z'}]
 const calls=[],submissions=[],request={id:'request',customer_id:'customer',tailor_id:'tailor',status:'accepted',completed_at:null,version:2}
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 const service={async load(){return structuredClone({proposals,designs})},async decide(id,status,version,confirm){calls.push({id,status,version,confirm});if(fail)throw Error('Lost response');const p=proposals.find(p=>p.id===id);p.status=status;p.version=2;p.decided_at='2026-10-30T01:00:00Z';p.decided_by=user;if(status==='accepted')designs.unshift({request_id:'request',version:1,images:[image],explanation:p.explanation,agreed_at:p.decided_at});return p},async propose(submission){submissions.push(structuredClone(submission));if(fail)throw Error('Offline');const p={id:submission.id,request_id:'request',images:submission.images,explanation:submission.explanation,base_version:submission.designVersion,request_version:submission.requestVersion,status:'pending',version:1,created_at:'2026-10-30T02:00:00Z'};proposals.unshift(p);return p}}
 const original={window:globalThis.window,document:globalThis.document};globalThis.window=new EventTarget();globalThis.document={visibilityState:'visible'}
 globalThis.__proposalUI={hooks,service,auth:()=>({session:{user:{id:user}}}),portal:()=>({role})}
 let code=compile(read('../src/components/portal/RequestDesignProposals.tsx'))
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useRef,useState}=globalThis.__proposalUI.hooks;')
  .replace(/import \{ useAuth \} from '[^']+';/,'const useAuth=globalThis.__proposalUI.auth;')
  .replace(/import \{ usePortal \} from '[^']+';/,'const usePortal=globalThis.__proposalUI.portal;')
  .replace(/import \{ designProposalService \} from '[^']+';/,'const designProposalService=globalThis.__proposalUI.service;')
  .replace(/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;')
  .replace(/import ChatImageComposer, \{ ChatImageView \} from '[^']+';/,'const ChatImageComposer=()=>null,ChatImageView=()=>null;')
  .replace(/import (\w+) from '[^']+';/g,'const $1=()=>null;').replace(/import '[^']+\.css';/g,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Page}=await import(url(code)),props={request,onPendingChange:value=>{designPending=value}}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const render=()=>{cursor=0;tree=Page(props)}
 const settle=async()=>{for(let i=0;i<5;i++){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);render()}}
 const button=text=>nodes(tree).find(n=>n.props?.children===text)
 const form=()=>nodes(tree).find(n=>n.type==='form')
 const reset=()=>{for(const cleanup of cleanups)cleanup?.();state.length=0;deps.length=0;cleanups.length=0;effects=[];render()}
 try{
  render();await settle();assert.equal(designPending,true);assert.equal(button('Withdraw proposal'),undefined,'customer cannot withdraw')
  button('Review acceptance').props.onClick();await settle();assert.equal(calls.length,0,'review does not accept')
  button('Review acceptance').props.onClick();await settle();assert.equal(calls.length,0,'repeated review clicks never bypass the explicit confirmation action')
  button('Keep current design').props.onClick();await settle();assert.equal(calls.length,0,'cancel is non-mutating')
  button('Review acceptance').props.onClick();await settle();button('Confirm accept design change').props.onClick();await settle();assert.equal(calls.length,1);assert.equal(calls[0].confirm,true)
  assert.ok(button('Retry same proposal decision'));fail=false;button('Retry same proposal decision').props.onClick();await settle();assert.deepEqual(calls[0],calls[1]);assert.equal(designPending,false)
  assert.ok(nodes(tree).some(n=>n.props?.design?.version===1),'latest agreed version is displayed')
  assert.ok(nodes(tree).some(n=>n.props?.title==='Original request design (preserved)'),'original remains accessible')
  role='tailor';user='tailor';fail=true;reset();await settle()
  assert.equal(button('Review acceptance'),undefined,'tailor cannot accept')
  nodes(tree).find(n=>n.props?.id==='proposal-explanation').props.onChange({target:{value:'New neckline'}});render()
  form().props.onSubmit({preventDefault(){}});await settle();assert.equal(submissions.length,0,'images required')
  nodes(tree).find(n=>n.props?.draftId).props.onChange([image]);render();form().props.onSubmit({preventDefault(){}});await settle();assert.equal(submissions.length,1)
  assert.ok(button('Retry same proposal'));fail=false;form().props.onSubmit({preventDefault(){}});await settle();assert.deepEqual(submissions[0],submissions[1]);assert.equal(designPending,true)
  assert.ok(button('Withdraw proposal'));button('Withdraw proposal').props.onClick();await settle();assert.equal(calls.at(-1).status,'withdrawn');assert.equal(designPending,false)
  request.completed_at='2026-10-30T03:00:00Z';request.version=3;render();await settle();assert.equal(form(),undefined,'completed history is read-only');assert.ok(nodes(tree).some(n=>n.type==='details'))
  user='stranger';render();await settle();assert.equal(tree,null,'unrelated user has no UI history')
 }finally{for(const cleanup of cleanups)cleanup?.();Object.assign(globalThis,original);delete globalThis.__proposalUI}
})
