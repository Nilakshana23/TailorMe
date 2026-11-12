import {refinementLimits,silhouettePresets,refinementSilhouette,applyRefinementSilhouette} from '../../utils/garmentRefinement'
import type {DesignFields} from '../../services/designService'
const labels={shoulder:'Shoulder anchor width',waist:'Waist anchor width',hem:'Hem width (independent)',sleeve_width:'Sleeve anchor width',sleeve_length:'Sleeve anchor length',waist_y:'Waist anchor height',hem_y:'Hem anchor height'}
export default function RefinementControls({fields,onChange,disabled=false}:{fields:DesignFields;onChange:(fields:DesignFields)=>void;disabled?:boolean}){
 const g=fields.refinement_geometry
 if(!g)return null
 const bottom=['skirt','trousers'].includes(fields.garment_type)
 return <fieldset className="refinement-anchors" disabled={disabled}><legend>Guided illustration anchors</legend><p>Adjust the template proportions. These are drawing controls, not body measurements. Left and right stay symmetrical.</p>
 {fields.garment_type!=='trousers'&&<div><label htmlFor="refinement-silhouette">Silhouette</label><select id="refinement-silhouette" className="application-select w-full" value={refinementSilhouette(g)} onChange={e=>onChange(applyRefinementSilhouette(fields,e.target.value as keyof typeof silhouettePresets))}><option value="custom" disabled>Custom proportions</option>{Object.entries(silhouettePresets).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select><p>Presets set waist and hem widths. Adjust hem width independently below without changing the garment length.</p></div>}
 {Object.entries(refinementLimits).filter(([key])=>!(bottom&&(key==='shoulder'||key.startsWith('sleeve')))&&!(fields.garment_type==='trousers'&&key==='waist_y')&&!(fields.garment_type==='skirt'&&key==='waist_y')&&!(!['short','long'].includes(fields.sleeve)&&key.startsWith('sleeve'))).map(([key,[min,max]])=><div key={key}><label htmlFor={`refinement-${key}`}>{labels[key as keyof typeof labels]}: {g[key as keyof typeof g]}</label><input id={`refinement-${key}`} type="range" min={min} max={max} step="1" value={g[key as keyof typeof g]} onChange={e=>onChange({...fields,refinement_geometry:{...g,[key]:Number(e.target.value)}})}/></div>)}
 </fieldset>
}
