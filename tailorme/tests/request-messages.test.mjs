import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const utilityUrl=url(compile(read('../src/utils/requestMessages.ts')))
const {conversationSync,mergeMessages,validateMessage,canMessage,canMarkConversationRead}=await import(utilityUrl)
const message=n=>({id:`message-${n}`,request_id:'request',sequence:n,sender_id:n%2?'customer':'tailor',body:`Message ${n}`,created_at:'2026-10-29T00:00:00Z'})

test('plain text validation, terminal rules, visibility and stable deduplication',()=>{
 for(const text of ['', ' \n\t ', 'x'.repeat(2001)])assert.ok(validateMessage(text))
 assert.equal(validateMessage(' '+ '😀'.repeat(2000)+' '),'')
 assert.equal(validateMessage('<script>literal text</script>'),'')
 for(const status of ['pending','accepted'])assert.equal(canMessage({status,completed_at:null}),true)
 for(const status of ['cancelled','rejected'])assert.equal(canMessage({status,completed_at:null}),false)
 assert.equal(canMessage({status:'accepted',completed_at:'now'}),false)
 assert.equal(canMarkConversationRead(false,'visible'),false);assert.equal(canMarkConversationRead(true,'hidden'),false);assert.equal(canMarkConversationRead(true,'visible'),true)
 assert.deepEqual(mergeMessages([message(3),message(1)],[message(2),message(3)]).map(m=>m.sequence),[1,2,3])
})

test('reconnect drains every missed page, queues initial races, preserves older rows and deduplicates retries',async()=>{
 let server=Array.from({length:30},(_,i)=>message(i+1)),rows=[],meta=0,errors=0,release
 let block=true
 const sync=conversationSync({latest:async()=>{const page=server.slice(-30);if(block)await new Promise(resolve=>{release=resolve});return{rows:page,hasMore:false}},after:async cursor=>server.filter(m=>m.sequence>cursor).slice(0,100),meta:async()=>{meta++}},incoming=>{rows=mergeMessages(rows,incoming)},()=>{errors++})
 const initial=sync.refresh();server.push(message(31));void sync.refresh();block=false;release();await initial
 assert.equal(rows.length,31,'subscription race after first snapshot is recovered')
 server.push(...Array.from({length:205},(_,i)=>message(i+32)));await sync.refresh();await sync.refresh()
 assert.equal(rows.length,236);assert.equal(new Set(rows.map(m=>m.id)).size,236);assert.equal(rows[0].sequence,1);assert.equal(rows.at(-1).sequence,236)
 assert.ok(meta>=3);assert.equal(errors,0)
 sync.stop();server.push(message(237));await sync.refresh();assert.equal(rows.length,236,'stopped lifecycle ignores further refreshes')
 let failed=true,recovered=[]
 const retry=conversationSync({latest:async()=>{if(failed)throw Error('offline');return{rows:[message(1)],hasMore:false}},after:async()=>[],meta:async()=>{}},incoming=>{recovered=incoming},()=>{errors++})
 await retry.refresh();assert.equal(errors,1);failed=false;await retry.refresh();assert.equal(recovered.length,1)
})

test('real transport uses authorized table filters, cursor pages, reconnect reconciliation and channel cleanup',async()=>{
 const stubUrl=url('export let supabase=null;export function setSupabase(value){supabase=value}')
 const code=compile(read('../src/services/messageService.ts')).replace("from '../lib/supabase'",`from '${stubUrl}'`)
 const {messageService}=await import(url(code)),{setSupabase}=await import(stubUrl)
 const handlers=[],statuses=[];let refreshed=0,removed=null,filter=null,before=null
 const channel={on(kind,options,callback){handlers.push({kind,options,callback});return this},subscribe(callback){this.status=callback;return this}}
 const data=Array.from({length:36},(_,i)=>message(i+1))
 setSupabase({channel:()=>channel,removeChannel:c=>{removed=c;return Promise.resolve()},from:table=>{assert.equal(table,'request_messages');return {select(){return this},eq(key,value){filter={key,value};return this},lt(key,value){before=value;return this},order(){return this},async limit(n){return{data:data.filter(m=>before===null||m.sequence<before).reverse().slice(0,n)}}}}})
 try{
  const page=await messageService.page('request');assert.equal(page.hasMore,true);assert.deepEqual(page.rows.map(m=>m.sequence),Array.from({length:30},(_,i)=>i+7));assert.deepEqual(filter,{key:'request_id',value:'request'})
  const older=await messageService.page('request',7);assert.equal(older.hasMore,false);assert.deepEqual(older.rows.map(m=>m.sequence),[1,2,3,4,5,6])
  const stop=messageService.watch('request','customer',()=>{refreshed++},s=>statuses.push(s))
  assert.equal(handlers.length,3);assert.equal(handlers[0].options.filter,'request_id=eq.request');assert.equal(handlers[0].options.event,'INSERT')
  channel.status('SUBSCRIBED');handlers[0].callback({new:message(40)});channel.status('CHANNEL_ERROR');channel.status('SUBSCRIBED')
  assert.equal(refreshed,3);assert.deepEqual(statuses,['SUBSCRIBED','CHANNEL_ERROR','SUBSCRIBED']);stop();assert.equal(removed,channel)
 }finally{setSupabase(null)}
})

