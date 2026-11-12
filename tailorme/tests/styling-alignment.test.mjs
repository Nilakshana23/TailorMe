import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../src/utils/stylingAlignment.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {alignmentLandmarks,alignmentWarp,validateAlignment,updatedAlignment,warpPoint,warpIllustrationPath,toCentimetres,fromCentimetres,convertMeasurements,measurementError,estimatedHem,emptyMeasurements}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const points={leftShoulder:{x:35,y:15},rightShoulder:{x:65,y:15},leftWaist:{x:40,y:40},rightWaist:{x:60,y:40},leftHip:{x:32,y:55},rightHip:{x:68,y:55},hem:{x:50,y:90}}
const pick=type=>Object.fromEntries(alignmentLandmarks(type).map(key=>[key,structuredClone(points[key])]))
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} equals ${b}`)

test('relevant steps, partial marking and rejection preserve last valid points',()=>{
 assert.equal(alignmentLandmarks('dress').length,7)
 assert.deepEqual(alignmentLandmarks('blouse'),['leftShoulder','rightShoulder','leftWaist','rightWaist','hem'])
 assert.deepEqual(alignmentLandmarks('skirt'),['leftWaist','rightWaist','leftHip','rightHip','hem'])
 const previous=pick('dress')
 assert.equal(validateAlignment(previous,'dress'),'')
 for(const [key,point] of [['leftWaist',{x:-1,y:40}],['leftWaist',{x:90,y:40}],['rightShoulder',{x:36,y:15}],['rightHip',{x:68,y:90}],['hem',{x:50,y:50}],['hem',{x:1,y:90}],['hem',{x:50,y:NaN}]])assert.throws(()=>updatedAlignment(previous,key,point,'dress'))
 assert.deepEqual(previous,pick('dress'))
 assert.throws(()=>updatedAlignment(pick('skirt'),'leftShoulder',points.leftShoulder,'skirt'))
 assert.equal(alignmentWarp({leftShoulder:points.leftShoulder},{garment_type:'dress',length:'midi'}),null)
 assert.equal(validateAlignment({leftWaist:{x:40,y:40}},'dress'),'')
})

test('every garment length maps shoulder/waist/hip rows and hem to photo coordinates within bounded geometry',()=>{
 for(const garment_type of ['dress','blouse','skirt'])for(const length of ['short','midi','long']){
  const marks=pick(garment_type),original=structuredClone(marks)
  const warp=alignmentWarp(marks,{garment_type,length})
  assert.ok(warp)
  for(const row of warp.rows){
   const left=warpPoint({x:160-row.sourceHalfWidth,y:row.sourceY},warp)
   const right=warpPoint({x:160+row.sourceHalfWidth,y:row.sourceY},warp)
   close(left.x,row.left.x);close(left.y,row.left.y);close(right.x,row.right.x);close(right.y,row.right.y)
  }
  const last=warp.rows.at(-1),hem=warpPoint({x:160,y:last.sourceY},warp)
  close(hem.x,50);close(hem.y,90)
  for(let y=55;y<=450;y+=5)for(let x=50;x<=270;x+=5){const p=warpPoint({x,y},warp);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-25&&p.x<=125&&p.y>=-25&&p.y<=125)}
  assert.deepEqual(marks,original)
 }
})

test('path mapping adapts intermediate rows, samples custom curves and preserves closed silhouette and detail commands',()=>{
 const warp=alignmentWarp(pick('dress'),{garment_type:'dress',length:'midi'})
 const silhouette=warpIllustrationPath('M120 65 L143 65 C146 65 149 80 151.5 80 C154 80 157 110 160 110 C163 110 166 90 168.5 90 C171 90 174 65 177 65 L200 65 L190 195 L235 370 L85 370 L130 195 Z',warp)
 assert.match(silhouette,/^M35 15 /)
 assert.ok(silhouette.includes('L68 55 '),'right hip row lies on the deformed silhouette')
 assert.match(silhouette,/Z$/)
 assert.doesNotMatch(silhouette,/NaN|Infinity|Q160 100|L160 110 L177 65/)
 const baseline=warpIllustrationPath('M120 65 L143 65 Q160 100 177 65 L200 65 Z',warp)
 assert.notEqual(silhouette,baseline)
 const seam=warpIllustrationPath('M130 195 H190',warp)
 assert.match(seam,/^M40 40 /);assert.match(seam,/L60 40 /)
})

test('unit conversion, optional inputs and repeated unit switches preserve physical quantities',()=>{
 close(toCentimetres(1,'in'),2.54);close(fromCentimetres(2.54,'in'),1)
 assert.equal(measurementError('shoulder','','cm'),'')
 for(const value of ['-1','0','Infinity','bad','101'])assert.ok(measurementError('shoulder',value,'cm'))
 assert.equal(measurementError('waist','35','in'),'')
 let values={shoulder:'40',bust:'90',waist:'75',hip:'100',length:'80'}
 const converted=convertMeasurements(values,'cm','in')
 close(Number(converted.shoulder),40/2.54)
 for(let i=0;i<20;i++)values=convertMeasurements(convertMeasurements(values,'cm','in'),'in','cm')
 close(Number(values.shoulder),40,1e-5)
 assert.equal(convertMeasurements(emptyMeasurements,'cm','in').length,'')
 const boundary=convertMeasurements({shoulder:'100',bust:'400',waist:'5',hip:'400',length:'300'},'cm','in')
 for(const key of Object.keys(boundary))assert.equal(measurementError(key,boundary[key],'in'),'')
})

test('hem estimate uses only shoulder width/garment length, accounts for photo aspect and is unit-invariant',()=>{
 const values={shoulder:'40',bust:'90',waist:'75',hip:'100',length:'80'}
 const hem=estimatedHem(points,values,'cm',1,'dress')
 close(hem.x,50);close(hem.y,75)
 close(estimatedHem(points,values,'cm',0.5,'blouse').y,45)
 const inches=estimatedHem(points,convertMeasurements(values,'cm','in'),'in',1,'dress')
 close(inches.y,hem.y,1e-5)
 assert.deepEqual(estimatedHem(points,{...values,bust:'300',waist:'200',hip:'350'},'cm',1,'dress'),hem)
 assert.throws(()=>estimatedHem(points,values,'cm',1,'skirt'))
 assert.throws(()=>estimatedHem({},values,'cm',1,'dress'))
 assert.throws(()=>estimatedHem(points,{...values,length:'300'},'cm',1,'dress'),/outside/)
 assert.throws(()=>estimatedHem(points,{...values,shoulder:'0'},'cm',1,'dress'))
})

test('alignment utility has no persistence, network or measurements-to-width coupling',()=>{
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|analytics|FormData|FileReader|toDataURL/)
 const warpImplementation=source.slice(source.indexOf('export function alignmentWarp'),source.indexOf('export type MeasurementKey'))
 assert.doesNotMatch(warpImplementation,/circumference|measurements|toCentimetres|fromCentimetres/)
 const service=readFileSync(new URL('../src/services/designService.ts',import.meta.url),'utf8')
 assert.doesNotMatch(service,/alignment|measurement|previewWarp/)
 const request=readFileSync(new URL('../src/services/requestService.ts',import.meta.url),'utf8')
 // Explicit personal measurement sharing is separate from local photo alignment.
 assert.doesNotMatch(request,/alignment|previewWarp|convertMeasurements|estimatedHem|PhotoStylingPreview/)
})

test('shirt and tunic alignment uses relevant upper rows; trousers map separate leg hems without shoulder or torso tools',()=>{
 assert.deepEqual(alignmentLandmarks('shirt'),alignmentLandmarks('blouse'))
 assert.deepEqual(alignmentLandmarks('kurti'),alignmentLandmarks('dress'))
 assert.deepEqual(alignmentLandmarks('salwar_top'),alignmentLandmarks('dress'))
 assert.deepEqual(alignmentLandmarks('trousers'),['leftWaist','rightWaist','leftHip','rightHip','leftHem','rightHem'])
 const marks={leftWaist:{x:38,y:20},rightWaist:{x:62,y:20},leftHip:{x:32,y:40},rightHip:{x:68,y:40},leftHem:{x:27,y:90},rightHem:{x:73,y:90}}
 assert.equal(validateAlignment(marks,'trousers'),'')
 assert.throws(()=>updatedAlignment(marks,'leftShoulder',{x:30,y:10},'trousers'))
 assert.throws(()=>updatedAlignment(marks,'rightHem',{x:20,y:90},'trousers'))
 for(const leg_style of ['straight','tapered','wide'])for(const length of ['short','midi','long']){
  const warp=alignmentWarp(marks,{garment_type:'trousers',length,garment_options:{leg_style,waist_style:'flat'}})
  assert.ok(warp);const row=warp.rows.at(-1)
  const left=warpPoint({x:160-row.sourceHalfWidth,y:row.sourceY},warp),right=warpPoint({x:160+row.sourceHalfWidth,y:row.sourceY},warp)
  close(left.x,27);close(right.x,73);close(left.y,90);close(right.y,90)
 }
 for(const garment_type of ['shirt','kurti','salwar_top']){
  const warp=alignmentWarp(pick(garment_type),{garment_type,length:'midi'})
  assert.ok(warp)
  for(const row of warp.rows){close(warpPoint({x:160-row.sourceHalfWidth,y:row.sourceY},warp).x,row.left.x)}
 }
})
