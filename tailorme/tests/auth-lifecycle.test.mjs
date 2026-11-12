import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
function harness(){
 const state=[],deps=[],cleanups=[];let cursor=0,effects=[]
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useEffect(fn,next){const i=cursor++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 return{hooks,render(Page){cursor=0;return Page({children:'active draft'})},async flush(){for(const fn of effects.splice(0))fn();await new Promise(setImmediate)},dispose(){for(const cleanup of cleanups)cleanup?.()}}
}
async function load(file,replacements){let code=compile(readFileSync(new URL(file,import.meta.url),'utf8'));for(const [pattern,value] of replacements)code=code.replace(pattern,value);return import(url(code.replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))))}
test('same-account token renewal retains portal access/drafts while rechecking role; account switch masks old profile immediately',async()=>{
 const originalWindow=globalThis.window;globalThis.window=new EventTarget()
 const h=harness();let avatar=null;let session={user:{id:'customer-one'},access_token:'token-one'},release,block=false,queries=0
 const db={from:table=>({select(){return this},eq(){return this},async single(){return{data:{avatar_path:avatar},error:null}},async maybeSingle(){queries++;if(block)await new Promise(resolve=>{const prior=release;release=()=>{prior?.();resolve()}});return{data:table==='profiles'?{id:session.user.id,full_name:'Local Customer'}:{role:'customer'},error:null}}})}
 globalThis.__authLifecycle={hooks:h.hooks,db,auth:()=>({session})}
 const {default:Provider}=await load('../src/auth/PortalProvider.tsx',[
  [/import \{ useEffect, useState \} from 'react';/,'const {useEffect,useState}=globalThis.__authLifecycle.hooks;'],[/import \{ useAuth \} from '[^']+';/,'const useAuth=globalThis.__authLifecycle.auth;'],[/import \{ PortalContext \} from '[^']+';/,'const PortalContext={Provider:()=>null};'],[/import \{ supabase \} from '[^']+';/,'const supabase=globalThis.__authLifecycle.db;'],[/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;']])
 try{
  assert.equal(h.render(Provider).props.value.status,'loading');await h.flush();assert.equal(h.render(Provider).props.value.status,'ready')
  avatar='new-private-avatar';window.dispatchEvent(new Event('tailorme:avatar-changed'));await new Promise(setImmediate);let updated=h.render(Provider).props.value;assert.equal(updated.status,'ready');assert.equal(updated.profile.avatar_path,avatar);assert.equal(updated.profile.full_name,'Local Customer')
  avatar=null;window.dispatchEvent(new Event('tailorme:avatar-changed'));await new Promise(setImmediate);assert.equal(h.render(Provider).props.value.profile.avatar_path,null)
  block=true;session={...session,access_token:'renewed-token'};assert.equal(h.render(Provider).props.value.status,'ready','token refresh must not replace an active form with a loading screen');await h.flush();assert.equal(queries,4,'new token still rechecks profile/role')
  release();await new Promise(setImmediate);block=false
  session={user:{id:'customer-two'},access_token:'other-token'};const switched=h.render(Provider).props.value;assert.equal(switched.status,'loading');assert.equal(switched.profile,null);await h.flush();assert.equal(h.render(Provider).props.value.profile.id,'customer-two')
 }finally{h.dispose();globalThis.window=originalWindow;delete globalThis.__authLifecycle}
})
test('late initial-session errors cannot replace a newer sign-in or revive a signed-out session',async()=>{
 const h=harness();let listener,rejectInitial,unsubscribed=false
 const db={auth:{onAuthStateChange(fn){listener=fn;return{data:{subscription:{unsubscribe(){unsubscribed=true}}}}},getSession(){return new Promise((_,reject)=>{rejectInitial=reject})}}}
 globalThis.__authLifecycle={hooks:h.hooks,db}
 const {default:Provider}=await load('../src/auth/AuthProvider.tsx',[
  [/import \{ useEffect, useState \} from 'react';/,'const {useEffect,useState}=globalThis.__authLifecycle.hooks;'],[/import \{ configurationError, supabase \} from '[^']+';/,'const configurationError=null,supabase=globalThis.__authLifecycle.db;'],[/import \{ AuthContext \} from '[^']+';/,'const AuthContext={Provider:()=>null};'],[/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;']])
 try{h.render(Provider);await h.flush();listener('SIGNED_IN',{user:{id:'customer'}});rejectInitial(Error('Stale restore failed'));await new Promise(setImmediate);let value=h.render(Provider).props.value;assert.equal(value.session.user.id,'customer');assert.equal(value.error,null);assert.equal(value.loading,false);listener('SIGNED_OUT',null);value=h.render(Provider).props.value;assert.equal(value.session,null)}finally{h.dispose();assert.equal(unsubscribed,true);delete globalThis.__authLifecycle}
})
