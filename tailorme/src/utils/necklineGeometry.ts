// Format 2: five fixed x anchors, three editable depths. Horizontal cubic
// tangents keep every segment inside its convex hull and strictly x-monotone.
// No paths, markup, URLs or executable SVG are accepted as design data.
export type CustomNeckline = {depths: number[]}
export const necklineX = [143,151.5,160,168.5,177] as const
export function validNeckline(value: unknown): value is CustomNeckline {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false
 const object = value as Record<string,unknown>
 return Object.keys(object).length===1 && Array.isArray(object.depths) && object.depths.length===5 &&
  object.depths.every(y=>typeof y==='number' && Number.isFinite(y) && y>=65 && y<=120 && Number.isInteger(y*10)) &&
  object.depths[0]===65 && object.depths[4]===65 && object.depths.slice(1,4).some(y=>y>65)
}
export function customNecklinePath(value: CustomNeckline): string {
 if (!validNeckline(value)) throw new Error('Invalid custom neckline. Reset to a preset neckline.')
 return necklineX.slice(1).map((x,i)=>`C${necklineX[i]+(x-necklineX[i])/3} ${value.depths[i]} ${x-(x-necklineX[i])/3} ${value.depths[i+1]} ${x} ${value.depths[i+1]}`).join(' ')
}
export function presetNecklinePath(preset: string) {
 return preset==='v'?'L160 110 L177 65':preset==='square'?'L143 95 L177 95 L177 65':'Q160 100 177 65'
}
export function initialNeckline(preset: string): CustomNeckline {
 return {depths:preset==='v'?[65,88,110,88,65]:preset==='square'?[65,95,95,95,65]:[65,78,83,78,65]}
}
export type NecklinePoint = {x:number;y:number}
export function drawingToNeckline(points: NecklinePoint[], symmetric: boolean): CustomNeckline {
 const message='Draw once from the left anchor to the right anchor inside the marked region, without crossing back.'
 if(points.length<3 || points.length>2048 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<143||p.x>177||p.y<65||p.y>120) ||
  Math.abs(points[0].x-143)>3 || Math.abs(points.at(-1)!.x-177)>3 || points.some((p,i)=>i>0&&p.x<points[i-1].x)) throw new Error(message)
 const depths=necklineX.map((x,i)=>{
  if(i===0||i===4)return 65
  const index=points.findIndex(p=>p.x>=x)
  if(index<1)throw new Error(message)
  const a=points[index-1],b=points[index]
  return Math.round((a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x))*10)/10
 })
 if(symmetric)depths[3]=depths[1]=Math.round((depths[1]+depths[3])*5)/10
 const result={depths}
 if(!validNeckline(result))throw new Error('The neckline needs some depth inside the marked region.')
 return result
}
export function changeNecklineDepth(value:CustomNeckline,index:number,y:number,symmetric:boolean):CustomNeckline {
 const depths=[...value.depths]
 if(index<1||index>3||!Number.isFinite(y)||y<65||y>120)throw new Error('Keep control points inside the marked neckline region (65–120).')
 depths[index]=Math.round(y*10)/10
 if(symmetric)depths[4-index]=depths[index]
 const result={depths}
 if(!validNeckline(result))throw new Error('The neckline needs some depth inside the marked region.')
 return result
}

// The SVG cubic uses equally spaced x controls, so x is linear in t.
// Its horizontal y tangents give this exact smoothstep interpolation.
export function customNecklineDepthAt(value:CustomNeckline,x:number):number{
 if(!validNeckline(value)||!Number.isFinite(x)||x<necklineX[0]||x>necklineX[4])throw new Error('Invalid custom neckline coordinates. Reapply a valid curve or reset to a preset.')
 const segment=Math.min(3,Math.floor((x-necklineX[0])/8.5)),t=(x-necklineX[segment])/8.5
 return value.depths[segment]+(value.depths[segment+1]-value.depths[segment])*t*t*(3-2*t)
}
