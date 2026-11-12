import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import ts from 'typescript'
import React from 'react'
import {renderToString} from 'react-dom/server'
const cache=new Map(),dataUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`
function moduleUrl(file){
 if(cache.has(file.href))return cache.get(file.href)
 let s=file.pathname.endsWith('/lib/supabase.ts')?'export let supabase=null;export const configurationError=null;export const authRedirect={present:true,error:null};export function setSupabase(s){supabase=s}':ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 s=s.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
  if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
  const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(p=>existsSync(p))
  return `from '${moduleUrl(child)}'`
 })
 const result=dataUrl(s);cache.set(file.href,result);return result
}
const load=p=>import(moduleUrl(new URL(p,import.meta.url)))
const geometry=await load('../src/utils/garmentRefinement.ts'),model=await load('../src/services/designService.ts'),shapes=await load('../src/utils/previewShape.ts')
const {default:Illustration}=await load('../src/components/portal/DesignIllustration.tsx')
const collars=await load('../src/utils/collars.ts')
const source={...model.defaultSketch,id:'b3000000-0000-4000-8000-000000000001',owner_id:'customer',version:1,attached_at:null,name:'Buttoned sketch',decorations:{version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#303039',width:3,points:[[2000,1000],[8000,9000]]},{mode:'canvas',colour:'#ff0000',width:2,points:[[0,0],[10000,10000]]}]}}

test('only selected outline bounding box sets deterministic bounded proportions; decorations and original stay intact',()=>{
 const original=structuredClone(source),g=geometry.initialRefinementGeometry(source.decorations,[0])
 assert.deepEqual(g,geometry.initialRefinementGeometry(source.decorations,[0]))
 assert.deepEqual(geometry.outlineBounds(source.decorations,[0]),{x:64,y:48,width:192,height:384})
 assert.notDeepEqual(g,geometry.initialRefinementGeometry(source.decorations,[1]))
 assert.deepEqual(source,original)
 for(const indices of [[],[9],[-1],[0,0],[NaN]])assert.throws(()=>geometry.initialRefinementGeometry(source.decorations,indices))
 for(const invalid of [null,{}, {...g,shoulder:NaN},{...g,hem:Infinity},{...g,waist:21},{...g,photo:'no'}])assert.equal(geometry.validRefinementGeometry(invalid),false)
})

test('all seven existing templates render editable bounded refinement and custom necklines without photo geometry',()=>{
 const keys=Object.keys(geometry.refinementLimits)
 for(const type of Object.keys(model.garmentLabels))for(let mask=0;mask<128;mask++){
  const g=Object.fromEntries(keys.map((key,i)=>[key,geometry.refinementLimits[key][(mask>>i)&1]]))
  const fields={...model.switchGarment({...model.defaultDesign,design_kind:'garment'},type),refinement_geometry:g}
  assert.equal(model.validateDesignOptions(fields),'')
  const shape=geometry.refinementShape(fields,g)
  if(type!=='trousers')assert.equal(shapes.validatePreviewShape(shape,fields),'',`${type} ${mask}`)
  const paths=shapes.shapedGarmentPaths(fields,shape)
  assert.doesNotMatch(paths.body,/NaN|Infinity/)
  assert.ok(shapes.simpleOutline((awaitPoints(paths.body))),`${type} ${mask}`)
 }
 const fields={...model.switchGarment({...model.defaultDesign,design_kind:'garment'},'dress'),refinement_geometry:geometry.initialRefinementGeometry(source.decorations,[0]),custom_neckline:{depths:[65,80,100,80,65]}}
 const html=renderToString(React.createElement(Illustration,{design:fields}))
 assert.match(html,/<svg/);assert.match(html,/custom neckline/);assert.doesNotMatch(html,/<image|foreignObject|NaN/)
})
// Sample curves with the same bounded renderer path sampler used by existing checks.
const alignment=await load('../src/utils/stylingAlignment.ts')
function awaitPoints(path){const n=alignment.sampleIllustrationPath(path).match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);const p=[];for(let i=0;i<n.length;i+=2){const point={x:n[i],y:n[i+1]};if(!p.length||Math.hypot(point.x-p.at(-1).x,point.y-p.at(-1).y)>1e-7)p.push(point)}if(p.length>1&&Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y)<1e-7)p.pop();return p}

test('real guided workflow keeps preview private until confirmation and retries the same new-design submission',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts'),states=[];let cursor=0,created=null,calls=[],fail=true
 globalThis.__refineHooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i]}}
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/SketchRefinement.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
 code=code.replace(/import \{ useRef, useState \} from 'react';/,'const {useRef,useState}=globalThis.__refineHooks;').replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
  if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
  const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,new URL('../src/components/portal/SketchRefinement.tsx',import.meta.url))).find(p=>existsSync(p))
  return `from '${moduleUrl(child)}'`
 })
 const {default:Workflow}=await import(dataUrl(code))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree;const draw=()=>{cursor=0;tree=Workflow({source,disabled:false,onCreated:d=>{created=d}})}
 const byId=id=>nodes(tree).find(n=>n.props?.id===id),button=text=>nodes(tree).find(n=>n.props?.children===text)
 const click=async text=>{const b=button(text);assert.ok(b);assert.ok(!b.props.disabled);b.props.onClick();await new Promise(setImmediate);draw()}
 setSupabase({rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});return fail?{error:{message:'Lost response'}}:{data:{id:args.p_id,...args.p_fields},error:null}}})
 try{
  draw();await click('Start template-based refinement')
  assert.equal(button('Confirm and save new garment').props.disabled,true)
  nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox'&&!n.props.id).props.onChange({target:{checked:true}});draw()
  await click('Use selected outline proportions');assert.equal(calls.length,0)
  assert.equal(button('Confirm and save new garment').props.disabled,true)
  byId('refinement-confirm').props.onChange({target:{checked:true}});draw()
  await click('Confirm and save new garment');assert.equal(calls.length,1);assert.equal(created,null)
  fail=false;await click('Retry saving this refinement');assert.deepEqual(calls[0],calls[1])
  assert.equal(calls[0].name,'create_refined_design');assert.equal(calls[0].args.p_confirm,true);assert.deepEqual(calls[0].args.p_outline_indices,[0])
  assert.notEqual(created.id,source.id);assert.equal(source.decorations.strokes.length,2)
  assert.equal(calls[0].args.p_fields.decorations.strokes.length,0,'decorations remain in original reference rather than interpreted as silhouette')
 }finally{setSupabase(null);delete globalThis.__refineHooks}
})
// The tests below exercise the real shared renderer and transport used above.
test('all four collar choices render shared bounded geometry, colours and warped styling paths',()=>{
 const warp={rows:[{sourceY:0,sourceHalfWidth:160,left:{x:0,y:0},right:{x:100,y:0}},{sourceY:480,sourceHalfWidth:160,left:{x:0,y:100},right:{x:100,y:100}}]}
 const signatures=new Set()
 for(const style of Object.keys(collars.collarLabels)){
  signatures.add(collars.collarPaths(style).join('|'))
  for(const type of ['dress','blouse','shirt','kurti','salwar_top'])for(const shade of [null,'#12ABef']){
   if(style==='none'&&shade)continue
   const fields={...model.switchGarment({...model.defaultDesign,design_kind:'garment'},type),collar_style:style,collar_colour:shade}
   assert.equal(model.validateDesignOptions(fields),'')
   const html=renderToString(React.createElement(Illustration,{design:fields,illustrationOnly:true}))
   const photo=renderToString(React.createElement(Illustration,{design:fields,illustrationOnly:true,previewWarp:warp}))
   assert.doesNotMatch(html+photo,/NaN|Infinity|Unsupported|<image|foreignObject/)
   if(style==='none')assert.doesNotMatch(html,/data-collar-style/)
   else{
    assert.ok(html.includes(`data-collar-style="${style}" fill="${shade??model.designColours[fields.colour]}"`))
    for(const path of collars.collarPaths(style)){
     assert.ok(html.includes(`d="${path}"`));assert.ok(photo.includes(`d="${alignment.warpIllustrationPath(path,warp)}"`))
     assert.ok(shapes.simpleOutline(awaitPoints(path)),style)
    }
   }
  }
 }
 assert.equal(signatures.size,4,'each choice has actual distinct geometry')
 const legacy={...model.defaultDesign,format_version:3,garment_type:'shirt',sleeve:'long',garment_options:{collar:'point'}}
 assert.equal(collars.effectiveCollar(legacy),'shirt')
 const oldSvg=renderToString(React.createElement(Illustration,{design:legacy}))
 assert.match(oldSvg,/M143 65 L160 85 L150 102 L135 75Z/)
 assert.doesNotMatch(oldSvg,/data-collar-style/)
 assert.equal(collars.effectiveCollar(model.defaultDesign),'none')
 for(const type of ['skirt','trousers'])assert.ok(model.validateDesignOptions({...model.switchGarment(model.defaultDesign,type),collar_style:'stand'}))
 for(const neckline of ['v','square'])assert.ok(model.validateDesignOptions({...model.defaultDesign,neckline,collar_style:'shirt'}))
 assert.ok(model.validateDesignOptions({...model.defaultDesign,collar_style:'peter_pan',custom_neckline:{depths:[65,80,100,80,65]}}))
 for(const colour of ['red','url(evil)','#123',3])assert.ok(model.validateDesignOptions({...model.defaultDesign,collar_style:'stand',collar_colour:colour}))
})

test('collar save/reopen and refinement payloads retain style/colour; snapshots remain exact rendered copies',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts');let row,snapshot,call
 const fields={...model.switchGarment(model.defaultDesign,'blouse'),collar_style:'peter_pan',collar_colour:'#ab12cd',decorations:source.decorations}
 setSupabase({rpc:async(name,args)=>{call={name,args};row={id:args.p_id,version:1,owner_id:'customer',...structuredClone(args.p_fields)};return{data:row}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?row:snapshot)})})})})})
 try{
  await model.designService.save('c2000000-0000-4000-8000-000000000001',fields,null)
  assert.equal(call.args.p_fields.collar_style,'peter_pan');assert.equal(call.args.p_fields.collar_colour,'#ab12cd')
  const reopened=await model.designService.get(row.id);assert.equal(reopened.collar_style,'peter_pan')
  snapshot=structuredClone(reopened);row.collar_colour='#000000'
  const saved=await model.designService.snapshot('request-id')
  assert.equal(saved.collar_colour,'#ab12cd')
  assert.equal(renderToString(React.createElement(Illustration,{design:reopened})).replace(/_R_\w+_/g,''),renderToString(React.createElement(Illustration,{design:saved})).replace(/_R_\w+_/g,''))
  await model.designService.refine('new-id',source,{...fields,refinement_geometry:geometry.initialRefinementGeometry(source.decorations,[0])},[0],true)
  assert.equal(call.name,'create_refined_design');assert.equal(call.args.p_fields.collar_style,'peter_pan');assert.equal(call.args.p_fields.collar_colour,'#ab12cd')
 }finally{setSupabase(null)}
})

test('incompatible collar application waits for explicit confirmation; None restores custom editing and legacy colour works',async()=>{
 let cursor=0;const states=[];let fields={...model.switchGarment(model.defaultDesign,'blouse'),neckline:'v',custom_neckline:{depths:[65,80,100,80,65]}},changes=0
 globalThis.__collarHooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v}]}}
 let code=ts.transpileModule(readFileSync(new URL('../src/components/portal/CollarControls.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText
 code=code.replace(/import \{ useState \} from 'react';/,'const {useState}=globalThis.__collarHooks;').replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
  if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
  const child=['','.ts','.tsx'].map(ext=>new URL(specifier+ext,new URL('../src/components/portal/CollarControls.tsx',import.meta.url))).find(p=>existsSync(p));return `from '${moduleUrl(child)}'`
 })
 const {default:Controls}=await import(dataUrl(code))
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree;const draw=()=>{cursor=0;tree=Controls({fields,disabled:false,onChange:next=>{fields=next;changes++}})}
 const find=p=>nodes(tree).find(p),choose=style=>{find(n=>n.props?.id==='design-collar').props.onChange({target:{value:style}});draw()}
 try{
  draw();const original=structuredClone(fields);choose('shirt');assert.deepEqual(fields,original);assert.equal(changes,0)
  find(n=>n.props?.children==='Keep current neckline').props.onClick();draw();assert.deepEqual(fields,original)
  choose('stand');find(n=>n.props?.children==='Use round neckline and apply collar').props.onClick();draw()
  assert.equal(fields.collar_style,'stand');assert.equal(fields.neckline,'round');assert.equal(fields.custom_neckline,null)
  choose('none');assert.equal(fields.collar_style,'none');assert.equal(fields.collar_colour,null)
  fields={...model.defaultDesign,garment_type:'shirt',format_version:3,sleeve:'long',garment_options:{collar:'band'}};draw()
  find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});draw()
  assert.equal(fields.collar_style,'stand');assert.equal(fields.garment_options.collar,'none');assert.equal(model.validateDesignOptions(fields),'')
  assert.equal(fields.collar_colour,model.designColours[fields.colour])
  fields=model.switchGarment(fields,'trousers');draw();assert.equal(tree,null,'collar control hidden for bottoms')
 }finally{delete globalThis.__collarHooks}
})

test('Straight/A-line/Flared presets and independent hem width preserve neckline, collar and length',async()=>{
 const {default:Controls}=await load('../src/components/portal/RefinementControls.tsx')
 let fields={...model.switchGarment(model.defaultDesign,'dress'),collar_style:'shirt',refinement_geometry:geometry.initialRefinementGeometry(source.decorations,[0])}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const before=structuredClone(fields)
 for(const preset of ['straight','a_line','flared']){
  fields=geometry.applyRefinementSilhouette(fields,preset);assert.equal(geometry.refinementSilhouette(fields.refinement_geometry),preset)
  assert.equal(fields.refinement_geometry.hem_y,before.refinement_geometry.hem_y);assert.equal(fields.collar_style,'shirt');assert.equal(fields.neckline,before.neckline)
 }
 const original=structuredClone(fields)
 const tree=Controls({fields,onChange:next=>{fields=next}})
 nodes(tree).find(n=>n.props?.id==='refinement-hem').props.onChange({target:{value:'70'}})
 assert.equal(fields.refinement_geometry.hem,70);assert.equal(fields.refinement_geometry.waist,original.refinement_geometry.waist);assert.equal(fields.refinement_geometry.hem_y,original.refinement_geometry.hem_y)
 assert.equal(geometry.refinementSilhouette(fields.refinement_geometry),'custom')
 assert.notEqual(shapes.shapedGarmentPaths(original,geometry.refinementShape(original,original.refinement_geometry)).body,shapes.shapedGarmentPaths(fields,geometry.refinementShape(fields,fields.refinement_geometry)).body)
})
