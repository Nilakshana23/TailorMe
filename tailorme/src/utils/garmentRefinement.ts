import type {DesignDrawing} from './designDrawing'
import {validDrawing} from './designDrawing'
import type {DesignFields} from '../services/designService'
import type {PreviewShape} from './previewShape'

export type RefinementGeometry={shoulder:number;waist:number;hem:number;sleeve_width:number;sleeve_length:number;waist_y:number;hem_y:number}
export const refinementLimits={shoulder:[32,48],waist:[22,42],hem:[35,95],sleeve_width:[20,48],sleeve_length:[60,220],waist_y:[175,210],hem_y:[280,440]} as const
export const silhouettePresets={straight:{label:'Straight',waist:35,hem:35},a_line:{label:'A-line',waist:30,hem:55},flared:{label:'Flared',waist:30,hem:80}} as const
export function refinementSilhouette(g:RefinementGeometry){return Object.entries(silhouettePresets).find(([,p])=>p.waist===g.waist&&p.hem===g.hem)?.[0]??'custom'}
export function applyRefinementSilhouette(fields:DesignFields,preset:keyof typeof silhouettePresets):DesignFields {
 if(!fields.refinement_geometry||fields.garment_type==='trousers'||!Object.hasOwn(silhouettePresets,preset))throw new Error('Choose a silhouette for a refined top or skirt. Use leg style for trousers.')
 const p=silhouettePresets[preset]
 return {...fields,refinement_geometry:{...fields.refinement_geometry,waist:p.waist,hem:p.hem}}
}
export function validRefinementGeometry(value:unknown):value is RefinementGeometry {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,unknown>
 return Object.keys(v).length===7&&Object.entries(refinementLimits).every(([key,[min,max]])=>typeof v[key]==='number'&&Number.isFinite(v[key])&&Number.isInteger(v[key])&&(v[key] as number)>=min&&(v[key] as number)<=max)
}
export function outlineBounds(drawing:DesignDrawing,indices:number[]){
 if(!validDrawing(drawing)||!indices.length||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>=drawing.strokes.length))throw new Error('Choose the strokes that form the garment outline. Leave decorations unselected.')
 const points=indices.flatMap(i=>drawing.strokes[i].points),xs=points.map(p=>p[0]*.032),ys=points.map(p=>p[1]*.048)
 const x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y
 if(width<8||height<12)throw new Error('Select an outline with both width and height, not a tiny mark or straight line.')
 return {x,y,width,height}
}
export function initialRefinementGeometry(drawing:DesignDrawing,indices:number[]):RefinementGeometry {
 const b=outlineBounds(drawing,indices),clamp=(n:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,n)))
 // Bounding-box proportions only. No stroke classification or shape recognition.
 const ratio=b.width/b.height
 return {shoulder:clamp(ratio*85,32,48),waist:clamp(ratio*65,22,42),hem:clamp(ratio*130,35,95),sleeve_width:32,sleeve_length:120,waist_y:195,hem_y:clamp(b.height,280,440)}
}
export function refinementShape(design:DesignFields,geometry:RefinementGeometry):PreviewShape {
 if(!validRefinementGeometry(geometry))throw new Error('Invalid template refinement proportions.')
 const side={shoulder:geometry.shoulder,underarm:30,waist:geometry.waist,hem:geometry.hem,sleeveWidth:geometry.sleeve_width,sleeveLength:geometry.sleeve_length}
 return {left:{...side},right:{...side},underarmY:130,waistY:design.garment_type==='skirt'?140:geometry.waist_y,hemY:geometry.hem_y}
}
