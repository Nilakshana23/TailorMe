import CollarControls from './CollarControls'
import {effectiveCollar} from '../../utils/collars'
import {supportsNeckline} from '../../services/designService'
import type {DesignFields,GarmentOptions} from '../../services/designService'
import NecklineEditor from './NecklineEditor'
export default function GarmentOptionsControls({fields,onChange,disabled}:{fields:DesignFields;onChange:(fields:DesignFields)=>void;disabled:boolean}){
 const options=fields.garment_options??{}
 const setOption=(next:GarmentOptions)=>onChange({...fields,garment_options:next})
 return <>
 <CollarControls fields={fields} onChange={onChange} disabled={disabled}/>
 {supportsNeckline(fields)&&<><div><label htmlFor="design-neckline">Neckline</label><select id="design-neckline" className="application-select w-full" value={fields.neckline} onChange={event=>onChange({...fields,neckline:event.target.value as DesignFields['neckline'],custom_neckline:null})}><option value="round">Round</option><option value="v" disabled={effectiveCollar(fields)!=='none'}>V-neck</option><option value="square" disabled={effectiveCollar(fields)!=='none'}>Square</option></select></div>{effectiveCollar(fields)==='none'&&<NecklineEditor key={`${fields.garment_type}:${fields.neckline}:${options.collar}`} design={fields} disabled={disabled} onApply={geometry=>onChange({...fields,format_version:fields.format_version===3?3:2,custom_neckline:geometry})}/>}</>}
 {!['skirt','trousers'].includes(fields.garment_type)&&<div><label htmlFor="design-sleeve">Sleeve style</label><select id="design-sleeve" className="application-select w-full" value={fields.sleeve} onChange={event=>onChange({...fields,sleeve:event.target.value as DesignFields['sleeve']})}>{fields.garment_type!=='shirt'&&<option value="sleeveless">Sleeveless</option>}<option value="short">Short sleeves</option><option value="long">Long sleeves</option></select></div>}
 {fields.garment_type==='trousers'&&<><div><label htmlFor="design-waist-style">Waist style</label><select id="design-waist-style" className="application-select w-full" value={options.waist_style} onChange={event=>setOption({...options,waist_style:event.target.value as GarmentOptions['waist_style']})}><option value="flat">Flat waistband</option><option value="elastic">Elastic waistband</option></select></div><div><label htmlFor="design-leg-style">Leg style</label><select id="design-leg-style" className="application-select w-full" value={options.leg_style} onChange={event=>setOption({...options,leg_style:event.target.value as GarmentOptions['leg_style']})}><option value="straight">Straight</option><option value="tapered">Tapered</option><option value="wide">Wide leg</option></select></div></>}
 {['kurti','salwar_top'].includes(fields.garment_type)&&<div><label htmlFor="design-side-slits">Side slits</label><select id="design-side-slits" className="application-select w-full" value={options.side_slits} onChange={event=>setOption({side_slits:event.target.value as GarmentOptions['side_slits']})}><option value="none">None</option><option value="short">Short</option><option value="long">Long</option></select></div>}
 </>
}
