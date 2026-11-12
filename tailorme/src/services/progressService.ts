import { supabase } from '../lib/supabase'
import type { TailoringRequest } from './requestService'
export const workStages=['confirmed','designing','stitching','fitting','ready','completed'] as const
export type WorkStage=typeof workStages[number]
export type ProgressEvent={id:string;from_stage:WorkStage|null;to_stage:WorkStage;actor_id:string;changed_at:string;note:string;request_version:number}
export function stageLabel(stage:string|null|undefined){return stage?stage[0].toUpperCase()+stage.slice(1):'Not started'}
export function availableStages(stage:WorkStage|null,completed:boolean){return completed?[]:stage?workStages.slice(workStages.indexOf(stage)+1):['confirmed'] as WorkStage[]}
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export const progressService={
 async load(id:string):Promise<{events:ProgressEvent[];eligible:boolean}>{const [history,agreement]=await Promise.all([client().from('request_progress_history').select('*').eq('request_id',id).order('request_version'),client().from('request_quote_agreements').select('request_id').eq('request_id',id).maybeSingle()]);if(history.error||agreement.error)throw new Error('Unable to load progress. Refresh to retry.');return{events:history.data as ProgressEvent[],eligible:!!agreement.data}},
 async advance(request:TailoringRequest,stage:WorkStage,note:string,confirmed:boolean):Promise<TailoringRequest>{
 const {data,error}=stage==='completed'?await client().rpc('complete_tailoring_request',{p_id:request.id,p_expected_version:request.version,p_note:note,p_confirmed:confirmed}):await client().rpc('advance_request_progress',{p_id:request.id,p_stage:stage,p_note:note,p_expected_version:request.version,p_confirm_completed:false});if(error)throw new Error(error.message);return data as TailoringRequest
 },
}
