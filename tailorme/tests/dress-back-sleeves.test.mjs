import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// Compile the real TSX components in memory. Stub only the Supabase transport:
// no environment files, tokens, accounts, or network requests are used by tests.
const modules = new Map()
function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let source
  if (url.pathname.endsWith('/lib/supabase.ts')) {
    source = 'export let supabase = null; export function setSupabase(value) { supabase = value; } export const configurationError = null; export const authRedirect = { present: true, error: null };'
  } else if (/\.(css|png)$/.test(url.pathname)) {
    source = 'export default "";'
  } else {
    source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText
    // SSR does not run Navigate effects. Record the real component's navigation
    // props at the router boundary so tests can assert destinations and replace.
    if (source.includes('import { Link, Navigate, useLocation }')) {
      source = source.replace('import { Link, Navigate, useLocation }', 'import { Link, useLocation }')
      source += '\nfunction Navigate(props) { globalThis.__tailormeNavigation = props; return null; }'
    }
    source = source.replace(/from\s+['"]([^'"]+)['"]/g, (_, specifier) => {
      if (!specifier.startsWith('.')) return `from '${import.meta.resolve(specifier)}'`
      let child = new URL(specifier, url)
      if (!existsSync(child)) {
        child = ['.ts', '.tsx'].map((extension) => new URL(specifier + extension, url)).find((candidate) => existsSync(candidate))
        assert.ok(child, `Module exists: ${specifier}`)
      }
      return `from '${moduleUrl(child)}'`
    }).replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(url.href, compiled)
  return compiled
}
const load = (path) => import(moduleUrl(new URL(path, import.meta.url)))


const {legacyBack,validBackNeckline,backNecklinePath}=await load('../src/utils/backNeckline.ts')
const {dressNecklineMesh,necklineBoundary}=await load('../src/utils/dressNecklineMesh.ts')
const {defaultDesign,defaultSketch,designService,editableDesign,designFingerprint,validateDesignOptions}=await load('../src/services/designService.ts')
const {dressPreviewSpec,omittedPreviewDetails}=await load('../src/utils/dressPreview3d.ts')
const {default:Illustration}=await load('../src/components/portal/DesignIllustration.tsx')
const {setSupabase}=await load('../src/lib/supabase.ts')
const back={version:1,preset:'square',depth:35,width:40}
const points=mesh=>Array.from({length:mesh.length/6},(_,i)=>mesh.slice(i*6,i*6+3))
test('back presets and finite bounded dimensions remain independent of the front',()=>{
 for(const preset of ['round','v','square'])for(const depth of [4,45])for(const width of [20,42]){
  const b={version:1,preset,depth,width};assert.equal(validBackNeckline(b),true)
  const round=necklineBoundary('round',b),v=necklineBoundary('v',b)
  assert.deepEqual(round.filter(p=>p[2]<0),v.filter(p=>p[2]<0))
  assert.ok(round.every(p=>p.every(Number.isFinite)&&p[1]>=.39&&p[1]<=.78))
 }
 for(const b of [{...back,depth:NaN},{...back,width:Infinity},{...back,width:43},{...back,depth:3},{...back,preset:'custom'},{...back,version:2},{...back,extra:1}]){
  assert.equal(validBackNeckline(b),false);assert.throws(()=>dressNecklineMesh('midi','a-line','round',b))
 }
 const front=b=>necklineBoundary('v',b).filter(p=>p[2]>=0)
 // Back-specific sample points may differ in number; their front heights never change.
 assert.equal(front(back).find(p=>Math.abs(p[0])<1e-10)[1],front(legacyBack).find(p=>Math.abs(p[0])<1e-10)[1])
 assert.match(backNecklinePath(back),/L140 100 L180 100 L180 65/)
})
test('back openings contain no cap or bridge; normals stay finite/unit and square corners remain vertical',()=>{
 for(const preset of ['round','v','square']){
  const b={...back,preset},boundary=necklineBoundary('v',b),mesh=dressNecklineMesh('long','flared','v',b)
  for(let i=0;i<mesh.length;i+=6)assert.ok(Math.abs(Math.hypot(...mesh.slice(i+3,i+6))-1)<1e-8)
  // At back centre, each upper vertex is below its requested opening height.
  for(const p of points(mesh).filter(p=>p[2]<0&&Math.abs(p[0])<1e-10))assert.ok(p[1]<=.78-b.depth*.63/130+1e-8)
  assert.ok(boundary.some(p=>p[2]<0&&Math.abs(p[0])<1e-10))
  for(let i=0;i<mesh.length;i+=18){const tri=[mesh.slice(i,i+3),mesh.slice(i+6,i+9),mesh.slice(i+12,i+15)];assert.ok(Math.min(...tri.map(p=>p[1]))<=.39,'no filled fan above chest')}
 }
})
test('short and long sleeves replace side armhole faces, share seams, keep cuffs open and sync colour/options',()=>{
 const bare=dressNecklineMesh('midi','a-line','round',back)
 for(const sleeve of ['short','long']){
  const mesh=dressNecklineMesh('midi','a-line','round',back,sleeve),ps=points(mesh),cuffY=sleeve==='short'?.35:-.16
  assert.notDeepEqual(mesh,bare);assert.ok(ps.some(p=>Math.abs(p[0])>.4))
  for(const side of [-1,1]){
   const cuff=ps.filter(p=>Math.abs(p[1]-cuffY)<1e-10&&p[0]*side>.26)
   assert.ok(cuff.length>10)
   for(let i=0;i<mesh.length;i+=18){const tri=[mesh.slice(i,i+3),mesh.slice(i+6,i+9),mesh.slice(i+12,i+15)];assert.ok(!tri.every(p=>Math.abs(p[1]-cuffY)<1e-10),'cuffs not capped')}
  }
  const d={...defaultDesign,back_neckline:back,sleeve,garment_fill:'#123456'},before=designFingerprint(d)
  assert.equal(dressPreviewSpec(d).sleeve,sleeve);assert.equal(dressPreviewSpec(d).colour,'#123456');assert.deepEqual(dressPreviewSpec(d).back,back)
  assert.ok(!omittedPreviewDetails(d).some(s=>s.startsWith('Sleeve')));assert.equal(designFingerprint(d),before)
  const html=renderToString(React.createElement('div',null,React.createElement(Illustration,{design:d}),React.createElement(Illustration,{design:d,view:'back'})))
  assert.match(html,/Design illustration.*Back/);assert.match(html,/Design illustration.*Front/);assert.match(html,/L140 100 L180 100 L180 65/)
 }
})
test('save/reopen payload and fingerprints preserve back settings; legacy, sketches and other garments remain valid',async()=>{
 const d={...defaultDesign,back_neckline:back,sleeve:'short'},calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push([name,args]);return{data:{...args.p_fields,id:args.p_id,version:1},error:null}}})
 try{
  assert.equal(validateDesignOptions(d),'');const saved=await designService.save('d',d,null)
  assert.deepEqual(saved.back_neckline,back);assert.deepEqual(editableDesign(saved).back_neckline,back)
  assert.notEqual(designFingerprint(d),designFingerprint({...d,back_neckline:{...back,depth:20}}))
  assert.equal('back_neckline' in editableDesign(defaultDesign),false)
  assert.deepEqual(dressPreviewSpec(defaultDesign).back,legacyBack)
  assert.equal(validateDesignOptions(defaultSketch),'');assert.equal(dressPreviewSpec(defaultSketch),null)
  assert.ok(validateDesignOptions({...d,garment_type:'blouse'}));assert.ok(validateDesignOptions({...d,back_neckline:{...back,width:Infinity}}))
  for(const key of ['camera','yaw','pitch','photo','distance'])assert.equal(key in calls[0][1].p_fields,false)
 }finally{setSupabase(null)}
})

