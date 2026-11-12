import {useState} from 'react'
import {collarLabels,collarCompatibility,effectiveCollar,supportsCollar} from '../../utils/collars'
import type {CollarStyle} from '../../utils/collars'
import type {DesignFields} from '../../services/designService'
import {designColours} from '../../services/designService'
import ColourControl from '../ui/ColourControl'
export default function CollarControls({fields,onChange,disabled}:{fields:DesignFields;onChange:(fields:DesignFields)=>void;disabled:boolean}){
 const [candidate,setCandidate]=useState<CollarStyle|null>(null)
 if(!supportsCollar(fields))return null
 const current=effectiveCollar(fields),message=candidate?collarCompatibility(fields,candidate):''
 function apply(style:CollarStyle,round=false){
  onChange({...fields,collar_style:style,collar_colour:style==='none'?null:fields.collar_colour??null,...(fields.garment_type==='shirt'?{garment_options:{collar:'none' as const}}:{}),...(round?{neckline:'round' as const,custom_neckline:null}:{})})
  setCandidate(null)
 }
 function colour(value:string|null){
  // Move a legacy shirt's explicit collar into the separate control before
  // saving a colour; otherwise the old template and new collar would duplicate.
  onChange({...fields,collar_style:current,collar_colour:value,...(fields.garment_type==='shirt'?{garment_options:{collar:'none' as const}}:{})})
 }
 return <fieldset className="collar-controls" disabled={disabled}><legend>Collar</legend>
  <label htmlFor="design-collar">Collar style</label><select id="design-collar" className="application-select w-full" value={candidate??current} aria-describedby="collar-guidance" onChange={e=>{const style=e.target.value as CollarStyle;if(collarCompatibility(fields,style))setCandidate(style);else apply(style)}}>{Object.entries(collarLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
  <p id="collar-guidance">A collar is added around the neckline; it does not define the neckline cut. These collars use a round preset opening.</p>
  {candidate&&<div role="status"><p>{message||'Confirm applying this collar to the current round neckline.'} {fields.custom_neckline?'Your custom curve will be replaced only if you confirm.':'Switching to round changes the neckline cut only if you confirm.'}</p><div className="photo-actions"><button type="button" onClick={()=>apply(candidate,true)}>Use round neckline and apply collar</button><button type="button" onClick={()=>setCandidate(null)}>Keep current neckline</button></div></div>}
  {current!=='none'&&<><label className="refinement-check"><input type="checkbox" checked={fields.collar_colour!=null} onChange={e=>colour(e.target.checked?(fields.garment_fill??designColours[fields.colour]):null)}/>Use a separate collar colour</label>{fields.collar_colour!=null&&<ColourControl id="collar-colour" label="Collar colour" value={fields.collar_colour} onChange={colour}/>}<p>Choose None to use V, square or custom neckline editing.</p></>}
 </fieldset>
}
