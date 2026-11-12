export const measurementFields = [
 ['shoulder_width','Shoulder width','width',10,100,'Across the back, from one shoulder tip to the other.'],
 ['bust_chest','Bust/chest circumference','circumference',30,300,'Around the fullest part of the chest, with the tape level.'],
 ['waist','Waist circumference','circumference',20,300,'Around the natural waist; relax and breathe normally.'],
 ['hip','Hip circumference','circumference',30,300,'Around the fullest part of the hips, feet together.'],
 ['sleeve_length','Sleeve length','length',1,120,'From shoulder tip to desired cuff, elbow slightly bent.'],
 ['upper_arm','Upper-arm circumference','circumference',5,100,'Around the fullest upper arm, with the arm relaxed.'],
 ['top_length','Top length','length',10,200,'From the high shoulder beside the neck to the desired top hem.'],
 ['dress_length','Dress length','length',20,250,'From the high shoulder beside the neck to the desired dress hem.'],
 ['trouser_length','Trouser length','length',10,180,'Down the outside leg, from the waist to the desired hem.'],
 ['inseam','Inseam','length',5,140,'Along the inside leg, from crotch to desired trouser hem.'],
] as const
export type MeasurementKey = typeof measurementFields[number][0]
export type Measurements = Partial<Record<MeasurementKey,number>>
export type MeasurementUnit = 'cm'|'in'
export function displayMeasurement(cm:number,unit:MeasurementUnit) { return String(Number((unit==='cm'?cm:cm/2.54).toFixed(4))) }
export function canonicalMeasurement(value:string,unit:MeasurementUnit) { return Math.round(Number(value)*(unit==='in'?2.54:1)*100)/100 }
export function validateMeasurements(values:Measurements) {
 for(const [key,value] of Object.entries(values)) {
  const field=measurementFields.find(f=>f[0]===key)
  if(!field || !Number.isFinite(value) || value<field[3] || value>field[4] || Math.abs(value*100-Math.round(value*100))>1e-8) return 'Enter valid measurements within the displayed bounds (up to 2 decimal places in cm).'
 }
 return ''
}