test('sleeve seams are watertight and mirrored sleeve normals point outward',()=>{
 for(const sleeve of ['short','long']){
  const mesh=dressNecklineMesh('midi','a-line','round',{...back,preset:'round'},sleeve),edges=new Map()
  const key=p=>p.map(n=>n.toFixed(8)).join(',')
  for(let i=0;i<mesh.length;i+=18){const tri=[mesh.slice(i,i+3),mesh.slice(i+6,i+9),mesh.slice(i+12,i+15)]
   for(let j=0;j<3;j++){const edge=[key(tri[j]),key(tri[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1)}
   const centre=[0,1,2].map(k=>tri.reduce((sum,p)=>sum+p[k],0)/3),normal=mesh.slice(i+3,i+6)
   if(Math.abs(centre[0])>.44)assert.ok(normal[0]*centre[0]>0,'outer sleeves face outward on either side')
  }
  for(const [edge,count] of edges){
   assert.ok(count<=2,'no overlapping duplicate surface')
   if(count===1){const ps=edge.split('|').map(p=>p.split(',').map(Number)),ys=ps.map(p=>p[1]);
    assert.ok(ys.every(y=>Math.abs(y-(-.9))<1e-7)||ys.every(y=>Math.abs(y-(sleeve==='short'?.35:-.16))<1e-7)||ys.every(y=>y>.39),'unexpected open edge: '+edge)
   }
  }
 }
})



test('back controls update only back data; existing front and sleeve controls stay the single source of truth',async()=>{
 const {default:Controls}=await load('../src/components/portal/GarmentOptionsControls.tsx')
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const fields={...defaultDesign,back_neckline:back};let next
 const tree=Controls({fields,onChange:v=>{next=v},disabled:false}),all=nodes(tree)
 assert.equal(all.filter(n=>n.props?.id==='design-sleeve').length,1)
 for(const [id,value] of [['back-preset','v'],['back-depth','40'],['back-width','30']]){
  all.find(n=>n.props?.id===id).props.onChange({target:{value}})
  assert.equal(next.neckline,fields.neckline);assert.equal(next.sleeve,fields.sleeve);assert.equal(validateDesignOptions(next),'')
 }
 all.find(n=>n.props?.id==='design-neckline').props.onChange({target:{value:'square'}})
 assert.deepEqual(next.back_neckline,back)
 all.find(n=>n.props?.id==='design-sleeve').props.onChange({target:{value:'long'}})
 assert.deepEqual(next.back_neckline,back);assert.equal(next.sleeve,'long')
 const html=renderToString(React.createElement(Controls,{fields,onChange(){},disabled:false}))
 assert.match(html,/for="back-depth"/);assert.match(html,/for="back-width"/);assert.match(html,/min="4" max="45"/)
 assert.ok(!nodes(Controls({fields:{...defaultDesign,garment_type:'skirt',neckline:'none',sleeve:'none'},onChange(){},disabled:false})).some(n=>n.props?.id==='back-preset'))
})
