import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const compile=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const drawingUrl=url(compile(read('../src/utils/designDrawing.ts')))
const {validDrawing,emptyDrawing,addDrawingStroke}=await import(drawingUrl)
const stroke={colour:'#b08d35',width:3,points:[[4000,3000],[5000,3500],[6000,3000]]}
test('versioned bounded numeric drawing schema rejects markup, invalid colours/widths/counts and coordinates',()=>{
 assert.equal(validDrawing(emptyDrawing()),true)
 assert.equal(validDrawing({version:1,strokes:[stroke]}),true)
 for(const mode of ['garment','canvas'])assert.equal(validDrawing({version:1,strokes:[{...stroke,mode}]}),true)
 for(const mode of [null,0,'svg','',{},undefined])assert.equal(validDrawing({version:1,strokes:[{...stroke,mode}]}),false)
 const invalid=[null,'<svg/>',{version:3,strokes:[]},{version:1,strokes:[],svg:'x'},{version:1,strokes:Array(33).fill(stroke)},{version:1,strokes:Array(17).fill({...stroke,points:Array(256).fill([0,0])})}]
 for(const patch of [{colour:'url(evil)'},{colour:'#ffffff'},{width:13},{width:0},{width:1.1},{width:'2'},{points:[[0,0]]},{points:[[0,0,0],[10,10]]},{points:[[-1,0],[0,0]]},{points:[[0,10001],[0,0]]},{points:[[0,0.5],[0,0]]},{points:[[0,'0'],[0,0]]},{points:[[NaN,0],[0,0]]},{points:Array(257).fill([0,0])},{svg:'<path/>'}])invalid.push({version:1,strokes:[{...stroke,...patch}]})
 for(const value of invalid)assert.equal(validDrawing(value),false)
 assert.equal(validDrawing({version:1,strokes:Array(16).fill({...stroke,points:Array(256).fill([10000,10000])})}),true)
 const original=emptyDrawing(),next=addDrawingStroke(original,stroke)
 assert.equal(original.strokes.length,0);assert.equal(next.strokes.length,1)
 assert.throws(()=>addDrawingStroke({version:1,strokes:Array(32).fill(stroke)},stroke),/limit/)
})

