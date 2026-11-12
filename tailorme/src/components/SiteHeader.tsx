import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/authContext'
import { dashboardPath, usePortal } from '../auth/portalContext'
import { authPath } from '../utils/authNavigation'

export default function SiteHeader() {
 const { session, loading } = useAuth()
 const { role, status } = usePortal()
 const [menuOpen,setMenuOpen] = useState(false)
 const menuToggleRef = useRef<HTMLButtonElement>(null)
 useEffect(()=>{
  if(!menuOpen)return
  function escape(event:KeyboardEvent){if(event.key==='Escape'){setMenuOpen(false);menuToggleRef.current?.focus()}}
  document.addEventListener('keydown',escape)
  return()=>document.removeEventListener('keydown',escape)
 },[menuOpen])
 const accountActions=loading?<span role="status" className="text-sm">Restoring account...</span>:session?
  status==='ready'&&role?<Link to={dashboardPath(role)}>My Dashboard</Link>:
  status==='loading'?<span role="status" className="text-sm">Loading account...</span>:<Link to="/account">My Account</Link>:
  <><Link to={authPath('/login','/tailors')}>Sign In</Link><Link className="landing-signup" to={authPath('/signup','/tailors')}>Sign Up</Link></>
 const navigation=<><a href="/#collections">Categories</a><Link to="/tailors">Find a Tailor</Link><a href="/#our-story">Our Story</a></>
 return <header className="landing-header fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-md border-b border-outline-variant/30 shadow-sm h-20">
  <div className="landing-header-inner"><a className="text-headline-sm font-display-lg tracking-tighter text-primary" href="/#top">TailorMe</a>
   <nav aria-label="Main navigation" className="landing-desktop-nav">{navigation}</nav>
   <div className="landing-account-actions">{accountActions}</div>
   <div className="mobile-navigation xl:hidden"><button ref={menuToggleRef} type="button" className="mobile-navigation-toggle" aria-label={menuOpen?'Close navigation menu':'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation-links" onClick={()=>setMenuOpen(value=>!value)}><span aria-hidden="true" className="material-symbols-outlined">{menuOpen?'close':'menu'}</span></button>
    <nav id="mobile-navigation-links" aria-label="Mobile navigation" hidden={!menuOpen} onClick={event=>{if(event.target instanceof Element&&event.target.closest('a'))setMenuOpen(false)}}>{navigation}{accountActions}</nav>
   </div>
  </div>
 </header>
}
