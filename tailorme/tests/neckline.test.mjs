import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const geometryUrl=url(compile(read('../src/utils/necklineGeometry.ts')))
const geometry=await import(geometryUrl)
const {validNeckline,customNecklinePath,drawingToNeckline,changeNecklineDepth,necklineX}=geometry
test('bounded numeric schema rejects markup, bad endpoints, sizes and unsupported geometry',()=>{
 for(const value of [null,'<svg/>',{depths:[65,80,90,80,65],html:'x'},{depths:[65,80,90,65]},{depths:[66,80,90,80,65]},{depths:[65,64,90,80,65]},{depths:[65,80,121,80,65]},{depths:[65,80,NaN,80,65]},{depths:[65,80,Infinity,80,65]},{depths:[65,80,'90',80,65]},{depths:[65,80,90.111,80,65]},{depths:Array(1000).fill(65)},{depths:[65,65,65,65,65]}]){
  assert.equal(validNeckline(value),false)
  assert.throws(()=>customNecklinePath(value),/Invalid/)
 }
 assert.equal(validNeckline({depths:[65,65,120,65,65]}),true)
})
test('drawing converts to smooth anchors; backtracking, crossings, bounds and incomplete strokes rejected',()=>{
 const drawing=[{x:143,y:65},{x:151.5,y:80},{x:160,y:100},{x:168.5,y:90},{x:177,y:65}]
 assert.deepEqual(drawingToNeckline(drawing,false),{depths:[65,80,100,90,65]})
 assert.deepEqual(drawingToNeckline(drawing,true),{depths:[65,85,100,85,65]})
 for(const points of [drawing.slice(1),drawing.slice(0,-1),[...drawing].reverse(),[drawing[0],drawing[2],drawing[1],drawing[4]],[drawing[0],{x:160,y:130},drawing[4]],[drawing[0],{x:160,y:90},{x:150,y:90},drawing[4]],Array(2049).fill(drawing[0])])assert.throws(()=>drawingToNeckline(points,false))
 const original={depths:[65,80,100,90,65]}
 assert.deepEqual(changeNecklineDepth(original,1,88,true),{depths:[65,88,100,88,65]})
 assert.deepEqual(original,{depths:[65,80,100,90,65]})
 assert.throws(()=>changeNecklineDepth(original,2,121,false))
})
test('all supported cubic segments are monotonic and bounded, so cannot self-intersect or leave the neckline region',()=>{
 for(const depths of [[65,65,120,65,65],[65,120,65,120,65],[65,80,105,90,65]]){
  assert.match(customNecklinePath({depths}),/^C/)
  for(let segment=0;segment<4;segment++){
   let lastX=-Infinity
   for(let step=0;step<=100;step++){
    const t=step/100,a=necklineX[segment],b=necklineX[segment+1]
    const x=a+(b-a)*t
    const y=depths[segment]+(depths[segment+1]-depths[segment])*(3*t*t-2*t*t*t)
    assert.ok(x>lastX&&x>=143&&x<=177&&y>=65&&y<=120)
    lastX=x
   }
  }
 }
})

// Exercise the real component's event handlers using a synchronous hook harness.
// Browser layout/pointer coordinate mapping is covered by the manual checklist.
test('editor Apply, undo/redo, symmetry, cancel and reset keep draft changes separate',async()=>{
 const state=[];let cursor=0
 globalThis.__necklineHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}}
 let source=compile(read('../src/components/portal/NecklineEditor.tsx'))
 source=source.replace(/import \{[^}]+\} from 'react';/,'const {useRef,useState}=globalThis.__necklineHooks;').replace("from '../../utils/necklineGeometry'",`from '${geometryUrl}'`).replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Editor}=await import(url(source))
 const applied=[]
 const props={design:{garment_type:'dress',neckline:'round'},onApply:value=>applied.push(value)}
 const render=()=>{cursor=0;return Editor(props)}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const find=(tree,p)=>nodes(tree).find(p)
 let tree=render()
 const click=label=>{const button=find(tree,n=>n.type==='button'&&[n.props.children].flat().join('')===label);assert.ok(button,label);assert.ok(!button.props.disabled);button.props.onClick();tree=render()}
 const depth=value=>{find(tree,n=>n.props?.id==='neckline-depth-1').props.onChange({target:{value}});tree=render()}
 try{
  click('Edit neckline');depth('94')
  assert.equal(applied.length,0)
  click('Undo');click('Redo');click('Apply neckline')
  assert.deepEqual(applied.pop(),{depths:[65,94,83,94,65]})
  click('Edit neckline');depth('100');click('Cancel');assert.equal(applied.length,0)
  click('Edit neckline');depth('999');assert.ok(find(tree,n=>n.props?.role==='alert').props.children)
  click('Apply neckline');assert.deepEqual(applied.pop(),{depths:[65,78,83,78,65]})
  click('Edit neckline');click('Reset to round preset');assert.equal(applied.pop(),null)
  // A pointer gesture records the release point as well as move samples.
  const previousPoint=globalThis.DOMPoint
  globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}}
  try{
   click('Edit neckline')
   const target={getScreenCTM:()=>({inverse:()=>({})}),setPointerCapture(){}}
   const event=(x,y)=>({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,currentTarget:target,target:{dataset:{}}})
   let canvas=find(tree,n=>n.type==='svg')
   canvas.props.onPointerDown(event(143,65))
   canvas.props.onPointerMove(event(151.5,80));tree=render()
   canvas=find(tree,n=>n.type==='svg');canvas.props.onPointerMove(event(160,100));tree=render()
   canvas=find(tree,n=>n.type==='svg');canvas.props.onPointerMove(event(168.5,80));tree=render()
   canvas=find(tree,n=>n.type==='svg');canvas.props.onPointerUp(event(177,65));tree=render()
   click('Apply neckline');assert.deepEqual(applied.pop(),{depths:[65,80,100,80,65]})
   click('Edit neckline');canvas=find(tree,n=>n.type==='svg')
   canvas.props.onPointerDown(event(143,65));canvas.props.onPointerMove(event(160,130));canvas.props.onPointerUp(event(177,65));tree=render()
   assert.match(find(tree,n=>n.props?.role==='alert').props.children,/inside the marked region/)
   click('Cancel');assert.equal(applied.length,0)
  }finally{globalThis.DOMPoint=previousPoint}
  assert.equal(Editor({...props,design:{garment_type:'skirt',neckline:'none'}}),null)
 }finally{delete globalThis.__necklineHooks}
})