test('real editor handlers normalize drawing, separate pen/select/pan, support history and confirm clearing',async()=>{
 const states=[];let cursor=0,design={name:'Decorated dress',garment_type:'dress',colour:'ruby',neckline:'round',sleeve:'long',length:'midi'}
 globalThis.__drawingHooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value}]},useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i]}}
 const code=compile(read('../src/components/portal/DesignDrawingEditor.tsx')).replace(/import \{[^}]+\} from 'react';/,'const {useRef,useState}=globalThis.__drawingHooks;').replace(/import DesignIllustration from '[^']+';/,'const DesignIllustration=()=>null;').replace(/import ColourControl from '[^']+';/,'const ColourControl=()=>null;').replace("from '../../utils/designDrawing'",`from '${drawingUrl}'`).replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Editor}=await import(url(code))
 const previousPoint=globalThis.DOMPoint
 globalThis.DOMPoint=class {constructor(x,y){this.x=x;this.y=y}matrixTransform(m){return {x:this.x*(m.a??1)+this.y*(m.c??0)+(m.e??0),y:this.x*(m.b??0)+this.y*(m.d??1)+(m.f??0)}}}
 function nodes(n){return !n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]}
 const find=(tree,p)=>nodes(tree).find(p)
 const render=()=>{cursor=0;return Editor({design,onChange:decorations=>{design={...design,decorations}}})}
 let tree=render()
 const click=label=>{const button=find(tree,n=>n.type==='button'&&n.props.children===label);assert.ok(button,label);assert.ok(!button.props.disabled);button.props.onClick();tree=render()}
 const change=(id,value)=>{find(tree,n=>n.props?.id===id).props.onChange({target:{value}});tree=render()}
 let inverse={}
 const target={querySelector:()=>({getScreenCTM:()=>({inverse:()=>inverse})}),setPointerCapture(){}}
 const event=(x,y)=>({isPrimary:true,button:0,pointerId:1,clientX:x,clientY:y,currentTarget:target,target:{closest:()=>null},preventDefault(){}})
 const canvas=()=>find(tree,n=>n.props?.className?.startsWith?.('drawing-canvas'))
 try{
  click('Draw on design');change('drawing-colour','#a8324a');change('drawing-width','5')
  assert.equal(find(tree,n=>n.props?.id==='drawing-placement').props.value,'canvas')
  canvas().props.onPointerDown(event(120,120));canvas().props.onPointerMove(event(160,180));tree=render();canvas().props.onPointerUp(event(200,240));tree=render()
  assert.equal(design.decorations.strokes.length,1)
  assert.deepEqual(design.decorations.strokes[0],{mode:'canvas',colour:'#a8324a',width:5,points:[[3750,2500],[5000,3750],[6250,5000]]})
  assert.equal(design.neckline,'round');assert.equal(design.garment_type,'dress')
  const first=structuredClone(design.decorations)
  click('Undo drawing');assert.equal(design.decorations.strokes.length,0)
  click('Redo drawing');assert.deepEqual(design.decorations,first)
  click('Zoom/Pan');canvas().props.onPointerDown(event(50,50));canvas().props.onPointerMove(event(90,110));canvas().props.onPointerUp(event(90,110));tree=render()
  assert.deepEqual(design.decorations,first);assert.equal(find(tree,n=>n.props?.id==='drawing-pan-x').props.value,40)
  change('drawing-zoom','2');assert.equal(find(tree,n=>n.props?.id==='drawing-zoom').props.value,2)
  click('Pencil');canvas().props.onPointerDown(event(100,100));canvas().props.onPointerMove(event(150,150));canvas().props.onPointerCancel();tree=render();assert.deepEqual(design.decorations,first)
  click('Select artwork');change('drawing-selected','0');click('Delete selected item');assert.equal(design.decorations.strokes.length,0)
  click('Undo drawing');click('Clear drawings');assert.equal(design.decorations.strokes.length,1)
  click('Keep drawings');assert.equal(design.decorations.strokes.length,1)
  click('Clear drawings');click('Confirm clear drawings');assert.equal(design.decorations.strokes.length,0)
  click('Undo drawing');assert.deepEqual(design.decorations,first)
  click('Reset drawing view');assert.equal(find(tree,n=>n.props?.id==='drawing-zoom').props.value,1)
  change('drawing-placement','garment');click('Pencil');change('drawing-zoom','2')
  inverse={a:0.5,d:0.5,e:-20,f:-30}
  canvas().props.onPointerDown(event(280,300));canvas().props.onPointerMove(event(360,420));canvas().props.onPointerUp(event(440,540));tree=render()
  assert.deepEqual(design.decorations.strokes[1],{...first.strokes[0],mode:'garment'})
  inverse={a:2,d:2,e:-20,f:-40}
  change('drawing-placement','canvas')
  canvas().props.onPointerDown(event(70,80));canvas().props.onPointerMove(event(90,110));canvas().props.onPointerUp(event(110,140));tree=render()
  assert.deepEqual(design.decorations.strokes[2],first.strokes[0],'resized SVG maps to identical normalized coordinates')
  click('Undo drawing');assert.equal(design.decorations.strokes[1].mode,'garment')
  click('Redo drawing');assert.equal(design.decorations.strokes[2].mode,'canvas')
  const css=read('../src/pages/Designer.css')
  assert.match(css,/\.drawing-tool-pen \.drawing-view,\.drawing-tool-pan \.drawing-view\s*\{ pointer-events:none;/)
 }finally{globalThis.DOMPoint=previousPoint;delete globalThis.__drawingHooks}
})

test('drawing editor and numeric schema have no photo, transport or persistence path',()=>{
 const source=read('../src/components/portal/DesignDrawingEditor.tsx')+read('../src/utils/designDrawing.ts')
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|FormData|FileReader|PhotoStylingPreview|dangerouslySetInnerHTML/)
 const photo=read('../src/components/portal/PhotoStylingPreview.tsx')
 assert.doesNotMatch(photo,/onChange.*decorations|save_customer_design/)
})
