import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const utils=url(compile(read('../src/utils/measurements.ts')))
let state=[],cursor=0,effects=[],dependencies=[],calls=[],profile=null,fail=false
const hooks={
 useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},
 useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},
 useEffect(fn,deps){const i=cursor++;if(!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=deps;effects.push(fn)}}
}
const service={async get(){return profile},async save(values,date){calls.push({values,date});if(fail)throw Error('Offline');profile={owner_id:'owner',values_cm:values,measured_on:date,updated_at:'2026-10-29T00:00:00Z'};return profile},async remove(owner){calls.push({delete:owner});profile=null}}
globalThis.__measurementUI={hooks,service}
let code=compile(read('../src/pages/MeasurementsPage.tsx'))
code=code.replace(/import \{[^}]+\} from 'react';/,'const {useState,useRef,useEffect}=globalThis.__measurementUI.hooks;')
 .replace(/import \{ measurementService \} from '[^']+';/,'const measurementService=globalThis.__measurementUI.service;')
 .replace(/from '..\/utils\/measurements'/,`from '${utils}'`)
 .replace(/import \{ requestToday \} from '[^']+';/,"const requestToday=()=> '2026-10-29';")
 .replace(/import \{ authError \} from '[^']+';/,'const authError=e=>e.message;')
 .replace(/import (\w+) from '[^']+';/g,'const $1=()=>null;')
 .replace(/import \{ DashboardHeading \} from '[^']+';/,'const DashboardHeading=()=>null;')
 .replace(/import '[^']+\.css';/g,'')
 .replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const {default:Page}=await import(url(code))
function render(){cursor=0;return Page()}
function nodes(n){if(!n||typeof n!=='object')return[];return[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]}
function byId(tree,id){return nodes(tree).find(n=>n.props?.id===id)}
function button(tree,text){return nodes(tree).find(n=>n.props?.children===text)}
async function flush(){for(const fn of effects.splice(0))fn();await new Promise(resolve=>setImmediate(resolve));return render()}
test('real measurement page handlers preserve canonical values across toggles, save partial profiles, retry and delete',async()=>{
 state=[];dependencies=[];effects=[];calls=[];profile=null;fail=false
 let tree=render();tree=await flush()
 const change=(id,value)=>{byId(tree,id).props.onChange({target:{value}});tree=render()}
 const selectUnit=unit=>{byId(tree,`measurement-unit-${unit}`).props.onChange();tree=render()}
 selectUnit('in');change('measurement-waist','31.5')
 for(let i=0;i<20;i++){selectUnit('cm');assert.equal(byId(tree,'measurement-waist').props.value,'80.01');selectUnit('in')}
 const submit=async()=>{await nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=await flush()}
 fail=true;await submit();assert.equal(calls[0].values.waist,80.01)
 assert.equal(byId(tree,'measurement-waist').props.value,'31.5')
 fail=false;await submit();assert.deepEqual(calls[1].values,{waist:80.01})
 selectUnit('cm');change('measurement-waist','0');await submit();assert.equal(calls.length,2,'invalid input never reaches save')
 assert.match(byId(tree,'measurement-waist').props.error,/20 to 300 cm/)
 selectUnit('in');assert.match(byId(tree,'measurement-waist').props.error,/7.874 to 118.1102 in/)
 selectUnit('cm')
 change('measurement-waist','80');change('measurement-hip','100');change('measurement-hip','');await submit();assert.deepEqual(calls[2].values,{waist:80})
 button(tree,'Delete personal profile').props.onClick();tree=await flush();assert.equal(calls.length,3,'opening confirmation does not delete')
 button(tree,'Keep profile').props.onClick();tree=await flush();assert.equal(calls.length,3,'cancelling keeps profile')
 button(tree,'Delete personal profile').props.onClick();tree=await flush()
 button(tree,'Confirm delete profile').props.onClick();tree=await flush();assert.deepEqual(calls.at(-1),{delete:'owner'})
 assert.equal(byId(tree,'measurement-waist').props.value,'')
})
