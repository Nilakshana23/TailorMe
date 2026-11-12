import type {ChatImage} from '../services/chatImageService'
export type RequestMessage={id:string;request_id:string;sequence:number;sender_id:string;body:string;created_at:string;images?:ChatImage[]}
export type MessageSummary={request_id:string;unread:number;last_read_sequence:number;latest_sequence:number}
export type MessagePage={rows:RequestMessage[];hasMore:boolean}
export function validateMessage(body:string,imageCount=0){const n=[...body.trim()].length;return imageCount<0||imageCount>3?'Choose up to 3 images.':n>2000||(n<1&&imageCount===0)?'Enter a message of 1 to 2,000 characters, or add an image.':''}
export function mergeMessages(current:RequestMessage[],incoming:RequestMessage[]){
 const byId=new Map(current.map(m=>[m.id,m]));for(const message of incoming)byId.set(message.id,message)
 return [...byId.values()].sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id))
}
export function canMessage(request:{status:string;completed_at:string|null}){return ['pending','accepted'].includes(request.status)&&!request.completed_at}
export function canMarkConversationRead(intersecting:boolean,visibility:string){return intersecting&&visibility==='visible'}
// Single flight, with a queued refresh when reconnect/INSERT races the first
// page. Append every missed page using the authoritative monotonic cursor.
export function conversationSync(api:{latest:()=>Promise<MessagePage>;after:(sequence:number)=>Promise<RequestMessage[]>;meta:()=>Promise<void>},receive:(rows:RequestMessage[],initial:boolean,hasMore:boolean)=>void,onError:()=>void){
 let stopped=false,initialized=false,cursor=0,dirty=false,running:Promise<void>|null=null
 const refresh=():Promise<void>=>{
  dirty=true;if(running)return running
  running=(async()=>{while(dirty&&!stopped){dirty=false;try{
   if(!initialized){const page=await api.latest();if(stopped)return;cursor=page.rows.at(-1)?.sequence??0;initialized=true;receive(page.rows,true,page.hasMore)}
   let rows:RequestMessage[]
   do{rows=await api.after(cursor);if(stopped)return;if(rows.length){cursor=rows.at(-1)!.sequence;receive(rows,false,false)}}while(rows.length===100)
   if(!stopped)await api.meta()
  }catch{if(!stopped)onError()}}})().finally(()=>{running=null;if(dirty&&!stopped)void refresh()})
  return running
 }
 return {refresh,stop(){stopped=true}}
}
