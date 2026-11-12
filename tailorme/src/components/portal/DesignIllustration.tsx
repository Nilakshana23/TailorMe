import {collarPaths,collarLabels,effectiveCollar} from '../../utils/collars'
import {refinementShape} from '../../utils/garmentRefinement'
import ArtworkLayer from './ArtworkLayer'
import {warpIllustrationPath} from '../../utils/stylingAlignment'
import type {PreviewWarp} from '../../utils/stylingAlignment'
import {defaultPreviewShape,shapedGarmentPaths,validatePreviewShape} from '../../utils/previewShape'
import type {PreviewShape} from '../../utils/previewShape'
import {customNecklinePath,presetNecklinePath,validNeckline} from '../../utils/necklineGeometry'
import {useId} from 'react'
import {designColours,designLengthLabel,garmentLabels,validateDesignOptions} from '../../services/designService'
import type {DesignFields} from '../../services/designService'
export default function DesignIllustration({design,details=true,illustrationOnly=false,previewWarp=null,previewShape=null,selectedDrawingStroke=null,canvasBackground='#f3e6ce'}:{design:DesignFields;details?:boolean;illustrationOnly?:boolean;previewWarp?:PreviewWarp|null;previewShape?:PreviewShape|null;selectedDrawingStroke?:number|null;canvasBackground?:string}){
 const title=useId();const fill=design.garment_fill??designColours[design.colour]
 const path=(value:string)=>previewWarp?warpIllustrationPath(value,previewWarp):value
 const hem=design.garment_type==='blouse'?{short:195,midi:250,long:310}[design.length]:{short:300,midi:370,long:440}[design.length]
 const custom=validNeckline(design.custom_neckline)&&(design.format_version===2||design.format_version===3)
 if(validateDesignOptions(design))return <p role="alert">Unsupported design geometry or garment options. Reopen the design or reset its neckline before continuing.</p>
 if(design.design_kind==='sketch')return <figure className="design-illustration"><svg viewBox="0 0 320 480" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby={title}><title id={title}>{`${design.name||'Untitled sketch'} - Customer design reference`}</title><rect width="320" height="480" fill={canvasBackground}/><ArtworkLayer drawing={design.decorations!} selected={selectedDrawingStroke}/></svg>{!illustrationOnly&&<figcaption><p className="font-semibold">Customer design reference</p><p>{design.name||'Untitled sketch'}</p><p>Category: {design.sketch_category?garmentLabels[design.sketch_category]:'Not specified'}</p><p className="text-sm">Visual instructions for discussion with your tailor. Construction, measurements and feasibility need tailor review.</p>{design.notes&&<p className="whitespace-pre-wrap break-words">{design.notes}</p>}</figcaption>}</figure>
 if(previewShape&&validatePreviewShape(previewShape,design,previewWarp))return <p role="alert">This preview shape cannot be drawn safely with the current alignment. Reset the preview shape or adjust the alignment.</p>
 const shaped=previewShape?shapedGarmentPaths(design,previewShape):design.refinement_geometry?shapedGarmentPaths(design,refinementShape(design,design.refinement_geometry)):['shirt','trousers','kurti','salwar_top'].includes(design.garment_type)?shapedGarmentPaths(design,defaultPreviewShape(design)):null
 const neck=custom?customNecklinePath(design.custom_neckline!):presetNecklinePath(design.neckline)
 const skirt=design.garment_type==='skirt'
 const body=design.garment_type==='blouse'?`M120 65 L143 65 ${neck} L200 65 Q202 100 190 130 L195 ${hem} L125 ${hem} L130 130 Q118 100 120 65Z`:`M120 65 L143 65 ${neck} L200 65 Q202 100 190 130 L190 195 L235 ${hem} L85 ${hem} L130 195 L130 130 Q118 100 120 65Z`
 const bottom=skirt||design.garment_type==='trousers'
 const summary=`${garmentLabels[design.garment_type]}, ${design.garment_fill??design.colour}, ${bottom?'no neckline or sleeves':`${custom?'custom':design.neckline} neckline, ${design.sleeve} sleeves`}, ${designLengthLabel(design)}, ${collarLabels[effectiveCollar(design)]}${Object.entries(design.garment_options??{}).map(([key,value])=>`, ${key.replaceAll('_',' ')}: ${value}`).join('')}`
 const collar=design.collar_style!=null?collarPaths(design.collar_style):[],collarFill=design.collar_colour??fill
 const strokes=design.decorations?.strokes??[],clip=`${title}-drawing-clip`
 const silhouette=shaped?[...shaped.sleeves,shaped.body,...shaped.filledDetails]:[
  ...(!skirt&&design.sleeve==='short'?['M120 65 L85 78 L65 135 L103 148 L130 115Z','M200 65 L235 78 L255 135 L217 148 L190 115Z']:!skirt&&design.sleeve==='long'?['M120 65 L85 90 L55 240 L95 250 L130 115Z','M200 65 L235 90 L265 240 L225 250 L190 115Z']:[]),skirt?`M130 140 L190 140 L235 ${hem} L85 ${hem}Z`:body]
 return <figure className="design-illustration">{!illustrationOnly&&<figcaption className="font-semibold mb-4">Design illustration</figcaption>}<svg viewBox={previewWarp?'0 0 100 100':'0 0 320 480'} preserveAspectRatio={previewWarp?'none':'xMidYMid meet'} role="img" aria-labelledby={title}><title id={title}>{summary}</title><g fill={fill} stroke="#3c3438" strokeWidth={previewWarp?0.45:2} strokeLinejoin="round">
 {shaped?<>
 {shaped.sleeves.map((sleeve,index)=><path key={index} d={path(sleeve)}/>)}<path d={path(shaped.body)}/>
 {shaped.filledDetails.map((detail,index)=><path key={`filled-${index}`} d={path(detail)}/>)}
 {shaped.seam&&<path d={path(shaped.seam)} fill="none"/>}
 <g fill="none" strokeOpacity=".35">{shaped.details.map((detail,index)=><path key={index} d={path(detail)}/>)}</g>
 </>:<>
 {!skirt&&design.sleeve==='short'&&<g><path d={path('M120 65 L85 78 L65 135 L103 148 L130 115Z')}/><path d={path('M200 65 L235 78 L255 135 L217 148 L190 115Z')}/></g>}
 {!skirt&&design.sleeve==='long'&&<g><path d={path('M120 65 L85 90 L55 240 L95 250 L130 115Z')}/><path d={path('M200 65 L235 90 L265 240 L225 250 L190 115Z')}/></g>}
 {skirt?<><path d={path(`M130 140 L190 140 L235 ${hem} L85 ${hem}Z`)}/><path d={path('M130 155 H190')} fill="none"/></>:<path d={path(body)}/>}
 {design.garment_type==='dress'&&<path d={path('M130 195 H190')} fill="none"/>}
 {design.garment_type!=='blouse'&&<g fill="none" strokeOpacity=".35"><path d={path(`M145 ${skirt?155:200} L130 ${hem-10}`)}/><path d={path(`M175 ${skirt?155:200} L190 ${hem-10}`)}/></g>}
 </>}
 </g>
 {collar.length>0&&<g data-collar-style={design.collar_style} fill={collarFill} stroke="#3c3438" strokeWidth={previewWarp?0.45:2} strokeLinejoin="round">{collar.map((d,i)=><path key={i} d={path(d)}/>)}</g>}
 {strokes.length>0&&<>{strokes.some(stroke=>stroke.mode!=='canvas')&&<defs><clipPath id={clip} clipPathUnits="userSpaceOnUse">{[...silhouette,...collar].map((d,index)=><path key={index} d={path(d)}/>)}</clipPath></defs>}<ArtworkLayer drawing={design.decorations!} clipId={clip} warp={previewWarp} selected={selectedDrawingStroke}/></>}
 </svg>{!illustrationOnly&&<p className="text-sm text-on-surface-variant mt-3">A garment illustration, not a prediction of body fit or measurements. Virtual try-on is not available.</p>}
 {details&&!illustrationOnly&&<dl className="design-summary mt-4">{[['Garment',garmentLabels[design.garment_type]],['Colour',design.garment_fill??design.colour],...(!bottom?[['Neckline',custom?'Custom curve':design.neckline],['Sleeves',design.sleeve]]:[]),['Length',designLengthLabel(design)],...(!bottom?[['Collar',collarLabels[effectiveCollar(design)]],['Collar colour',design.collar_colour??'Matches garment']]:[]),...Object.entries(design.garment_options??{}).map(([key,value])=>[key.replaceAll('_',' '),value])].map(([label,value])=><div key={label}><dt className="capitalize">{label}</dt><dd className="capitalize">{value}</dd></div>)}</dl>}
 </figure>
}

