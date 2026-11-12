import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const compile=path=>ts.transpileModule(source(path),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const url=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const alignmentUrl=url(compile('../src/utils/stylingAlignment.ts')),neckUrl=url(compile('../src/utils/necklineGeometry.ts'))
const shapeUrl=url(compile('../src/utils/previewShape.ts').replace("from './necklineGeometry'",`from '${neckUrl}'`).replace("from './stylingAlignment'",`from '${alignmentUrl}'`))
const {defaultPreviewShape,shapeControls,shapeHandles,shapedGarmentPaths,validatePreviewShape,changeShape,dragShape,simpleOutline,inverseWarpPoint}=await import(shapeUrl)
const {alignmentWarp,warpPoint,sampleIllustrationPath}=await import(alignmentUrl)
const awaitNeck=await import(neckUrl)
const design={name:'Preview dress',garment_type:'dress',length:'midi',sleeve:'long',neckline:'v',colour:'ruby',format_version:2,custom_neckline:{depths:[65,80,108,90,65]}}
const points=path=>{const nums=path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number),result=[];for(let i=0;i<nums.length;i+=2){const p={x:nums[i],y:nums[i+1]};if(!result.length||Math.hypot(p.x-result.at(-1).x,p.y-result.at(-1).y)>1e-7)result.push(p)}if(Math.hypot(result[0].x-result.at(-1).x,result[0].y-result.at(-1).y)<1e-7)result.pop();return result}

