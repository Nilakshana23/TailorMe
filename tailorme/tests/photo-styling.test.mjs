import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../src/components/portal/PhotoStylingPreview.tsx',import.meta.url),'utf8')
let states=[],cursor=0,cleanup,dependency
const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i]},useEffect(effect,deps){if(dependency!==deps[0]){cleanup?.();cleanup=effect();dependency=deps[0]}}}
globalThis.__photoHooks=hooks
let code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
const alignmentSource=readFileSync(new URL('../src/utils/stylingAlignment.ts',import.meta.url),'utf8')
const alignmentCode=ts.transpileModule(alignmentSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const alignmentUrl=`data:text/javascript;base64,${Buffer.from(alignmentCode).toString('base64')}`
code=code.replace("from '../../utils/stylingAlignment'",`from '${alignmentUrl}'`)
const neckCode=ts.transpileModule(readFileSync(new URL('../src/utils/necklineGeometry.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const neckUrl=`data:text/javascript;base64,${Buffer.from(neckCode).toString('base64')}`
const shapeCode=ts.transpileModule(readFileSync(new URL('../src/utils/previewShape.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './necklineGeometry'",`from '${neckUrl}'`).replace("from './stylingAlignment'",`from '${alignmentUrl}'`)
const shapeUrl=`data:text/javascript;base64,${Buffer.from(shapeCode).toString('base64')}`
const shapeTools=await import(shapeUrl)
code=code.replace("from '../../utils/previewShape'",`from '${shapeUrl}'`)
const buttonCode=ts.transpileModule(readFileSync(new URL('../src/components/ui/FormButton.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText.replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
code=code.replace("from '../ui/FormButton'",`from 'data:text/javascript;base64,${Buffer.from(buttonCode).toString('base64')}'`)
code=code.replace(/import \{[^}]+\} from 'react';/,'const {useState,useRef,useEffect}=globalThis.__photoHooks;').replace(/import DesignIllustration from '[^']+';/,'const DesignIllustration=()=>null;').replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const {default:Preview}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
function render(design={colour:'ruby',garment_type:'dress',length:'midi'}){cursor=0;return Preview({design})}
function nodes(node){if(!node||typeof node!=='object')return [];if(typeof node.type==='function')return [node,...nodes(node.type(node.props))];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
const find=(tree,p)=>nodes(tree).find(p)
const byId=(tree,id)=>find(tree,n=>n.props?.id===id)
test('photo validation, accessible adjustments, pointer interaction and URL lifecycle',()=>{
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,revoked=[],created=[]
 URL.createObjectURL=file=>{created.push(file);return `blob:local-${created.length}`}
 URL.revokeObjectURL=url=>revoked.push(url)
 try{
  let tree=render()
  assert.equal(find(tree,n=>n.props?.className==='photo-stage'),undefined)
  const select=file=>{byId(tree,'styling-photo').props.onChange({target:{files:[file],value:'fake'}});tree=render()}
  select({type:'image/svg+xml',size:100});assert.match(states[1],/JPEG/);assert.equal(created.length,0)
  select({type:'image/png',size:5242881});assert.match(states[1],/5 MB/)
  select({type:'image/png',size:0});assert.match(states[1],/non-empty/)
  select({name:'My photo.png',type:'image/png',size:5242880});assert.equal(created.length,1)
  assert.equal(byId(tree,'styling-photo').props.tabIndex,-1)
  assert.equal(find(tree,n=>n.type==='button'&&n.props.id==='styling-photo-choose').props.type,'button')
  assert.ok(find(tree,n=>n.props?.role==='status'&&n.props.children?.includes?.('My photo.png')))
  assert.ok(find(tree,n=>n.type==='button'&&n.props.children?.includes?.('Change photo')))
  for(const [key,value] of Object.entries({x:20,y:30,scale:150,rotation:45,opacity:40})){
   const control=byId(tree,`photo-${key}`)
   assert.ok(find(tree,n=>n.type==='label'&&n.props.htmlFor===control.props.id))
   control.props.onChange({target:{value:String(value)}})
  }
  tree=render();assert.deepEqual(states[2],{x:20,y:30,scale:150,rotation:45,opacity:40})
  const stage=find(tree,n=>n.props?.className==='photo-stage'),target={setPointerCapture(){},getBoundingClientRect(){return {width:200,height:400}}}
  stage.props.onPointerDown({isPrimary:true,button:0,pointerId:1,clientX:0,clientY:0,currentTarget:target})
  stage.props.onPointerMove({pointerId:1,clientX:40,clientY:40,currentTarget:target})
  assert.equal(states[2].x,40);assert.equal(states[2].y,40)
  stage.props.onPointerCancel();stage.props.onPointerMove({pointerId:1,clientX:100,clientY:100,currentTarget:target});assert.equal(states[2].x,40)
  find(tree,n=>n.props?.children==='Reset illustration').props.onClick();assert.equal(states[2].scale,100)
  select({type:'image/webp',size:100});assert.deepEqual(revoked,['blob:local-1'])
  find(tree,n=>n.props?.children==='Remove photo').props.onClick();tree=render();assert.equal(revoked.length,2)
  select({type:'image/jpeg',size:100});find(tree,n=>n.type==='img').props.onError();tree=render();assert.match(states[1],/could not be read/);assert.equal(revoked.length,3)
  select({type:'image/png',size:100});cleanup();assert.equal(revoked.length,4)
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;delete globalThis.__photoHooks}
})
test('preview has no transport/storage and design save keeps an explicit garment-only payload',()=>{
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|analytics|toDataURL|FormData|FileReader/)
 const service=readFileSync(new URL('../src/services/designService.ts',import.meta.url),'utf8')
 assert.doesNotMatch(service,/photo|blob|opacity|rotation/)
 assert.match(service,/const payload=\{name:fields.name,garment_type:fields.garment_type,colour:fields.colour,neckline:fields.neckline,sleeve:fields.sleeve,length:fields.length,/)
 assert.match(service,/p_fields:payload/)
 assert.match(source,/This is not AI try-on/)
 assert.match(source,/Guided styling preview/)
 assert.match(source,/Approximate illustration, not a prediction of garment fit./)
})

test('guided keyboard marking, touch handles, undo/reset, measurements and photo replacement stay local',()=>{
 states=[];cursor=0;cleanup=undefined;dependency=undefined
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
 const revoked=[];let count=0
 URL.createObjectURL=()=>`blob:guided-${++count}`;URL.revokeObjectURL=value=>revoked.push(value)
 try{
  let design={colour:'ruby',garment_type:'dress',length:'midi'},tree=render(design)
  const redraw=()=>{tree=render(design)}
  const click=label=>{const button=find(tree,n=>n.type==='button'&&n.props.children===label);assert.ok(button,label);assert.ok(!button.props.disabled);button.props.onClick();redraw()}
  const change=(id,value)=>{byId(tree,id).props.onChange({target:{value}});redraw()}
  const select=()=>{byId(tree,'styling-photo').props.onChange({target:{files:[{type:'image/png',size:100}],value:'fake'}});redraw()}
  const overlay=()=>find(tree,n=>n.props?.illustrationOnly)
  const handle=key=>find(tree,n=>n.props?.['data-landmark']===key)
  const mark=(x,y)=>{change('alignment-x',String(x));change('alignment-y',String(y));click('Mark at current controls')}
  select();click('Align garment to photo')
  for(const [x,y] of [[35,15],[65,15],[40,40],[60,40],[32,55],[68,55],[50,90]])mark(x,y)
  assert.ok(overlay().props.previewWarp)
  assert.equal(nodes(tree).filter(n=>n.props?.['data-landmark']).length,7)
  const originalWarp=structuredClone(overlay().props.previewWarp)
  let stage=find(tree,n=>n.props?.className==='photo-stage')
  const target={setPointerCapture(){},getBoundingClientRect(){return {width:1000,height:1000,left:0,top:0}}}
  const event=(x,y)=>({isPrimary:true,button:0,pointerId:10,clientX:x,clientY:y,currentTarget:target,target:{closest:()=>({dataset:{landmark:'leftWaist'}})}})
  stage.props.onPointerDown(event(400,400));redraw()
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerMove(event(420,420));redraw()
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerUp(event(420,420));redraw()
  assert.equal(handle('leftWaist').props.style.left,'42%')
  click('Undo alignment');assert.equal(handle('leftWaist').props.style.left,'40%')
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerDown(event(400,400));stage.props.onPointerMove(event(700,800));stage.props.onPointerCancel();redraw()
  assert.equal(handle('leftWaist').props.style.left,'40%');assert.ok(byId(tree,'photo-error').props.children)
  change('preview-measure-shoulder','40');change('preview-measure-length','80');change('preview-measure-waist','300')
  assert.deepEqual(overlay().props.previewWarp,originalWarp,'circumference/length inputs do not silently change alignment')
  change('preview-unit','in');assert.ok(Math.abs(Number(byId(tree,'preview-measure-shoulder').props.value)-40/2.54)<1e-6)
  click('Estimate hem from shoulder width and garment length');assert.equal(handle('hem').props.style.top,'75%')
  click('Undo alignment');assert.equal(handle('hem').props.style.top,'90%')
  click('Reset alignment');assert.equal(overlay().props.previewWarp,null)
  click('Undo alignment');assert.ok(overlay().props.previewWarp)
  design={...design,garment_type:'skirt'};redraw();assert.equal(overlay().props.previewWarp,null)
  click('Align garment to photo')
  assert.equal(nodes(tree).filter(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes('Photo-left shoulder')).length,0)
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Estimate hem from shoulder width and garment length'),undefined)
  select();assert.equal(overlay().props.previewWarp,null);assert.equal(byId(tree,'preview-measure-waist').props.value,'');assert.deepEqual(revoked,['blob:guided-1'])
  click('Remove photo');assert.equal(find(tree,n=>n.props?.illustrationOnly),undefined);assert.deepEqual(revoked,['blob:guided-1','blob:guided-2'])
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke}
})

test('shape mode isolates whole-garment transforms and supports sliders, independent sleeves, symmetry, history and captured touch drag',()=>{
 states=[];cursor=0;cleanup=undefined;dependency=undefined
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,previousPoint=globalThis.DOMPoint
 URL.createObjectURL=()=>'blob:shape';URL.revokeObjectURL=()=>{}
 globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}}
 try{
  let design={colour:'ruby',garment_type:'dress',sleeve:'long',neckline:'v',length:'midi',format_version:2,custom_neckline:{depths:[65,80,108,90,65]}},tree=render(design)
  const redraw=()=>{tree=render(design)}
  const click=label=>{const button=find(tree,n=>n.type==='button'&&n.props.children===label);assert.ok(button,label);assert.ok(!button.props.disabled);button.props.onClick();redraw()}
  const change=(id,value)=>{byId(tree,id).props.onChange({target:{value}});redraw()}
  const select=()=>{byId(tree,'styling-photo').props.onChange({target:{files:[{name:'local.png',type:'image/png',size:100}],value:''}});redraw()}
  const overlay=()=>find(tree,n=>n.props?.illustrationOnly)
  select();change('photo-scale','140');change('photo-rotation','25')
  click('Adjust garment shape')
  assert.equal(nodes(tree).filter(n=>n.props?.['data-shape']).length,10)
  assert.equal(byId(tree,'photo-x').props.disabled,true);assert.equal(byId(tree,'photo-scale').props.disabled,true);assert.equal(byId(tree,'photo-opacity').props.disabled,false)
  change('shape-left-sleeveWidth','48')
  assert.equal(overlay().props.previewShape.left.sleeveWidth,48);assert.equal(overlay().props.previewShape.right.sleeveWidth,48)
  click('Undo shape');assert.equal(overlay().props.previewShape,null)
  click('Redo shape');assert.equal(overlay().props.previewShape.right.sleeveWidth,48)
  find(tree,n=>n.type==='input'&&n.props.type==='checkbox'&&n.props.checked===true).props.onChange({target:{checked:false}});redraw()
  change('shape-right-sleeveLength','200');assert.equal(overlay().props.previewShape.right.sleeveLength,200);assert.equal(overlay().props.previewShape.left.sleeveLength,180)
  change('shape-left-waist','45');change('shape-hemY','420')
  assert.equal(overlay().props.previewShape.left.waist,45);assert.equal(overlay().props.previewShape.right.waist,30)
  const before=structuredClone(overlay().props.previewShape),transforms=structuredClone(states[2])
  let captured=0,prevented=0
  const target={setPointerCapture(){captured++},querySelector:()=>({getScreenCTM:()=>({inverse:()=>({})})})}
  const event=(x,y,key='left.sleeve')=>({isPrimary:true,button:0,pointerId:8,clientX:x,clientY:y,currentTarget:target,target:{closest:()=>key?{dataset:{shape:key}}:null},preventDefault(){prevented++}})
  const handle=shapeTools.shapeHandles(before,design).find(h=>h.key==='left.sleeve').point
  let stage=find(tree,n=>n.props?.className==='photo-stage')
  stage.props.onPointerDown(event(handle.x,handle.y));redraw()
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerMove(event(handle.x-2,handle.y+10));redraw()
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerUp(event(handle.x-2,handle.y+10));redraw()
  assert.equal(captured,1);assert.equal(prevented,1)
  assert.equal(overlay().props.previewShape.left.sleeveWidth,52);assert.equal(overlay().props.previewShape.left.sleeveLength,190)
  assert.equal(overlay().props.previewShape.right.sleeveLength,200)
  assert.deepEqual(states[2],transforms)
  click('Undo shape');assert.deepEqual(overlay().props.previewShape,before)
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerDown(event(handle.x,handle.y));stage.props.onPointerMove(event(-100,900));stage.props.onPointerCancel();redraw()
  assert.deepEqual(overlay().props.previewShape,before);assert.ok(byId(tree,'photo-error').props.children)
  stage=find(tree,n=>n.props?.className==='photo-stage');stage.props.onPointerDown(event(50,50,null));stage.props.onPointerMove(event(100,100,null));stage.props.onPointerUp(event(100,100,null));redraw()
  assert.deepEqual(states[2],transforms,'background drag does not move garment in shape mode')
  click('Reset shape');assert.equal(overlay().props.previewShape,null)
  click('Undo shape');assert.deepEqual(overlay().props.previewShape,before)
  click('Finish adjusting shape');assert.equal(byId(tree,'photo-x').props.disabled,false);assert.equal(byId(tree,'photo-scale').props.value,140)
  assert.deepEqual(overlay().props.design,design)
  design={...design,garment_type:'skirt',neckline:'none',sleeve:'none',custom_neckline:null};redraw();click('Adjust garment shape')
  assert.equal(nodes(tree).filter(n=>n.props?.['data-shape']).length,4);assert.equal(byId(tree,'shape-left-sleeveWidth'),undefined)
  select();assert.equal(overlay().props.previewShape,null);assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Adjust garment shape'))
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;globalThis.DOMPoint=previousPoint}
})

test('trousers preview offers only waist, hip and leg-hem alignment, with no neckline/sleeve/torso shape editing',()=>{
 states=[];cursor=0;cleanup=undefined;dependency=undefined
 const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL
 URL.createObjectURL=()=>'blob:trousers';URL.revokeObjectURL=()=>{}
 try{
  const design={garment_type:'trousers',colour:'navy',length:'midi',neckline:'none',sleeve:'none',format_version:3,garment_options:{waist_style:'elastic',leg_style:'wide'}}
  let tree=render(design)
  byId(tree,'styling-photo').props.onChange({target:{files:[{name:'local.png',type:'image/png',size:100}],value:''}});tree=render(design)
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Adjust garment shape'),undefined)
  find(tree,n=>n.type==='button'&&n.props.children==='Align garment to photo').props.onClick();tree=render(design)
  assert.match(find(tree,n=>n.props?.className==='alignment-steps').props.children.map(n=>n.props.children.flat().join('')).join(' '),/Photo-left outer leg hem/)
  assert.doesNotMatch(find(tree,n=>n.props?.className==='alignment-steps').props.children.map(n=>n.props.children.flat().join('')).join(' '),/shoulder/)
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Estimate hem from shoulder width and garment length'),undefined)
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke}
})
