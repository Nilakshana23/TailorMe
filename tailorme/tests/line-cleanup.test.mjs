import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8')
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
const drawingUrl=url(compile(read('../src/utils/designDrawing.ts')))
const {cleanupDrawing,validDrawing}=await import(drawingUrl)
const noisy=()=>({mode:'canvas',colour:'#123abc',width:5,points:Array.from({length:80},(_,i)=>[1000+i*90,2000+i*35+(i%2?8:-8)])})
const shape={kind:'rectangle',mode:'canvas',colour:'#abcdef',fill:'#FEDCBA',width:4,points:[[100,100],[900,900]]}
const drawing=()=>({version:2,strokes:[noisy(),shape,{...noisy(),points:[[2000,5000],[2400,5000]]}]})
const px=p=>[p[0]*.032,p[1]*.048]
const distToSegment=(p,a,b)=>{p=px(p);a=px(a);b=px(b);const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)}

test('deterministic smoothing simplifies excessive points with a small renderer-space displacement bound',()=>{
 for(const strength of ['gentle','medium']){
  const original=drawing(),frozen=structuredClone(original),next=cleanupDrawing(original,{strength})
  assert.deepEqual(original,frozen,'pure function never mutates original')
  assert.deepEqual(next,cleanupDrawing(original,{strength}),'same input gives identical integer output')
  assert.ok(validDrawing(next));assert.equal(next.version,2)
  const a=original.strokes[0].points,b=next.strokes[0].points
  assert.ok(b.length<a.length/2,'dense jittered line is simplified')
  assert.deepEqual(b[0],a[0]);assert.deepEqual(b.at(-1),a.at(-1))
  for(const point of a)assert.ok(Math.min(...b.slice(1).map((end,i)=>distToSegment(point,b[i],end)))<1.15,'bounded deviation from original')
  assert.deepEqual(next.strokes[1],shape);assert.deepEqual(next.strokes[2],original.strokes[2])
  assert.deepEqual(next.strokes.map(s=>[s.colour,s.fill,s.mode,s.width]),original.strokes.map(s=>[s.colour,s.fill,s.mode,s.width]))
 }
})

test('corners, small details, near-closed gaps, crossings, shapes and explicit closures stay intact',()=>{
 const paths=[
  [[100,100],[1000,100],[2000,100],[2000,1000],[2000,2000]],
  [[1000,1000],[1010,1020],[1040,1000],[1070,1030]],
  [[100,100],[2000,100],[2000,2000],[100,2000],[110,110]],
  [[100,100],[2000,2000],[100,2000],[2000,100]],
  [[0,0],[1000,0],[1000,1000],[0,1000]],
 ]
 for(const points of paths.slice(0,4))assert.deepEqual(cleanupDrawing({version:2,strokes:[{...noisy(),points}]},{strength:'medium'}).strokes[0].points,points)
 const closed={...noisy(),closed:true,fill:'#12abcd',points:paths[4]}
 for(const s of [closed,shape,{...shape,kind:'ellipse'}])assert.deepEqual(cleanupDrawing({version:2,strokes:[s]},{strength:'medium'}).strokes[0],s)
 const original=drawing(),next=cleanupDrawing(original,{strength:'medium',indices:[0,2],width:2})
 assert.equal(next.strokes.length,3,'separate strokes remain separate in the same order')
 assert.equal(next.strokes[0].width,2);assert.equal(next.strokes[2].width,2);assert.deepEqual(next.strokes[1],original.strokes[1])
 assert.equal(next.strokes[0].closed,undefined,'does not close paths')
 assert.deepEqual(next.strokes[2].points,original.strokes[2].points,'does not join endpoints across separate strokes')
})

test('legacy v1 and maximum-size drawings remain valid without format changes; invalid options are rejected',()=>{
 const legacy={version:1,strokes:[{...noisy(),colour:'#303039'}]}
 assert.equal(cleanupDrawing(legacy,{strength:'gentle'}).version,1)
 const full={version:2,strokes:Array.from({length:16},()=>({...noisy(),points:Array.from({length:256},(_,i)=>[500+i*30,1000+i*20+(i%2?3:-3)])}))}
 assert.ok(validDrawing(full));const next=cleanupDrawing(full,{strength:'medium'});assert.ok(validDrawing(next));assert.equal(next.strokes.length,16)
 assert.deepEqual(cleanupDrawing(drawing(),{strength:'gentle',indices:[]}),drawing())
 for(const options of [{strength:'high'},{strength:'gentle',width:0},{strength:'medium',width:1.5},{strength:'gentle',width:Infinity},{strength:'gentle',indices:[-1]},{strength:'gentle',indices:[3]}])assert.throws(()=>cleanupDrawing(drawing(),options))
 assert.throws(()=>cleanupDrawing({version:2,strokes:[{...noisy(),points:[[NaN,0],[0,0]]}]},{strength:'gentle'}))
})

