import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const drawingUrl=url(compile(read('../src/utils/designDrawing.ts')))
const {validDrawing,canClose,transformDrawingItem,drawingOutline,colourPresets}=await import(drawingUrl)
const rectangle={kind:'rectangle',mode:'canvas',colour:'#12ABef',width:4,fill:'#FEDCBA',points:[[1000,1000],[6000,6000]]}
test('v2 artwork validates custom colours, open/closed outlines, shapes, and normalized move/resize',()=>{
 assert.equal(colourPresets.length,28)
 assert.equal(validDrawing({version:2,strokes:[rectangle]}),true)
 const triangle=[[0,0],[500,0],[400,500]]
 assert.equal(canClose(triangle),true);assert.equal(canClose([[0,0],[500,500],[0,500],[500,0]]),false)
 assert.equal(canClose([[0,0],[1,1],[2,2]]),false)
 const line={colour:'#abcdef',mode:'canvas',width:3,points:triangle}
 assert.equal(validDrawing({version:2,strokes:[{...line,closed:true,fill:'#123456'}]}),true)
 assert.equal(validDrawing({version:2,strokes:[{...line,fill:'#123456'}]}),false)
 for(const bad of [{...rectangle,colour:'red'},{...rectangle,fill:'url(evil)'},{...rectangle,points:[[100,100],[100,500]]},{...rectangle,width:Infinity},{...rectangle,kind:'svg'},{...line,closed:true,points:[[0,0],[500,500],[0,500],[500,0]]}])assert.equal(validDrawing({version:2,strokes:[bad]}),false)
 const moved=transformDrawingItem(rectangle,2000,3000,2000,4000)
 assert.deepEqual(moved.points,[[2000,3000],[4000,7000]])
 assert.deepEqual(rectangle.points,[[1000,1000],[6000,6000]])
 assert.throws(()=>transformDrawingItem(rectangle,9000,0,2000,4000))
 assert.equal(drawingOutline(rectangle).length,4)
 assert.equal(drawingOutline({...rectangle,kind:'ellipse'}).length,64)
})

test('blank canvas editor draws rectangle/ellipse, closes outlines explicitly, edits colours, transforms and layer order',async()=>{
 const state=[];let cursor=0,design={design_kind:'sketch',format_version:4,name:'Sketch',garment_type:'dress',colour:'ivory',neckline:'none',sleeve:'none',length:'midi',decorations:{version:2,strokes:[]}}
 globalThis.__sketchHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}}
 const code=compile(read('../src/components/portal/DesignDrawingEditor.tsx')).replace(/import \{[^}]+\} from 'react';/,'const {useRef,useState}=globalThis.__sketchHooks;').replace(/import DesignIllustration from '[^']+';/,'const DesignIllustration=()=>null;').replace(/import ColourControl from '[^']+';/,'const ColourControl=()=>null;').replace("from '../../utils/designDrawing'",`from '${drawingUrl}'`).replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Editor}=await import(url(code)),originalPoint=globalThis.DOMPoint
 globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree;const render=()=>{cursor=0;tree=Editor({design,onChange:art=>{design={...design,decorations:art}}})}
 const find=p=>nodes(tree).find(p),byId=id=>find(n=>n.props?.id===id)
 const click=label=>{const b=find(n=>n.type==='button'&&n.props.children===label);assert.ok(b,label);assert.ok(!b.props.disabled,label);b.props.onClick();render()}
 const change=(id,value)=>{byId(id).props.onChange({target:{value}});render()}
 const target={setPointerCapture(){},querySelector:()=>({getScreenCTM:()=>({inverse:()=>({})})})}
 const event=(x,y)=>({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,currentTarget:target,preventDefault(){}})
 const canvas=()=>find(n=>n.props?.className?.startsWith?.('drawing-canvas'))
 const drag=(a,b)=>{canvas().props.onPointerDown(event(...a));canvas().props.onPointerMove(event(...b));render();canvas().props.onPointerUp(event(...b));render()}
 try{
  render();assert.equal(byId('drawing-placement'),undefined)
  assert.ok(canvas(),'blank sketch activates immediately')
  assert.equal(find(n=>n.type==='button'&&n.props.children==='Draw on design'),undefined)
  assert.equal(find(n=>n.type==='button'&&n.props.children==='Pencil').props['aria-pressed'],true)
  drag([16,24],[32,48]);assert.equal(design.decorations.strokes.length,1)
  click('Erase item');canvas().props.onPointerDown({...event(20,30),target:{closest:()=>({getAttribute:()=> '0'})}});render();assert.equal(design.decorations.strokes.length,0)
  click('Undo drawing');assert.equal(design.decorations.strokes.length,1)
  click('Redo drawing');assert.equal(design.decorations.strokes.length,0)
  click('Rectangle');drag([32,48],[160,240]);assert.equal(design.decorations.strokes[0].kind,'rectangle')
  click('Ellipse');drag([64,96],[192,288]);assert.equal(design.decorations.strokes[1].kind,'ellipse')
  change('drawing-selected','0')
  find(n=>n.props?.id==='selected-fill').props.onChange('#ab12cd');render()
  find(n=>n.props?.id==='selected-outline').props.onChange('#112233');render()
  change('selected-stroke-width','7');change('selected-x','2000');change('selected-width','3000')
  // Stroke width control is distinct from geometric width.
  assert.equal(design.decorations.strokes[0].fill,'#ab12cd')
  assert.equal(design.decorations.strokes[0].colour,'#112233')
  click('Bring forward');assert.equal(design.decorations.strokes[1].kind,'rectangle')
  click('Send backward');assert.equal(design.decorations.strokes[0].kind,'rectangle')
  click('Pencil');canvas().props.onPointerDown(event(100,100));canvas().props.onPointerMove(event(160,100));canvas().props.onPointerMove(event(140,200));canvas().props.onPointerUp(event(140,200));render()
  change('drawing-selected','2');assert.equal(design.decorations.strokes[2].fill,undefined)
  click('Close shape');assert.equal(design.decorations.strokes[2].closed,true)
  find(n=>n.props?.id==='selected-fill').props.onChange('#00ffaa');render();assert.equal(design.decorations.strokes[2].fill,'#00ffaa')
  click('Undo drawing');assert.equal(design.decorations.strokes[2].fill,null)
  click('Redo drawing');assert.equal(design.decorations.strokes[2].fill,'#00ffaa')
 }finally{globalThis.DOMPoint=originalPoint;delete globalThis.__sketchHooks}
})
