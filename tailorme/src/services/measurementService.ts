import {supabase,configurationError} from '../lib/supabase'
import type {Measurements} from '../utils/measurements'
export type MeasurementProfile={owner_id:string;values_cm:Measurements;measured_on:string;updated_at:string}
export type MeasurementShare=Pick<MeasurementProfile,'values_cm'|'measured_on'>
export type MeasurementSnapshot=MeasurementShare&{request_id:string;consented_at:string;snapshot_version:number}
function client(){if(!supabase)throw new Error(configurationError??'Authentication unavailable.');return supabase}
export const measurementService={
 async get():Promise<MeasurementProfile|null>{const {data,error}=await client().from('customer_measurements').select('*').maybeSingle();if(error)throw error;return data},
 async save(values:Measurements,date:string):Promise<MeasurementProfile>{const {data,error}=await client().rpc('save_customer_measurements',{p_values:values,p_measured_on:date});if(error)throw error;return data},
 async remove(owner:string){const {error}=await client().from('customer_measurements').delete().eq('owner_id',owner);if(error)throw error},
 async snapshot(id:string):Promise<MeasurementSnapshot|null>{const {data,error}=await client().from('request_measurement_snapshots').select('*').eq('request_id',id).maybeSingle();if(error)throw error;return data},
}
