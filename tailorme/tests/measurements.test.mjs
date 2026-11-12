import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../src/utils/measurements.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
const {measurementFields,canonicalMeasurement,displayMeasurement,validateMeasurements}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
test('canonical cm conversion and display toggles never rewrite stored numbers',()=>{
 assert.equal(canonicalMeasurement('10','in'),25.4)
 assert.equal(canonicalMeasurement('31.5','in'),80.01)
 for(const value of [10,25.4,80.01,99.99,140]){
  const profile={waist:value}
  for(let i=0;i<1000;i++){displayMeasurement(profile.waist,'in');displayMeasurement(profile.waist,'cm')}
  assert.equal(profile.waist,value)
 }
})
test('partial profiles and field-specific inclusive bounds, finite positive numbers and supported keys',()=>{
 assert.equal(validateMeasurements({}),'')
 for(const [key,,,min,max] of measurementFields){
  assert.equal(validateMeasurements({[key]:min}),'');assert.equal(validateMeasurements({[key]:max}),'')
  for(const value of [NaN,Infinity,-Infinity,0,-1,min-0.01,max+0.01,min+0.001])assert.notEqual(validateMeasurements({[key]:value}),'')
 }
 assert.notEqual(validateMeasurements({photo:1}),'')
})
test('sharing starts unchecked and frozen attempt retains exact consent payload for retry',()=>{
 const composer=readFileSync(new URL('../src/components/portal/RequestComposer.tsx',import.meta.url),'utf8')
 assert.match(composer,/\[share,setShare\]=useState\(false\)/)
 assert.match(composer,/attempt.current \?\?=/)
 assert.match(composer,/submission.design,submission.measurements/)
 assert.match(composer,/checked=\{share\}/)
 const service=readFileSync(new URL('../src/services/requestService.ts',import.meta.url),'utf8')
 assert.match(service,/p_share: !!measurements/)
 assert.match(service,/send_tailoring_request_with_measurements/)
})
