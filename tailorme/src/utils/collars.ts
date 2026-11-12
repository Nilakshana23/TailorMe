import type {DesignFields} from '../services/designService'
import {validHex} from './designDrawing'
export const collarLabels={none:'None',shirt:'Shirt collar',stand:'Mandarin/stand collar',peter_pan:'Peter Pan collar'} as const
export type CollarStyle=keyof typeof collarLabels
export function effectiveCollar(design:DesignFields):CollarStyle {
 if(design.collar_style!=null)return design.collar_style
 // Keep explicitly collared legacy shirts visually unchanged.
 return design.garment_type==='shirt'?design.garment_options?.collar==='point'?'shirt':design.garment_options?.collar==='band'?'stand':'none':'none'
}
export function supportsCollar(design:DesignFields){return design.design_kind!=='sketch'&&['dress','blouse','shirt','kurti','salwar_top'].includes(design.garment_type)}
export function collarCompatibility(design:DesignFields,style:CollarStyle):string {
 if(!Object.hasOwn(collarLabels,style))return 'Choose a supported collar style.'
 if(style==='none')return ''
 if(!supportsCollar(design))return 'Collars are available on top garments only.'
 if(design.custom_neckline||design.neckline!=='round')return 'This collar follows a round preset opening. Choose a round neckline before applying it; custom curves, V and square openings are not supported with a collar.'
 return ''
}
export function validateCollar(design:DesignFields){
 if(design.collar_style==null)return design.collar_colour!=null?'Choose a collar before setting its colour.':''
 const message=collarCompatibility(design,design.collar_style)
 if(message)return message
 if(design.collar_colour!=null&&(!validHex(design.collar_colour)||design.collar_style==='none'))return 'Choose a valid collar colour (#RRGGBB) or match the garment.'
 if(design.collar_style!=='none'&&!supportsCollar(design))return 'Collars are available on top garments only.'
 if(design.garment_type==='shirt'&&design.garment_options?.collar!=='none')return 'Use the separate Collar style control for this shirt.'
 return ''
}
// Fixed, bounded paths share the existing neck endpoints (143,65) and (177,65).
// Each leaf borders the round neck curve instead of filling over the opening.
export function collarPaths(style:CollarStyle):string[]{
 if(!Object.hasOwn(collarLabels,style))throw new Error('Choose a supported collar style.')
 if(style==='none')return []
 if(style==='shirt')return ['M143 65 Q151.5 82.5 160 82.5 L150 104 L133 76Z','M177 65 Q168.5 82.5 160 82.5 L170 104 L187 76Z']
 if(style==='stand')return ['M143 65 Q160 100 177 65 L177 56 Q160 88 143 56Z']
 return ['M143 65 Q151.5 82.5 160 82.5 Q148 104 136 90 Q126 78 143 65Z','M177 65 Q168.5 82.5 160 82.5 Q172 104 184 90 Q194 78 177 65Z']
}
