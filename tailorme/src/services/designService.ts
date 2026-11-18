import {validBackNeckline} from '../utils/backNeckline'
import type {BackNeckline} from '../utils/backNeckline'
import {validateCollar} from '../utils/collars'
import type {CollarStyle} from '../utils/collars'
import {validRefinementGeometry} from '../utils/garmentRefinement'
import type {RefinementGeometry} from '../utils/garmentRefinement'
import {emptyDrawing,validDrawing,validHex} from '../utils/designDrawing'
import type {DesignDrawing} from '../utils/designDrawing'
import {validNeckline} from '../utils/necklineGeometry'
import type {CustomNeckline} from '../utils/necklineGeometry'
import {supabase} from '../lib/supabase'
export const designColours={ruby:'#a8324a',navy:'#243c63',sage:'#789783',ivory:'#f3e6ce',black:'#303039'} as const
export type GarmentType='dress'|'blouse'|'skirt'|'shirt'|'trousers'|'kurti'|'salwar_top'
export type GarmentOptions={collar?:'point'|'band'|'none';waist_style?:'flat'|'elastic';leg_style?:'straight'|'tapered'|'wide';side_slits?:'none'|'short'|'long'}
export type SketchReference={id:string;version:number;outline_indices:number[];design:DesignFields}
export type DesignFields={back_neckline?:BackNeckline|null;collar_style?:CollarStyle|null;collar_colour?:string|null;refinement_geometry?:RefinementGeometry|null;source_reference?:SketchReference|null;include_source_reference?:boolean;design_kind?:'garment'|'sketch';notes?:string;sketch_category?:GarmentType|null;garment_fill?:string|null;decorations?:DesignDrawing;format_version?:1|2|3|4;garment_options?:GarmentOptions;custom_neckline?:CustomNeckline|null;name:string;garment_type:GarmentType;colour:keyof typeof designColours;neckline:'round'|'v'|'square'|'none';sleeve:'sleeveless'|'short'|'long'|'none';length:'short'|'midi'|'long'}
export type CustomerDesign=DesignFields&{id:string;owner_id:string;version:number;attached_at:string|null}
export type DesignSnapshot=DesignFields&{request_id:string;design_id:string;design_version:number}
export const defaultDesign:DesignFields={name:'My design',garment_type:'dress',colour:'ruby',neckline:'round',sleeve:'sleeveless',length:'midi'}
export const defaultSketch:DesignFields={...defaultDesign,design_kind:'sketch',format_version:4,name:'My sketch',neckline:'none',sleeve:'none',colour:'ivory',decorations:emptyDrawing(2),notes:'',sketch_category:null}
export const garmentLabels:Record<GarmentType,string>={dress:'Dress',blouse:'Blouse',skirt:'Skirt',shirt:'Shirt',trousers:'Trousers',kurti:'Kurti',salwar_top:'Salwar top'}
export function supportsNeckline(design:DesignFields){return !['skirt','trousers'].includes(design.garment_type)&&(design.collar_style!=null||design.garment_type!=='shirt'||design.garment_options?.collar==='none')}
export function switchGarment(fields:DesignFields,type:GarmentType):DesignFields {
 const bottom=type==='skirt'||type==='trousers'
 return {...fields,back_neckline:null,collar_style:'none',collar_colour:null,refinement_geometry:null,garment_type:type,format_version:3,neckline:bottom?'none':'round',sleeve:bottom?'none':type==='shirt'?'long':'sleeveless',length:'midi',custom_neckline:null,garment_options:type==='shirt'?{collar:'none'}:type==='trousers'?{waist_style:'flat',leg_style:'straight'}:type==='kurti'||type==='salwar_top'?{side_slits:'short'}:{}}
}
export function validateDesignOptions(design:DesignFields):string {
 if(design.back_neckline!=null&&(!validBackNeckline(design.back_neckline)||design.garment_type!=='dress'||design.design_kind==='sketch'))return 'Invalid back neckline. Use a dress preset with depth 4 to 45 and width 20 to 42.'
 const collarError=validateCollar(design);if(collarError)return collarError
 if(design.refinement_geometry!=null&&(!validRefinementGeometry(design.refinement_geometry)||design.design_kind==='sketch'||design.format_version!==3))return 'Invalid template refinement proportions.'
 if(design.notes!==undefined&&(typeof design.notes!=='string'||design.notes.length>2000))return 'Notes must be at most 2,000 characters.'
 if(design.design_kind!==undefined&&!['garment','sketch'].includes(design.design_kind))return 'Unsupported design mode.'
 if(design.garment_fill!==undefined&&design.garment_fill!==null&&!validHex(design.garment_fill))return 'Invalid garment fill colour.'
 if(design.design_kind==='sketch')return design.format_version!==4||!validDrawing(design.decorations)||design.decorations.version!==2||design.decorations.strokes.some(s=>s.mode!=='canvas')||(design.sketch_category!=null&&!Object.hasOwn(garmentLabels,design.sketch_category))?'Invalid sketch format, category or artwork.':''

 if(design.garment_options!==undefined&&(!design.garment_options||typeof design.garment_options!=='object'||Array.isArray(design.garment_options)))return 'Unsupported garment options.'
 if(design.decorations!==undefined&&!validDrawing(design.decorations))return 'Invalid decorative drawing.'
 const type=design.garment_type,options=design.garment_options??{},keys=Object.keys(options),format=design.format_version??1
 if(!Object.hasOwn(garmentLabels,type)||![1,2,3].includes(format))return 'Unsupported garment or design format.'
 if(!['round','v','square','none'].includes(design.neckline)||!['sleeveless','short','long','none'].includes(design.sleeve)||!['short','midi','long'].includes(design.length)||!Object.hasOwn(designColours,design.colour))return 'Choose supported garment options.'
 if(!['dress','blouse','skirt'].includes(type)&&format!==3)return 'This garment requires design format 3.'
 const bottom=type==='skirt'||type==='trousers'
 if(bottom?(design.neckline!=='none'||design.sleeve!=='none'):(design.neckline==='none'||design.sleeve==='none'))return 'Choose options relevant to this garment.'
 if(type==='shirt'){
  if(keys.length!==1||!['point','band','none'].includes(options.collar??'')||!['short','long'].includes(design.sleeve))return 'Choose a supported shirt collar and sleeves.'
  if(options.collar!=='none'&&design.neckline!=='round')return 'A collar uses the standard collar opening.'
 }else if(type==='trousers'){
  if(keys.length!==2||!['flat','elastic'].includes(options.waist_style??'')||!['straight','tapered','wide'].includes(options.leg_style??''))return 'Choose a supported waist style and trouser leg.'
 }else if(type==='kurti'||type==='salwar_top'){
  if(keys.length!==1||!['none','short','long'].includes(options.side_slits??''))return 'Choose supported side slits.'
 }else if(keys.length)return 'These options do not apply to this garment.'
 if(design.custom_neckline&&(!supportsNeckline(design)||format<2||!validNeckline(design.custom_neckline)))return 'Invalid custom neckline. Reset to a preset before saving.'
 return ''
}
export function editableDesign(design:DesignFields):DesignFields{return {...(design.back_neckline!==undefined?{back_neckline:design.back_neckline}:{}),...(design.collar_style!==undefined?{collar_style:design.collar_style}:{}),...(design.collar_colour!==undefined?{collar_colour:design.collar_colour}:{}),...(design.refinement_geometry!==undefined?{refinement_geometry:design.refinement_geometry}:{}),...(design.source_reference!==undefined?{source_reference:design.source_reference}:{}),...(design.include_source_reference!==undefined?{include_source_reference:design.include_source_reference}:{}),design_kind:design.design_kind??'garment',notes:design.notes??'',sketch_category:design.sketch_category??null,garment_fill:design.garment_fill??null,name:design.name,garment_type:design.garment_type,colour:design.colour,neckline:design.neckline,sleeve:design.sleeve,length:design.length,format_version:design.format_version??1,custom_neckline:design.custom_neckline??null,garment_options:design.garment_options??{},decorations:design.decorations??emptyDrawing()}}
export function designFingerprint(design:DesignFields){
 // PostgreSQL jsonb can return object keys in a different order. Preserve layer
 // and point array order while comparing object values semantically.
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value
 return JSON.stringify(canonical(editableDesign(design)))
}
export function designLengthLabel(design:Pick<DesignFields,'garment_type'|'length'>){return design.garment_type==='blouse'?{short:'Cropped',midi:'Hip length',long:'Tunic length'}[design.length]:design.garment_type==='trousers'?{short:'Knee length',midi:'Ankle length',long:'Full length'}[design.length]:design.garment_type==='shirt'?{short:'Waist length',midi:'Hip length',long:'Longline'}[design.length]:{short:'Short',midi:'Midi',long:'Long'}[design.length]}
export function designBrowseUrl(id:string){return `/tailors?${new URLSearchParams({design:id})}`}
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export const designService={
 async list(page=0):Promise<CustomerDesign[]>{const{data,error}=await client().from('customer_designs').select('*').order('updated_at',{ascending:false}).order('id').range(page*12,page*12+11);if(error)throw new Error(error.message);return data as CustomerDesign[]},
 async get(id:string):Promise<CustomerDesign|null>{if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Invalid selected design.');const{data,error}=await client().from('customer_designs').select('*').eq('id',id).maybeSingle();if(error)throw new Error(error.message);return data as CustomerDesign|null},
 async save(id:string,fields:DesignFields,version:number|null):Promise<CustomerDesign>{
  const message=validateDesignOptions(fields);if(message)throw new Error(message)
  const payload={name:fields.name,garment_type:fields.garment_type,colour:fields.colour,neckline:fields.neckline,sleeve:fields.sleeve,length:fields.length,...(fields.back_neckline!==undefined?{back_neckline:fields.back_neckline}:{}),...(fields.collar_style!==undefined?{collar_style:fields.collar_style}:{}),...(fields.collar_colour!==undefined?{collar_colour:fields.collar_colour}:{}),...(fields.refinement_geometry!==undefined?{refinement_geometry:fields.refinement_geometry}:{}),...(fields.include_source_reference!==undefined?{include_source_reference:fields.include_source_reference}:{}),...(fields.format_version?{format_version:fields.format_version,custom_neckline:fields.custom_neckline??null}:{}),...(fields.garment_options?{garment_options:fields.garment_options}:{}),...(fields.decorations?{decorations:fields.decorations}:{}),...(fields.design_kind?{design_kind:fields.design_kind}:{}),...(fields.notes!==undefined?{notes:fields.notes}:{}),...(fields.sketch_category!==undefined?{sketch_category:fields.sketch_category}:{}),...(fields.garment_fill!==undefined?{garment_fill:fields.garment_fill}:{})}
  const{data,error}=await client().rpc('save_customer_design',{p_id:id,p_fields:payload,p_expected_version:version});if(error)throw new Error(error.message);return data as CustomerDesign
 },
 async refine(id:string,source:CustomerDesign,fields:DesignFields,indices:number[],keepReference:boolean):Promise<CustomerDesign>{
  const message=validateDesignOptions(fields);if(message)throw new Error(message)
  const {data,error}=await client().rpc('create_refined_design',{p_id:id,p_source_id:source.id,p_source_version:source.version,p_fields:{name:fields.name,design_kind:'garment',format_version:3,garment_type:fields.garment_type,colour:fields.colour,neckline:fields.neckline,sleeve:fields.sleeve,length:fields.length,...(fields.back_neckline!==undefined?{back_neckline:fields.back_neckline}:{}),...(fields.collar_style!==undefined?{collar_style:fields.collar_style}:{}),...(fields.collar_colour!==undefined?{collar_colour:fields.collar_colour}:{}),garment_options:fields.garment_options??{},custom_neckline:fields.custom_neckline??null,decorations:fields.decorations??emptyDrawing(2),refinement_geometry:fields.refinement_geometry},p_outline_indices:indices,p_keep_reference:keepReference,p_confirm:true})
  if(error)throw new Error(error.message);return data as CustomerDesign
 },
 async remove(design:CustomerDesign){const{error}=await client().rpc('delete_customer_design',{p_id:design.id,p_expected_version:design.version});if(error)throw new Error(error.message)},
 async snapshot(id:string):Promise<DesignSnapshot|null>{const{data,error}=await client().from('request_design_snapshots').select('*').eq('request_id',id).maybeSingle();if(error)throw new Error(error.message);return data as DesignSnapshot|null},
}
