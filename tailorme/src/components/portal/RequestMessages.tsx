import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {useAuth} from '../../auth/authContext'
import type {TailoringRequest} from '../../services/requestService'
import {requestService} from '../../services/requestService'
import {messageService} from '../../services/messageService'
import {canMessage,canMarkConversationRead,conversationSync,mergeMessages,validateMessage} from '../../utils/requestMessages'
import type {MessageSummary,RequestMessage} from '../../utils/requestMessages'
import FormButton from '../ui/FormButton'
import ChatImageComposer,{ChatImageView} from './ChatImages'
import type {ChatImage} from '../../services/chatImageService'
import './RequestMessages.css'

export default function RequestMessages({request}:{request:TailoringRequest}){
 const {session}=useAuth();const userId=session?.user.id
 const authorized=!!userId&&[request.customer_id,request.tailor_id].includes(userId)
 const [rows,setRows]=useState<RequestMessage[]>([]),[loaded,setLoaded]=useState(false),[hasMore,setHasMore]=useState(false)
 const [summary,setSummary]=useState<MessageSummary|null>(null),[liveRequest,setLiveRequest]=useState(request)
 const [connection,setConnection]=useState('CONNECTING'),[error,setError]=useState(''),[readError,setReadError]=useState('')
 const [refreshError,setRefreshError]=useState('')
 const [draft,setDraft]=useState(''),[attempt,setAttempt]=useState<{id:string;body:string;images?:ChatImage[];status:'sending'|'failed'}|null>(null)
 const [draftId,setDraftId]=useState(()=>crypto.randomUUID()),[images,setImages]=useState<ChatImage[]>([]),[imageBusy,setImageBusy]=useState(false)
 const [olderPending,setOlderPending]=useState(false),[bottomVisible,setBottomVisible]=useState(false),[visible,setVisible]=useState(false),[readRetry,setReadRetry]=useState(0)
 const refresh=useRef<()=>Promise<void>>(async()=>{}),active=useRef(false),sending=useRef(false),reading=useRef(false),olderBusy=useRef(false)
 const submissionRef=useRef<{id:string;body:string;images?:ChatImage[]}|null>(null)
 const history=useRef<HTMLDivElement>(null),end=useRef<HTMLDivElement>(null),prepend=useRef<{id:string;offset:number}|null>(null)
 const latest=rows.at(-1)?.sequence??0
 const writable=authorized&&canMessage(request)&&canMessage(liveRequest)

 useEffect(()=>{
  if(!authorized||!userId)return
  active.current=true
  let mounted=true
  const sync=conversationSync({latest:()=>messageService.page(request.id),after:sequence=>messageService.after(request.id,sequence),meta:async()=>{
   const [summaries,current]=await Promise.all([messageService.summaries([request.id]),requestService.get(request.id)])
   if(!current||!summaries[0])throw new Error('Conversation unavailable')
   if(mounted){setSummary(summaries[0]);setLiveRequest(current);setRefreshError('')}
  }},(messages,initial,more)=>{if(mounted){setRows(current=>mergeMessages(current,messages));if(initial){setLoaded(true);setHasMore(more)}const pending=submissionRef.current;if(pending&&messages.some(message=>message.id===pending.id&&message.sender_id===userId)){submissionRef.current=null;setAttempt(null);setError('');setImages([]);setImageBusy(false);setDraftId(crypto.randomUUID());setDraft(current=>current.trim()===pending.body?'':current)}if(messages.some(message=>message.sender_id!==userId))window.dispatchEvent(new Event('tailorme:notifications-changed'))}},()=>{if(mounted)setRefreshError('Unable to refresh the conversation. Your text is kept. Try Refresh messages.')})
  refresh.current=sync.refresh
  const update=()=>{void sync.refresh()}
  let unsubscribe=()=>{}
  try{unsubscribe=messageService.watch(request.id,userId,update,state=>{if(mounted)setConnection(state)})}catch{/* The disconnected state and authorized refresh fallback remain available. */}
  update()
  const timer=setInterval(()=>{if(document.visibilityState==='visible')update()},30000)
  window.addEventListener('online',update);window.addEventListener('focus',update)
  return()=>{mounted=false;active.current=false;sync.stop();unsubscribe();clearInterval(timer);window.removeEventListener('online',update);window.removeEventListener('focus',update)}
 },[authorized,request.id,userId])

 useEffect(()=>{
  const visibility=()=>setVisible(document.visibilityState==='visible')
  visibility();document.addEventListener('visibilitychange',visibility)
  if(!end.current||!('IntersectionObserver' in window))return()=>document.removeEventListener('visibilitychange',visibility)
  const observer=new IntersectionObserver(entries=>setBottomVisible(entries[0]?.isIntersecting??false),{threshold:1})
  observer.observe(end.current)
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility)}
 },[loaded,latest])

 useEffect(()=>{
  if(!authorized||!latest||!canMarkConversationRead(bottomVisible,visible?'visible':'hidden')||latest<=(summary?.last_read_sequence??0)||reading.current)return
  // Recheck after layout: an appended message can move the sentinel out of
  // view before IntersectionObserver has reported its next intersection.
  const tail=end.current?.getBoundingClientRect(),viewport=history.current?.getBoundingClientRect()
  if(!tail||!viewport||document.visibilityState!=='visible'||tail.top<Math.max(0,viewport.top)||tail.bottom>Math.min(window.innerHeight,viewport.bottom))return
  reading.current=true
  let saved=false
  void messageService.read(request.id,latest).then(sequence=>{
   saved=true
   if(active.current){setReadError('');setSummary(current=>current?{...current,last_read_sequence:Math.max(current.last_read_sequence,sequence)}:current);window.dispatchEvent(new Event('tailorme:notifications-changed'));void refresh.current()}
  }).catch(()=>{if(active.current)setReadError('Unable to save your read position. Refresh messages to retry.')}).finally(()=>{reading.current=false;if(saved&&active.current)setReadRetry(n=>n+1)})
 },[authorized,bottomVisible,visible,latest,summary?.last_read_sequence,request.id,readRetry])

 useLayoutEffect(()=>{
  if(prepend.current&&history.current){
   const saved=prepend.current,node=[...history.current.querySelectorAll<HTMLElement>('[data-message-id]')].find(item=>item.dataset.messageId===saved.id)
   if(node)history.current.scrollTop+=node.getBoundingClientRect().top-saved.offset
   prepend.current=null
  }
 },[rows])

 async function older(){
  if(olderBusy.current||!rows.length)return
  olderBusy.current=true;setOlderPending(true);setError('')
  try{
   const page=await messageService.page(request.id,rows[0].sequence)
   if(!active.current)return
   const anchor=history.current?.querySelector<HTMLElement>('[data-message-id]')
   if(anchor?.dataset.messageId)prepend.current={id:anchor.dataset.messageId,offset:anchor.getBoundingClientRect().top}
   setRows(current=>mergeMessages(current,page.rows));setHasMore(page.hasMore)
  }catch{if(active.current)setError('Unable to load older messages. Retry Load older messages.')}
  finally{olderBusy.current=false;if(active.current)setOlderPending(false)}
 }
 async function send(){
  if(sending.current||imageBusy||!authorized||(!writable&&!attempt))return
  if(!attempt&&validateMessage(draft,images.length)){setError(validateMessage(draft,images.length));return}
  const submission=attempt??{id:draftId,body:draft.trim(),images:structuredClone(images),status:'sending' as const}
  submissionRef.current=submission
  sending.current=true;setAttempt({...submission,status:'sending'});setError('')
  try{
   const message=await messageService.send(submission.id,request.id,submission.body,submission.images)
   if(active.current){setRows(current=>mergeMessages(current,[message]));if(submissionRef.current?.id===submission.id){submissionRef.current=null;setAttempt(null);setImages([]);setImageBusy(false);setDraftId(crypto.randomUUID());setDraft(current=>current.trim()===submission.body?'':current)}window.dispatchEvent(new Event('tailorme:notifications-changed'));void refresh.current()}
  }catch(cause){if(active.current){if(submissionRef.current?.id===submission.id){const detail=cause instanceof Error?cause.message:cause&&typeof cause==='object'&&'message' in cause&&typeof cause.message==='string'?cause.message:'';setAttempt({...submission,status:'failed'});setError(`${detail?`${detail} `:''}Message not confirmed. Your text and images are kept. Retry checks the same message safely.`)}void refresh.current()}}
  finally{sending.current=false}
 }
 if(!authorized)return null
 return <section id="messages" data-request-section aria-busy={!loaded&&!refreshError} className="request-messages" aria-labelledby="request-messages-title">
  <div className="request-chat-heading"><h3 id="request-messages-title" className="font-display-lg text-headline-sm">Messages</h3><span>{summary?`${summary.unread} unread`:'Loading unread count...'}</span></div>
  <p className="request-chat-note">Private conversation between you and this request’s {userId===request.customer_id?'tailor':'customer'}. Messages do not change quotes, measurements, dates or work progress.</p>
  <div className="request-chat-actions"><FormButton variant="secondary" onClick={()=>{setError('');setReadRetry(n=>n+1);void refresh.current()}}>Refresh messages</FormButton><FormButton variant="secondary" onClick={()=>{if(history.current)history.current.scrollTop=history.current.scrollHeight}}>Jump to latest</FormButton></div>
  <p role="status" className="request-chat-note">{connection==='SUBSCRIBED'?'Live updates connected.':'Live updates not connected. Use Refresh messages; updates are also checked while this tab is visible.'}</p>
  {!loaded&&!refreshError&&<p role="status">Loading conversation...</p>}
  <div className="request-chat-history" ref={history} tabIndex={0} aria-label="Conversation history">
   {hasMore&&<FormButton variant="secondary" disabled={olderPending} onClick={()=>void older()}>{olderPending?'Loading older messages...':'Load older messages'}</FormButton>}
   {loaded&&!rows.length&&<p>No messages yet. Start a conversation about this request.</p>}
   <ol>{rows.map(row=><li key={row.id} data-message-id={row.id} className={row.sender_id===userId?'request-chat-message request-chat-own':'request-chat-message'}><div><strong>{row.sender_id===userId?'You':row.sender_id===request.customer_id?request.customer_name||'Customer':request.shop_name||'Tailor'}</strong><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})} (Sri Lanka)</time></div><p>{row.body}</p><div className="chat-image-grid">{row.images?.map((image,index)=><ChatImageView key={image.id} image={image} number={index+1}/>)}</div>{row.sender_id===userId&&<span>Sent</span>}</li>)}</ol>
   <div ref={end} className="request-chat-end" aria-hidden="true"/>
  </div>
  {attempt&&!rows.some(row=>row.id===attempt.id)&&<div className="request-chat-message request-chat-own" role="status"><strong>You · {attempt.status==='sending'?'Sending...':'Failed / not confirmed'}</strong><p>{attempt.body}</p><div className="chat-image-grid">{attempt.images?.map((image,index)=><ChatImageView key={image.id} image={image} number={index+1}/>)}</div></div>}
  {!writable&&<p className="request-chat-note">This request has ended. Message history is read-only.</p>}
  {(writable||attempt)&&<form onSubmit={e=>{e.preventDefault();void send()}} aria-busy={attempt?.status==='sending'}>
   <div hidden={!!attempt}><ChatImageComposer key={draftId} requestId={request.id} draftId={draftId} disabled={!!attempt||!writable} onChange={setImages} onBusy={setImageBusy}/></div><label htmlFor="request-message-body">Message or optional image caption</label><textarea id="request-message-body" rows={3} disabled={!!attempt||!writable} value={draft} onChange={e=>setDraft(e.target.value)} aria-describedby="request-message-help"/>
   <p id="request-message-help" className="request-chat-note">Text or caption: up to 2,000 characters. Images can be sent without a caption. {attempt?'Your original text and images are kept until delivery is confirmed.':'Scroll or jump to the latest messages to mark the conversation read.'}</p>
   <FormButton type="submit" disabled={imageBusy||attempt?.status==='sending'||(!writable&&!attempt)}>{attempt?.status==='sending'?'Sending message...':attempt?'Retry same message':'Send message'}</FormButton>
  </form>}
  {refreshError&&<p role="alert" className="text-error">{refreshError}</p>}{error&&<p role="alert" className="text-error">{error}</p>}{readError&&<p role="alert" className="text-error">{readError}</p>}
 </section>
}