test('real editor preview/cancel keeps originals, Apply is one undo entry, redo restores cleaned artwork and multi-selection works',async()=>{
 const state=[];let cursor=0,changes=0,disabled=false
 let design={design_kind:'sketch',format_version:4,name:'Sketch',garment_type:'dress',colour:'ivory',neckline:'none',sleeve:'none',length:'midi',decorations:drawing()}
 globalThis.__cleanupHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}}
 const code=compile(read('../src/components/portal/DesignDrawingEditor.tsx')).replace(/import \{[^}]+\} from 'react';/,'const {useRef,useState}=globalThis.__cleanupHooks;').replace(/import DesignIllustration from '[^']+';/,'const DesignIllustration=()=>null;').replace(/import ColourControl from '[^']+';/,'const ColourControl=()=>null;').replace("from '../../utils/designDrawing'",`from '${drawingUrl}'`).replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 const {default:Editor}=await import(url(code))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree;const render=()=>{cursor=0;tree=Editor({design,disabled,onChange:decorations=>{changes++;design={...design,decorations}}})}
 const find=p=>nodes(tree).find(p),byId=id=>find(n=>n.props?.id===id)
 const click=label=>{const b=find(n=>n.type==='button'&&n.props.children===label);assert.ok(b,label);assert.ok(!b.props.disabled,label);b.props.onClick();render()}
 const change=(id,value)=>{byId(id).props.onChange({target:{value}});render()}
 try{
  render();const original=structuredClone(design.decorations)
  click('Line cleanup');assert.equal(find(n=>n.props?.className==='drawing-tools').props.disabled,true)
  change('cleanup-strength','medium')
  const previews=nodes(tree).filter(n=>n.props?.illustrationOnly&&n.props?.design?.decorations)
  assert.ok(previews.some(n=>JSON.stringify(n.props.design.decorations)===JSON.stringify(original)))
  assert.ok(previews.some(n=>n.props.design.decorations.strokes[0].points.length<80))
  assert.deepEqual(design.decorations,original);assert.equal(changes,0)
  click('Cancel line cleanup');assert.deepEqual(design.decorations,original);assert.equal(changes,0)
  click('Line cleanup');click('Apply line cleanup');const cleaned=structuredClone(design.decorations)
  assert.equal(changes,1);assert.notDeepEqual(cleaned,original)
  click('Undo drawing');assert.deepEqual(design.decorations,original)
  assert.equal(find(n=>n.props?.children==='Undo drawing').props.disabled,true,'single undo consumes entire cleanup')
  click('Redo drawing');assert.deepEqual(design.decorations,cleaned)
  change('drawing-selected','1');click('Line cleanup');assert.equal(byId('cleanup-scope').props.value,'selected')
  byId('cleanup-consistent-width').props.onChange({target:{checked:true}});render();change('cleanup-width','7')
  const choices=nodes(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox'&&!n.props.id)
  choices[2].props.onChange({target:{checked:true}});render()
  click('Apply line cleanup');assert.equal(design.decorations.strokes[1].width,7);assert.equal(design.decorations.strokes[2].width,7);assert.equal(design.decorations.strokes[0].width,5)
  assert.deepEqual(design.decorations.strokes[1].points,shape.points);assert.equal(design.decorations.strokes[1].fill,shape.fill)
  click('Line cleanup');design={...design,decorations:{...design.decorations,strokes:design.decorations.strokes.slice(1)}};render()
  assert.equal(find(n=>n.props?.children==='Apply line cleanup').props.disabled,true,'stale preview cannot overwrite newer artwork')
  click('Cancel line cleanup');click('Line cleanup');disabled=true;render();assert.equal(find(n=>n.props?.children==='Apply line cleanup').props.disabled,true)
 }finally{delete globalThis.__cleanupHooks}
})

test('cleanup has no service, upload or inference path and keeps the explicit Close shape tool',()=>{
 const utility=read('../src/utils/designDrawing.ts'),editor=read('../src/components/portal/DesignDrawingEditor.tsx')
 assert.doesNotMatch(utility,/fetch\(|XMLHttpRequest|supabase|localStorage|FileReader|FormData|analytics/)
 assert.match(editor,/>Close shape</);assert.match(editor,/>Line cleanup</)
 assert.doesNotMatch(editor,/AI garment generation|type="file"|fetch\(|XMLHttpRequest/)
})
