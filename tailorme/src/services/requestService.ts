import type {ReferenceSelection} from './requestReferenceService'
import type { MeasurementShare } from './measurementService'
import { supabase, configurationError } from '../lib/supabase'
export type RequestFields = { garment_type: string; description: string; quantity: number; preferred_date: string }
export type TailoringRequest = RequestFields & { progress_stage: import('./progressService').WorkStage | null; work_stage: import('./progressService').WorkStage | null; confirmed_date: string | null; confirmed_at: string | null; completed_at: string | null; deadline_revision: number; id: string; customer_id: string; tailor_id: string; customer_name: string; shop_name: string; status: 'pending' | 'accepted' | 'rejected' | 'cancelled'; rejection_reason: string | null; version: number; created_at: string; updated_at: string; responded_at: string | null; cancelled_at: string | null }
function client() { if (!supabase) throw new Error(configurationError ?? 'Authentication unavailable.'); return supabase }
export function requestToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{ timeZone: 'Asia/Colombo',year: 'numeric',month: '2-digit',day: '2-digit' }).format(now) }
export function validateRequest(fields: RequestFields) {
  if (!fields.garment_type.trim() || [...fields.garment_type.trim()].length > 100) return 'Enter a garment type (1–100 characters).'
  if ([...fields.description.trim()].length < 10 || [...fields.description.trim()].length > 4000) return 'Describe your request in 10–4,000 characters.'
  if (!Number.isInteger(fields.quantity) || fields.quantity < 1 || fields.quantity > 100) return 'Enter a whole quantity from 1 to 100.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.preferred_date) || Number.isNaN(Date.parse(fields.preferred_date)) || new Date(fields.preferred_date).toISOString().slice(0,10) !== fields.preferred_date || fields.preferred_date <= requestToday()) return 'Choose a future preferred completion date (Sri Lanka time).'
  return ''
}
export function requestDefinitelyRejected(cause: unknown) {
  return !!cause && typeof cause === 'object' && 'code' in cause && ['22023','23514','23502','42501'].includes(String(cause.code))
}
export type RequestFilter = TailoringRequest['status'] | 'all' | 'active' | 'due' | 'overdue'
export function filteredRequests(filter:RequestFilter, today=requestToday(), countOnly=false) {
 let query=client().from('tailoring_requests').select('*',countOnly?{count:'exact',head:true}:{})
 if (['active','due','overdue'].includes(filter)) {
  query=query.eq('status','accepted').is('completed_at',null)
  if(filter==='due') query=query.eq('confirmed_date',today)
  if(filter==='overdue') query=query.lt('confirmed_date',today)
 } else if(filter!=='all') query=query.eq('status',filter)
 return query
}
export const requestService = {
  async send(id: string, tailorId: string, fields: RequestFields, design?: {id:string;version:number}, measurements?: MeasurementShare, references?: ReferenceSelection): Promise<TailoringRequest> {
    const { data,error } = await client().rpc(references?.items.length ? 'send_tailoring_request_with_references' : 'send_tailoring_request_with_measurements',{ p_id: id,p_tailor_id: tailorId,p_garment_type: fields.garment_type,p_description: fields.description,p_quantity: fields.quantity,p_preferred_date: fields.preferred_date,...(references?.items.length?{p_references:references.items,p_reference_batch:references.batch}:{}),p_share: !!measurements,p_values: measurements?.values_cm ?? null,p_measured_on: measurements?.measured_on ?? null,...(design ? {p_design_id:design.id,p_design_version:design.version} : {}) })
    if (error) throw Object.assign(new Error(error.message),{ code: error.code })
    return data as TailoringRequest
  },
  async list(page: number, status: RequestFilter = 'all', participant?:{userId:string;side:'requester'|'provider'}): Promise<TailoringRequest[]> {
    let query = filteredRequests(status)
    if(participant)query=query.eq(participant.side==='provider'?'tailor_id':'customer_id',participant.userId)
    const { data,error } = await query.order('created_at',{ ascending: false }).order('id').range(page*20,page*20+19)
    if (error) throw new Error(error.message)
    return data as TailoringRequest[]
  },
  async get(id: string): Promise<TailoringRequest | null> {
    const { data,error } = await client().from('tailoring_requests').select('*').eq('id',id).maybeSingle()
    if (error) throw new Error(error.message)
    return data as TailoringRequest | null
  },
  async decide(request: TailoringRequest, status: 'accepted' | 'rejected' | 'cancelled', reason = ''): Promise<TailoringRequest> {
    const { data,error } = await client().rpc('decide_tailoring_request',{ p_id: request.id,p_status: status,p_reason: reason,p_expected_version: request.version })
    if (error) throw new Error(error.message)
    return data as TailoringRequest
  },
}
