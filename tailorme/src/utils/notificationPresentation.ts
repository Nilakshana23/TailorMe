import type {RequestNotification} from '../services/workService'
export const notificationEvents:Record<RequestNotification['kind'],{title:string;icon:string}>={
 payment_reported:{title:'Payment awaiting your verification',icon:'account_balance'},
 payment_confirmed:{title:'Receipt confirmed by tailor',icon:'receipt_long'},
 payment_rejected:{title:'Payment report rejected',icon:'receipt_long'},
 design_proposed:{title:'Design change proposed',icon:'design_services'},
 design_accepted:{title:'Design change accepted',icon:'design_services'},
 design_declined:{title:'Design change declined',icon:'design_services'},
 design_withdrawn:{title:'Design proposal withdrawn',icon:'design_services'},
 message_received:{title:'New request message',icon:'chat_bubble'},
 stage_changed:{title:'Tailoring progress updated',icon:'content_cut'},
 quote_sent:{title:'Quotation received',icon:'description'},
 quote_accepted:{title:'Quotation accepted',icon:'description'},
 quote_declined:{title:'Quotation declined',icon:'description'},
 two_days:{title:'Confirmed deadline in 2 days',icon:'event'},
 due_today:{title:'Confirmed deadline today',icon:'today'},
}
export function notificationDestination(row:RequestNotification,role:string|null,userId?:string){
 if(!userId||!row.request||!row.request_id||!/^[a-zA-Z0-9_-]+$/.test(row.request_id))return null
 const requester=row.request.customer_id===userId,provider=row.request.tailor_id===userId
 if((!requester&&!provider)||(role!=='customer'&&role!=='tailor')||(role==='customer'&&!requester))return null
 const base=role==='tailor'?(requester?'/tailor/orders':'/tailor/requests'):'/customer/requests'
 const anchor=row.kind==='message_received'?'#messages':row.kind.startsWith('design_')?'#design-proposals':row.kind.startsWith('payment_')?'#payments':row.kind==='stage_changed'?'#progress':row.kind==='due_today'||row.kind==='two_days'?'#work':row.kind.startsWith('quote_')?'#quotations':''
 return `${base}/${row.request_id}${anchor}`
}
export function notificationExactTime(value:string){
 const date=new Date(value)
 return Number.isNaN(date.getTime())?'Date unavailable':`${date.toLocaleString('en-GB',{timeZone:'Asia/Colombo',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})} (Sri Lanka)`
}
export function notificationRelativeTime(value:string,now=Date.now()){
 const elapsed=now-Date.parse(value)
 if(!Number.isFinite(elapsed))return 'Date unavailable'
 if(Math.abs(elapsed)<60000)return 'Just now'
 const seconds=elapsed/1000,absolute=Math.abs(seconds)
 const [unit,size]:[Intl.RelativeTimeFormatUnit,number]=absolute<3600?['minute',60]:absolute<86400?['hour',3600]:absolute<604800?['day',86400]:absolute<2592000?['week',604800]:absolute<31536000?['month',2592000]:['year',31536000]
 return new Intl.RelativeTimeFormat('en',{numeric:'always',style:'short'}).format(-Math.trunc(seconds/size),unit)
}