test('real Messages handlers preserve failed text, retry one UUID, mark only visible history and clean up on logout',async()=>{
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[],rows=[],calls=[],reads=[],fail=true,observer,stopped=0
 const req={id:'request',customer_id:'customer',tailor_id:'tailor',status:'pending',completed_at:null,customer_name:'Customer',shop_name:'Atelier'}
 const auth={session:{user:{id:'customer'}}}
 const history={scrollTop:123,scrollHeight:500,getBoundingClientRect:()=>({top:0,bottom:600})},tail={getBoundingClientRect:()=>({top:500,bottom:502})}
 const events=new EventTarget(),documentEvents=new EventTarget()
 const original={window:globalThis.window,document:globalThis.document,IntersectionObserver:globalThis.IntersectionObserver}
 globalThis.window=Object.assign(events,{innerHeight:800,IntersectionObserver:true})
 globalThis.document=Object.assign(documentEvents,{visibilityState:'hidden'})
 globalThis.IntersectionObserver=class{constructor(fn){observer=fn}observe(){observer([{isIntersecting:true}])}disconnect(){}}
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}};hooks.useLayoutEffect=hooks.useEffect
 const service={async page(){return{rows:rows.slice(-30),hasMore:false}},async after(_id,n){return rows.filter(m=>m.sequence>n)},async summaries(){return[{request_id:'request',unread:rows.filter(m=>m.sender_id!=='customer'&&m.sequence>(reads.at(-1)??0)).length,last_read_sequence:reads.at(-1)??0,latest_sequence:rows.at(-1)?.sequence??0}]},async read(_id,n){reads.push(n);return n},async send(id,_requestId,body,images){calls.push({id,body,images});if(fail)throw Error('Offline');const sent={...message(1),id,body,images};rows.push(sent);return sent},watch(_id,_user,refresh,status){this.refresh=refresh;status('SUBSCRIBED');return()=>{stopped++}}}
 globalThis.__chatTest={hooks,auth,service,requestService:{get:async()=>req}}
 let code=compile(read('../src/components/portal/RequestMessages.tsx'))
 code=code.replace(/import \{[^}]+\} from 'react';/,'const {useEffect,useLayoutEffect,useRef,useState}=globalThis.__chatTest.hooks;')
  .replace(/import \{ useAuth \} from '[^']+';/,'const useAuth=()=>globalThis.__chatTest.auth;')
  .replace(/import \{ requestService \} from '[^']+';/,'const requestService=globalThis.__chatTest.requestService;')
  .replace(/import \{ messageService \} from '[^']+';/,'const messageService=globalThis.__chatTest.service;')
  .replace(/import ChatImageComposer, \{ ChatImageView \} from '[^']+';/,'const ChatImageComposer=()=>null,ChatImageView=()=>null;')
  .replace("from '../../utils/requestMessages'",`from '${utilityUrl}'`)
  .replace(/import FormButton from '[^']+';/,'const FormButton=()=>null;').replace(/import '[^']+\.css';/,'').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Messages}=await import(url(code))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree
 const render=()=>{cursor=0;tree=Messages({request:req});for(const n of nodes(tree)){if(n.props?.className==='request-chat-history')n.props.ref.current=history;if(n.props?.className==='request-chat-end')n.props.ref.current=tail}}
 const settle=async()=>{for(let i=0;i<4;i++){for(const effect of effects.splice(0))effect();await new Promise(setImmediate);render()}}
 const button=text=>nodes(tree).find(n=>n.props?.children===text)
 try{
  render();await settle()
  let input=nodes(tree).find(n=>n.props?.id==='request-message-body');input.props.onChange({target:{value:' Keep my text '}});render()
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle()
  assert.equal(nodes(tree).find(n=>n.props?.id==='request-message-body').props.value,' Keep my text ')
  assert.ok(nodes(tree).some(n=>n.props?.role==='alert'&&String(n.props.children).includes('Offline')),'the actual send error is shown without losing the draft')
  assert.ok(button('Retry same message'));fail=false;button('Retry same message').props.onClick?.()
  // Submit uses the same frozen attempt for retry.
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle()
  assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(nodes(tree).find(n=>n.props?.id==='request-message-body').props.value,'')
  assert.equal(reads.length,0,'hidden tab does not mark messages read')
  rows.push({...message(2),body:'<script>literal</script>'});service.refresh();await settle();assert.equal(history.scrollTop,123,'new messages do not force-scroll older history')
  globalThis.document.visibilityState='visible';observer([{isIntersecting:false}]);documentEvents.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(reads.length,0)
  observer([{isIntersecting:true}]);await settle();assert.equal(reads.at(-1),2)
  assert.ok(nodes(tree).some(n=>n.type==='p'&&n.props.children==='<script>literal</script>'),'body remains a React text child')
  const editor=()=>nodes(tree).find(n=>n.props?.draftId)
  const image={id:'image-id',image_path:'private/path.jpg'},imageDraft=editor().props.draftId
  editor().props.onChange([image]);render();fail=true
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle()
  assert.equal(calls.at(-1).body,'');assert.deepEqual(calls.at(-1).images,[image]);assert.equal(calls.at(-1).id,imageDraft,'reserved message ID is used for submission')
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await settle();assert.deepEqual(calls.at(-1),calls.at(-2),'image retry freezes exact caption, IDs and order')
  rows.push({...message(3),id:imageDraft,sender_id:'customer',body:'',images:[image]});await service.refresh();await settle()
  assert.notEqual(editor().props.draftId,imageDraft,'reconciliation starts a fresh image draft after confirmed delivery');assert.equal(button('Retry same message'),undefined)
  assert.equal(nodes(tree).filter(n=>n.props?.image?.id==='image-id').length,1,'received immutable image renders once after reconciliation')
  assert.equal(history.scrollTop,123,'image reconciliation does not force-scroll history')
  auth.session=null;render();await settle();assert.equal(tree,null);assert.equal(stopped,1,'logout unsubscribes')
 }finally{for(const cleanup of cleanups)cleanup?.();Object.assign(globalThis,original);delete globalThis.__chatTest}
})
