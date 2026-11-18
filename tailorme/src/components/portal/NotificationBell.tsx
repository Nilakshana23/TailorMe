import {useEffect,useRef,useState} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import type {MouseEvent} from 'react'
import {usePortal} from '../../auth/portalContext'
import {useAuth} from '../../auth/authContext'
import {workService} from '../../services/workService'
import type {RequestNotification} from '../../services/workService'
import {notificationDestination,notificationEvents,notificationExactTime,notificationRelativeTime} from '../../utils/notificationPresentation'
import './NotificationBell.css'

export default function NotificationBell(){
 const {role}=usePortal(),{session}=useAuth()
 const [open,setOpen]=useState(false),[page,setPage]=useState(0),[attempt,setAttempt]=useState(0)
 const [result,setResult]=useState<{key:string;rows:RequestNotification[];unread:number|null;error:string}|null>(null)
 const [pending,setPending]=useState(false),[error,setError]=useState(''),busy=useRef(false)
 const bell=useRef<HTMLButtonElement>(null),closeButton=useRef<HTMLButtonElement>(null)
 const navigate=useNavigate(),activation=useRef(0)
 const userScope=`${session?.user.id}:`,scope=`${userScope}${page}:`,key=`${scope}${attempt}`
 useEffect(()=>{
  let active=true
  workService.notifications(page).then(value=>{if(active)setResult({key,...value,error:''})}).catch(()=>{
   if(active)setResult(previous=>({key,rows:previous?.key.startsWith(scope)?previous.rows:[],unread:previous?.key.startsWith(userScope)?previous.unread:null,error:'Unable to refresh notifications. Try again.'}))
  })
  return()=>{active=false}
 },[key,page,scope,userScope])
 useEffect(()=>{
  const refresh=()=>setAttempt(value=>value+1)
  window.addEventListener('focus',refresh);window.addEventListener('tailorme:notifications-changed',refresh)
  const timer=setInterval(refresh,60000)
  return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('tailorme:notifications-changed',refresh);clearInterval(timer)}
 },[])
 function close(){setOpen(false);bell.current?.focus({preventScroll:true})}
 useEffect(()=>{
  if(!open)return
  closeButton.current?.focus({preventScroll:true})
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);bell.current?.focus({preventScroll:true})}}
  document.addEventListener('keydown',escape)
  return()=>document.removeEventListener('keydown',escape)
 },[open])
 const current=result?.key.startsWith(scope)?result:null
 const loading=!current||current.key!==key
 const unread=result?.key.startsWith(userScope)?result.unread:null
 function activate(event:MouseEvent<HTMLAnchorElement>,row:RequestNotification,destination:string){
  if(event&&(event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return
  event?.preventDefault()
  close();setError('')
  // A fresh navigation entry/state also triggers scrolling for an identical URL.
  navigate(destination,{state:{notificationId:row.id,notificationActivation:++activation.current}})
  if(!row.read_at)void workService.read(row.id).then(()=>setAttempt(value=>value+1)).catch(()=>setError('The request was opened, but this notification could not be marked read. Open notifications to retry.'))
 }
 function refresh(){setError('');setAttempt(value=>value+1)}
 return <div className="request-notifications">
  <button ref={bell} type="button" className="notification-trigger" aria-label={`Notifications${unread!==null?`, ${unread} unread`:''}`} aria-expanded={open} aria-haspopup="dialog" aria-controls="request-notification-list" onClick={()=>open?close():setOpen(true)}><span className="material-symbols-outlined" aria-hidden="true">notifications</span>{unread!==null&&unread>0&&<span className="notification-count" aria-hidden="true">{unread>99?'99+':unread}</span>}</button>
  {!open&&error&&<p role="alert" className="notification-feedback">{error}</p>}
  {open&&<section id="request-notification-list" className="request-notification-panel" role="dialog" aria-labelledby="notification-panel-title" aria-describedby="notification-panel-subtitle">
   <header className="notification-panel-header"><div><div className="notification-panel-heading"><h2 id="notification-panel-title">Notifications</h2>{unread!==null&&unread>0&&<span className="notification-panel-count" aria-label={`${unread} unread notifications`}>{unread>99?'99+':unread}</span>}</div><p id="notification-panel-subtitle">Updates about your requests</p></div><div className="notification-panel-tools"><button type="button" className="notification-icon-button" aria-label={loading?'Refreshing notifications':'Refresh notifications'} title="Refresh notifications" disabled={loading||pending} aria-busy={loading} onClick={refresh}><span className={`material-symbols-outlined ${loading?'notification-refreshing':''}`} aria-hidden="true">refresh</span></button><button ref={closeButton} type="button" className="notification-icon-button" aria-label="Close notifications" title="Close notifications" onClick={close}><span className="material-symbols-outlined" aria-hidden="true">close</span></button></div></header>
   <div className="notification-panel-body" aria-busy={loading}>
    {loading&&<p role="status" className="notification-state">{current?'Refreshing notifications...':'Loading notifications...'}</p>}
    {current?.error&&<p role="alert" className="notification-state notification-error">{current.error}{current.rows.length>0?' Showing previously loaded notifications.':''}</p>}
    {!loading&&current&&!current.error&&!current.rows.length&&<p className="notification-state">{page===0?'No notifications yet.':'No notifications on this page.'}</p>}
    {!!current?.rows.length&&<ul className="notification-rows">{current.rows.map(row=>{
     const event=notificationEvents[row.kind]??{title:'Request update',icon:'notifications'},isUnread=!row.read_at,destination=notificationDestination(row,role,session?.user.id)
     return <li key={row.id} className={`notification-row ${isUnread?'notification-row-unread':''}`}>
      {destination?<Link className="notification-row-link" to={destination} onClick={event=>activate(event,row,destination)}><span className="notification-event-icon material-symbols-outlined" aria-hidden="true">{event.icon}</span><span className="notification-row-copy"><span className="notification-row-title">{event.title}{isUnread&&<span className="notification-unread-dot" aria-hidden="true"/>}</span>{isUnread&&<span className="notification-unread-text">Unread</span>}{row.confirmed_date&&<span className="notification-context">Confirmed completion: {new Date(`${row.confirmed_date}T00:00:00+05:30`).toLocaleDateString('en-GB',{timeZone:'Asia/Colombo',day:'numeric',month:'short',year:'numeric'})}</span>}</span>
      <span className="notification-row-meta"><span className="notification-time"><time dateTime={row.created_at} title={notificationExactTime(row.created_at)} aria-label={notificationExactTime(row.created_at)}>{notificationRelativeTime(row.created_at)}</time><span className="notification-exact-time" aria-hidden="true">{notificationExactTime(row.created_at)}</span></span></span></Link>:<div className="notification-unavailable"><strong>{event.title}</strong><p>This request is unavailable or you no longer have access. Refresh notifications or open your request list.</p></div>}{isUnread&&<button type="button" className="notification-read-button" disabled={pending||loading} onClick={event=>{
       if(busy.current)return
       const link=event?.currentTarget.closest('li')?.querySelector('a')
       busy.current=true;setPending(true);setError('')
       void workService.read(row.id).then(()=>{link?.focus({preventScroll:true});setAttempt(value=>value+1)}).catch(()=>setError('Unable to mark this notification as read. Retry.')).finally(()=>{busy.current=false;setPending(false)})
      }}>Mark as read</button>}
     </li>
    })}</ul>}
    {error&&<p role="alert" className="notification-state notification-error">{error}</p>}
   </div>
   <nav className="notification-pagination" aria-label="Notification pages"><button type="button" disabled={page===0||pending||loading} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page+1}</span><button type="button" disabled={pending||loading||!current||current.rows.length<20||!!current.error} onClick={()=>setPage(value=>value+1)}>Next</button></nav>
  </section>}
 </div>
}
