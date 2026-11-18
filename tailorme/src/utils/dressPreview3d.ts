import {legacyBack} from './backNeckline'
import type {DesignFields} from '../services/designService'
import {designColours} from '../services/designService'
import type {PresetNeckline} from './dressNecklineMesh'

export type IllustrationSilhouette='straight'|'a-line'|'flared'
export const silhouetteWidths:Record<IllustrationSilhouette,number>={straight:.33,'a-line':.53,flared:.76}
export function dressPreviewSpec(design:DesignFields){
 if(design.design_kind==='sketch'||!['dress','blouse','skirt','shirt','trousers','kurti','salwar_top'].includes(design.garment_type))return null
 return {garment:design.garment_type,options:design.garment_options??{},custom:design.custom_neckline??null,back:design.garment_type==='dress'?design.back_neckline??legacyBack:legacyBack,sleeve:design.sleeve,colour:design.garment_fill??designColours[design.colour],length:design.length,neckline:(['round','v','square'].includes(design.neckline)?design.neckline:'round') as PresetNeckline}
}
export function omittedPreviewDetails(design:DesignFields){
 return [
  ...(!['skirt','trousers'].includes(design.garment_type)&&design.neckline==='none'&&!design.custom_neckline?['No-neckline option (3D shows a round preset)']:[]),
  ...(!['skirt','trousers'].includes(design.garment_type)&&design.sleeve==='none'?['Unsupported sleeve option (3D shows sleeveless)']:[]),
  ...((design.collar_style&&design.collar_style!=='none')||(design.garment_type==='shirt'&&design.collar_style==null&&design.garment_options?.collar!=='none'&&design.garment_options?.collar!=null)?['Collar shape and colour']:[]),
  ...(design.decorations?.strokes.length?['Drawings, decorations, fills and artwork layer order']:[]),
  ...(design.refinement_geometry?['Custom refinement proportions and silhouette']:[]),
  ...(['kurti','salwar_top'].includes(design.garment_type)?['Darts and stitching details']:[]),
  ...(design.garment_type==='trousers'?['Fly, pocket and stitching details']:[]),
 ]
}
export function dressProfile(length:DesignFields['length'],silhouette:IllustrationSilhouette){
 const hem={short:-.48,midi:-.90,long:-1.25}[length]
 return [[.82,.16,.13],[.66,.31,.19],[.39,.28,.18],[.15,.23,.16],[-.08,.32,.21],[hem,silhouetteWidths[silhouette],silhouetteWidths[silhouette]*.65]]
}
