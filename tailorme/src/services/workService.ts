import { supabase } from '../lib/supabase'
import type { TailoringRequest } from './requestService'
import { filteredRequests, requestToday } from './requestService'
export type DeadlineChange = { id: string; previous_date: string | null; confirmed_date: string; changed_at: string; revision: number }
export type RequestNotification = { id: string; request_id: string; request?:{customer_id:string;tailor_id:string}; kind: 'two_days' | 'due_today' | 'quote_sent' | 'quote_accepted' | 'quote_declined' | 'stage_changed' | 'message_received' | 'design_proposed' | 'design_accepted' | 'design_declined' | 'design_withdrawn' | 'payment_reported' | 'payment_confirmed' | 'payment_rejected'; confirmed_date: string | null; created_at: string; read_at: string | null }
function client() { if (!supabase) throw new Error('Authentication unavailable.'); return supabase }
async function rpc<T>(name: string,args: object): Promise<T> { const { data,error }=await client().rpc(name,args); if(error) throw new Error(error.message); return data as T }
export function deadlineGroup(request: TailoringRequest,today=requestToday()) { return request.status!=='accepted' || request.completed_at ? 'inactive' : !request.confirmed_date ? 'unscheduled' : request.confirmed_date<today ? 'overdue' : 'upcoming' }
export const workService = {
 async overview(userId:string) {
  const today=requestToday()
  const counts=await Promise.all((['pending','active','due','overdue'] as const).map(async filter=>{
   const {count,error}=await filteredRequests(filter,today,true).eq('tailor_id',userId)
   if(error || count===null) throw new Error('Unable to load request summaries.')
   return count
  }))
  const {data,error}=await filteredRequests('active',today).eq('tailor_id',userId).not('confirmed_date','is',null).order('confirmed_date',{ascending:true}).order('id').limit(6)
  if(error) throw new Error(error.message)
  return {counts,priority:data as TailoringRequest[]}
 },
 confirm: (request: TailoringRequest,date: string) => rpc<TailoringRequest>('set_request_confirmed_date',{ p_id: request.id,p_date: date,p_expected_version: request.version }),
 async history(id: string): Promise<DeadlineChange[]> { const {data,error}=await client().from('request_deadline_history').select('*').eq('request_id',id).order('revision',{ascending:false}); if(error) throw new Error(error.message); return data as DeadlineChange[] },
 async dashboard(userId: string,group: 'accepted' | 'upcoming' | 'overdue'): Promise<TailoringRequest[]> {
  let query=client().from('tailoring_requests').select('*').eq('tailor_id',userId).eq('status','accepted').is('completed_at',null)
  if(group==='upcoming') query=query.gte('confirmed_date',requestToday())
  if(group==='overdue') query=query.lt('confirmed_date',requestToday())
  const {data,error}=await query.order('confirmed_date',{ascending:true,nullsFirst:false}).order('id').limit(10)
  if(error) throw new Error(error.message); return data as TailoringRequest[]
 },
 async notifications(page: number): Promise<{rows: RequestNotification[]; unread: number}> {
  const [list,count]=await Promise.all([client().from('request_notifications').select('*,request:tailoring_requests(customer_id,tailor_id)').is('invalidated_at',null).order('created_at',{ascending:false}).order('id').range(page*20,page*20+19),client().from('request_notifications').select('id',{count:'exact',head:true}).is('invalidated_at',null).is('read_at',null)])
  if(list.error || count.error) throw new Error('Unable to load notifications.'); return { rows:list.data as RequestNotification[],unread:count.count ?? 0 }
 },
 read: (id: string) => rpc<void>('mark_request_notification_read',{p_id:id}),
}
