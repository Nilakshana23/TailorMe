export type BackNeckline={version:1;preset:'round'|'v'|'square';depth:number;width:number}
// Legacy back: shallow quadratic opening, matching the original 3D shell.
export const legacyBack:BackNeckline={version:1,preset:'round',depth:7.2222222222,width:34}
export function validBackNeckline(value:unknown):value is BackNeckline{
 if(!value||typeof value!=='object')return false
 const b=value as BackNeckline
 return Object.keys(b).length===4&&b.version===1&&['round','v','square'].includes(b.preset)&&Number.isFinite(b.depth)&&b.depth>=4&&b.depth<=45&&Number.isFinite(b.width)&&b.width>=20&&b.width<=42
}
export function backNecklinePath(b:BackNeckline){const left=160-b.width/2,right=160+b.width/2,y=65+b.depth;return 'L'+left+' 65 '+(b.preset==='round'?'Q160 '+(65+b.depth*2)+' '+right+' 65':b.preset==='v'?'L160 '+y+' L'+right+' 65':'L'+left+' '+y+' L'+right+' '+y+' L'+right+' 65')}
