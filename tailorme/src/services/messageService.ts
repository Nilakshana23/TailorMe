import {supabase} from '../lib/supabase'
import type {MessagePage,MessageSummary,RequestMessage} from '../utils/requestMessages'
function client(){if(!supabase)throw new Error('Authentication unavailable.');return supabase}
export const messageService={
 async page(requestId:string,before?:number):Promise<MessagePage>{
  let query=client().from('request_messages').select('*').eq('request_id',requestId)
  if(before!==undefined)query=query.lt('sequence',before)
  const {data,error}=await query.order('sequence',{ascending:false}).limit(31);if(error)throw error
  return {rows:(data as RequestMessage[]).slice(0,30).reverse(),hasMore:data.length>30}
 },
 async after(requestId:string,sequence:number):Promise<RequestMessage[]>{const {data,error}=await client().from('request_messages').select('*').eq('request_id',requestId).gt('sequence',sequence).order('sequence').limit(100);if(error)throw error;return data as RequestMessage[]},
 async send(id:string,requestId:string,body:string,images:{id:string}[]=[]):Promise<RequestMessage>{const {data,error}=await client().rpc(images.length?'send_request_image_message':'send_request_message',{p_id:id,p_request_id:requestId,p_body:body,...(images.length?{p_images:images.map(image=>image.id)}:{})});if(error)throw error;return data},
 async summaries(ids:string[]):Promise<MessageSummary[]>{if(!ids.length)return [];const {data,error}=await client().rpc('request_message_summaries',{p_request_ids:ids});if(error)throw error;return data},
 async read(requestId:string,sequence:number):Promise<number>{const {data,error}=await client().rpc('mark_request_messages_read',{p_request_id:requestId,p_sequence:sequence});if(error)throw error;return data},
 watch(requestId:string,userId:string,refresh:()=>void,status:(state:string)=>void){
  const db=client()
  const channel=db.channel(`request-chat:${requestId}:${userId}:${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'request_messages',filter:`request_id=eq.${requestId}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'request_message_reads',filter:`request_id=eq.${requestId}`},refresh)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'tailoring_requests',filter:`id=eq.${requestId}`},refresh)
   .subscribe(state=>{status(state);if(state==='SUBSCRIBED')refresh()})
  return ()=>{void db.removeChannel(channel)}
 },
}