test('defaults and relevant handles are valid for all garment, sleeve, preset and length combinations',()=>{
 for(const garment_type of ['dress','blouse','skirt'])for(const length of ['short','midi','long'])for(const sleeve of ['sleeveless','short','long'])for(const neckline of ['round','v','square']){
  const fields={...design,garment_type,length,sleeve,neckline,custom_neckline:null}
  const shape=defaultPreviewShape(fields)
  assert.equal(validatePreviewShape(shape,fields),'',JSON.stringify(fields))
  const handles=shapeHandles(shape,fields)
  assert.equal(handles.length,garment_type==='skirt'?4:sleeve==='sleeveless'?8:10)
  if(garment_type==='skirt')assert.ok(handles.every(h=>!/(sleeve|shoulder|underarm)/.test(h.key)))
  if(sleeve==='sleeveless')assert.ok(handles.every(h=>!h.key.endsWith('.sleeve')))
 }
})
test('sleeve width and length are independent from torso changes; optional symmetry mirrors only requested dimensions',()=>{
 const original=defaultPreviewShape(design),before=shapedGarmentPaths(design,original)
 const wider=changeShape(original,'left.sleeveWidth',50,false,design)
 const after=shapedGarmentPaths(design,wider)
 assert.equal(after.body,before.body);assert.equal(after.sleeves[1],before.sleeves[1]);assert.notEqual(after.sleeves[0],before.sleeves[0])
 assert.equal(wider.left.sleeveLength,original.left.sleeveLength);assert.equal(wider.right.sleeveWidth,40)
 const torso=changeShape(wider,'hemY',430,false,design)
 assert.deepEqual(shapedGarmentPaths(design,torso).sleeves,after.sleeves)
 assert.notEqual(shapedGarmentPaths(design,torso).body,after.body)
 const mirrored=changeShape(torso,'right.waist',45,true,design)
 assert.equal(mirrored.left.waist,45);assert.equal(mirrored.right.waist,45)
 assert.equal(mirrored.left.sleeveWidth,50);assert.equal(mirrored.right.sleeveWidth,40)
 assert.deepEqual(original,defaultPreviewShape(design),'source shape remains immutable')
})
test('invalid, crossing or non-finite edits preserve the prior shape; custom neckline remains part of the filled silhouette',()=>{
 const original=defaultPreviewShape(design),copy=structuredClone(original)
 for(const [key,value] of [['left.shoulder',80],['left.underarm',NaN],['hemY',100],['waistY',440],['right.sleeveLength',Infinity],['left.sleeveWidth',0],['unknown',1]])assert.throws(()=>changeShape(original,key,value,false,design))
 assert.throws(()=>dragShape(original,'left.hem',{x:300,y:100},false,design))
 assert.throws(()=>dragShape(original,'left.sleeve',{x:-100,y:900},false,design))
 assert.throws(()=>dragShape(original,'left.sleeve',{x:100,y:140},false,{...design,sleeve:'sleeveless'}))
 assert.deepEqual(original,copy)
 const {customNecklinePath}=awaitNeck
 const body=shapedGarmentPaths(design,changeShape(original,'left.shoulder',45,false,design)).body
 assert.ok(body.includes(customNecklinePath(design.custom_neckline)))
 assert.doesNotMatch(body,/L160 110 L177 65|Q160 100 177 65/)
 assert.match(body,/^M/);assert.match(body,/Z$/)
 assert.equal(simpleOutline([{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]),false)
 assert.equal(simpleOutline([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]),true)
})
test('bounded accepted changes have simple filled outlines and retain neckline/detail paths',()=>{
 let shape=defaultPreviewShape(design),accepted=0
 let seed=711
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32}
 for(let i=0;i<80;i++){
  const controls=shapeControls(shape,design),control=controls[i%controls.length],value=Math.round((control.min+(control.max-control.min)*random())*10)/10
  try{shape=changeShape(shape,control.key,value,i%2===0,design);accepted++}catch{/* rejected candidates intentionally leave the last valid shape */}
  assert.equal(validatePreviewShape(shape,design),'')
  const paths=shapedGarmentPaths(design,shape)
  for(const path of [paths.body,...paths.sleeves])assert.equal(simpleOutline(points(sampleIllustrationPath(path))),true)
  assert.equal(paths.details.length,2);assert.ok(paths.seam)
 }
 assert.ok(accepted>50)
})
test('shape handles map back through existing alignment and unsafe folded projections are rejected',()=>{
 const marks={leftShoulder:{x:35,y:15},rightShoulder:{x:65,y:15},leftWaist:{x:40,y:40},rightWaist:{x:60,y:40},leftHip:{x:32,y:55},rightHip:{x:68,y:55},hem:{x:50,y:90}}
 const warp=alignmentWarp(marks,design),shape=defaultPreviewShape(design)
 assert.equal(validatePreviewShape(shape,design,warp),'')
 const sourcePoint={x:125,y:145},mapped=warpPoint(sourcePoint,warp),inverse=inverseWarpPoint(mapped,warp,{x:130,y:130})
 assert.ok(Math.hypot(inverse.x-sourcePoint.x,inverse.y-sourcePoint.y)<0.1)
 const handle=shapeHandles(shape,design).find(h=>h.key==='left.sleeve')
 const next=dragShape(shape,handle.key,{x:handle.point.x-2,y:handle.point.y+10},true,design,warp)
 assert.equal(next.left.sleeveWidth,44);assert.equal(next.right.sleeveLength,190)
 const folded={rows:warp.rows.map(row=>({...row,left:{x:50,y:row.left.y},right:{x:50,y:row.left.y}}))}
 assert.ok(validatePreviewShape(shape,design,folded))
 assert.throws(()=>inverseWarpPoint({x:60,y:20},folded,sourcePoint))
})
test('shape code and save/request transports retain the browser-only privacy boundary',()=>{
 assert.doesNotMatch(source('../src/utils/previewShape.ts'),/fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|analytics|FormData|FileReader/)
 for(const file of ['designService.ts','requestService.ts'])assert.doesNotMatch(source(`../src/services/${file}`),/previewShape|shapeState|shapeControls/)
 assert.match(source('../src/components/portal/PhotoStylingPreview.tsx'),/Preview adjustments are not saved to your tailoring design\./)
})
