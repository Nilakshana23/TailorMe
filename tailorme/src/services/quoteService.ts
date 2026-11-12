import { supabase } from '../lib/supabase'
import type { TailoringRequest } from './requestService'
export type QuoteFields = { stitching: string; material: string; other: string; other_explanation: string; notes: string }
export type Quotation = QuoteFields & { id: string; request_id: string; quote_number: number; currency: 'LKR'; total: string; status: 'outstanding'|'withdrawn'|'accepted'|'declined'; version: number; created_at: string; answered_at: string | null }
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export function exactCharge(value: string): string {
 const match=/^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(value.trim())
 if(!match)throw new Error('Use nonnegative charges with no more than 2 decimal places (up to 999999999.99).')
 return `${match[1].replace(/^0+(?=\d)/,'')}.${(match[2]??'').padEnd(2,'0')}`
}
export function quoteFields(fields: QuoteFields): QuoteFields {
 const result={...fields,stitching:exactCharge(fields.stitching),material:exactCharge(fields.material),other:exactCharge(fields.other)}
 if([result.stitching,result.material,result.other].every(value=>/^0\.00$/.test(value)))throw new Error('The quotation total must be positive.')
 if(result.other!=='0.00'&&!result.other_explanation.trim())throw new Error('Explain the other charges.')
 if(result.other_explanation.length>1000||result.notes.length>2000)throw new Error('Keep the explanation under 1,001 characters and notes under 2,001 characters.')
 return result
}
export function lkr(value: string) { const [whole,decimal]=value.split('.');return `LKR ${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${decimal??'00'}` }
export const quoteService={
 async list(requestId: string):Promise<Quotation[]>{const {data,error}=await client().from('quotation_details').select('*').eq('request_id',requestId).order('quote_number',{ascending:false});if(error)throw new Error(error.message);return data as Quotation[]},
 async send(id:string,request:TailoringRequest,fields:QuoteFields){const {error}=await client().rpc('send_request_quotation',{p_id:id,p_request_id:request.id,p_expected_request_version:request.version,p_stitching:fields.stitching,p_material:fields.material,p_other:fields.other,p_other_explanation:fields.other_explanation,p_notes:fields.notes});if(error)throw Object.assign(new Error(error.message),{code:error.code})},
 async answer(quote:Quotation,status:'accepted'|'declined'|'withdrawn'){const {error}=await client().rpc('answer_request_quotation',{p_id:quote.id,p_status:status,p_expected_version:quote.version});if(error)throw new Error(error.message)},
}
