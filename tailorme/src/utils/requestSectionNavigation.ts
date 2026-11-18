export const requestSectionHashes=['#messages','#payments','#design-proposals','#progress','#work','#quotations']

// Wait for the real section and its preceding async sections. Mutation-driven
// retries also work when navigating to a hash in an already mounted request.
export function revealRequestSection(requestId:string,hash:string,onUnavailable:()=>void){
 if(!requestSectionHashes.includes(hash)||typeof document==='undefined'||!document.querySelector)return()=>{}
 const container=document.querySelector<HTMLElement>('.portal-content-scroll')
 if(!container)return()=>{}
 let stopped=false,frame=0,queued=false
 const ready=()=>{
  const detail=container.querySelector<HTMLElement>(`[data-request-detail="${requestId}"]`)
  const target=detail?.querySelector<HTMLElement>(hash)
  if(!target||target.getAttribute('aria-busy')==='true')return null
  const preceding=Array.from(detail!.querySelectorAll('[data-request-section][aria-busy="true"]'))
  if(preceding.some(node=>!!(node.compareDocumentPosition(target)&Node.DOCUMENT_POSITION_FOLLOWING)))return null
  return target
 }
 const stop=()=>{stopped=true;observer.disconnect();cancelAnimationFrame(frame);clearTimeout(timer)}
 const schedule=()=>{
  if(stopped||queued||!ready())return
  queued=true
  frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
   queued=false;if(stopped)return
   const target=ready();if(!target)return
   const heading=target.querySelector<HTMLElement>('h2,h3')??target
   container.scrollTo({top:Math.max(0,container.scrollTop+heading.getBoundingClientRect().top-container.getBoundingClientRect().top-24),behavior:'auto'})
   heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});stop()
  })})
 }
 const observer=new MutationObserver(schedule)
 const timer=setTimeout(()=>{stop();onUnavailable()},10000)
 observer.observe(container,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']})
 schedule()
 return stop
}
