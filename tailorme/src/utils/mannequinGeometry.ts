// Shared renderer coordinates. Arms are vertical ellipsoids, with no rotation.
export const mannequinArm={x:.37,y:.28,z:0,width:.085,height:.47,depth:.09} as const
export const sleeveRadius={x:.105,z:.125} as const

// Preview-only taper; always wider than the arm's ellipsoid along the shaft.
export function sleeveSectionRadius(sleeve:'short'|'long',height:number){
 const cuffY=sleeve==='short'?.35:-.16,t=Math.max(0,Math.min(1,(.52-height)/(.52-cuffY)))
 const cuff=sleeve==='short'?{x:.098,z:.112}:{x:.075,z:.09}
 return {x:sleeveRadius.x+(cuff.x-sleeveRadius.x)*t,z:sleeveRadius.z+(cuff.z-sleeveRadius.z)*t}
}
