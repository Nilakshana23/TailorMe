import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import '../../pages/Dashboards.css'
import { dashboardPath, usePortal } from '../../auth/portalContext'
import ProfileAvatar from './ProfileAvatar'
import NotificationBell from './NotificationBell'
import LogoutButton from '../LogoutButton'

export function PortalIcon({ name }: { name: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{name}</span>
}

export default function PortalLayout({ children,className = '' }: { children: ReactNode;className?:string }) {
  const { role, profile, retry } = usePortal()
  const location = useLocation()
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const open = drawerKey === location.key
  const setOpen = (value:boolean) => setDrawerKey(value ? location.key : null)
  const toggle = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDialogElement>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const professional = role !== 'customer'
  const fixedPortal = role === 'customer' || role === 'tailor'
  const title = role === 'admin' ? 'Control Center' : role === 'tailor' ? 'Artisan Panel' : 'TailorMe'
  useEffect(() => {
    if (!open) return
    if (fixedPortal) {
      const modal=drawer.current,content=scrollArea.current,opener=toggle.current
      if (!modal) return
      const previousBody=document.body.style.overflow,previousHtml=document.documentElement.style.overflow,previousContent=content?.style.overflow??''
      modal.showModal()
      document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden'
      if(content)content.style.overflow='hidden'
      return()=>{
        modal.close()
        document.body.style.overflow=previousBody;document.documentElement.style.overflow=previousHtml
        if(content)content.style.overflow=previousContent
        if(!window.matchMedia('(min-width: 1024px)').matches&&opener?.isConnected)opener.focus({preventScroll:true})
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setDrawerKey(null); toggle.current?.focus() }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open,fixedPortal])
  useEffect(()=>{
    if(!fixedPortal)return
    const desktop=window.matchMedia('(min-width: 1024px)')
    const resize=()=>{if(desktop.matches)setDrawerKey(null)}
    desktop.addEventListener('change',resize)
    return()=>desktop.removeEventListener('change',resize)
  },[fixedPortal])
  const navigation = <>
    <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to={dashboardPath(role!)}><PortalIcon name="dashboard" />Dashboard</NavLink>
    {role === 'customer' && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/customer/measurements"><PortalIcon name="straighten" />My Measurements</NavLink>}
    {role === 'customer' && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/customer/designer"><PortalIcon name="design_services" />Dress Designer</NavLink>}
    {role === 'customer' && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/become-a-tailor"><PortalIcon name="content_cut" />Become a Tailor</NavLink>}
    {role === 'admin' && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/admin/tailor-applications"><PortalIcon name="assignment" />Tailor Applications</NavLink>}
    {role === 'tailor' && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/tailor/profile"><PortalIcon name="storefront" />Shop Profile</NavLink>}
    {(role === 'customer' || role === 'tailor') && <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to={role === 'tailor' ? '/tailor/requests' : '/customer/requests'}><PortalIcon name="assignment" />{role === 'customer' ? 'My Requests' : 'Received Requests'}</NavLink>}
    {role==='tailor'&&<NavLink className={({isActive})=>isActive?'portal-nav-active':''} to="/tailor/orders"><PortalIcon name="shopping_bag"/>My Orders</NavLink>}
    <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/tailors"><PortalIcon name="content_cut" />Find a Tailor</NavLink>
    <NavLink className={({ isActive }) => isActive ? 'portal-nav-active' : ''} to="/account"><PortalIcon name="person" />My Profile</NavLink>
    <Link to="/"><PortalIcon name="home" />TailorMe Home</Link>
  </>
  const pageContent=<><main id="portal-main" className="portal-main" tabIndex={-1}>{children}</main>
    <footer className="portal-footer"><Link to="/" className="font-display-lg text-headline-sm">TailorMe</Link><p className="text-sm text-on-surface-variant">Made for a more personal fit.</p><div className="flex flex-wrap gap-6 items-start"><button type="button" className="underline text-sm min-h-11" onClick={retry}>Refresh portal access</button>{!professional && <LogoutButton />}</div></footer></>
  return <div className={`portal-layout ${professional ? 'portal-professional' : 'portal-customer'} ${fixedPortal?'portal-fixed':''} ${className}`}>
    <a className="portal-skip-link" href="#portal-main">Skip to dashboard content</a>
    {(professional||fixedPortal) && <aside className="portal-sidebar"><div className="portal-sidebar-brand"><Link to="/" className="font-display-lg text-headline-sm">{title}</Link><p className="mt-2 text-sm text-on-surface-variant capitalize">{role} portal</p></div><nav aria-label="Portal navigation" className="portal-nav portal-sidebar-links mt-12">{navigation}</nav><div className="portal-sidebar-account mt-auto pt-12"><p className="font-semibold break-words mb-4">{profile?.full_name || 'Your atelier'}</p><LogoutButton /></div></aside>}
    <div className="portal-body">
      <header className="portal-header">
        <Link to="/" className="font-display-lg text-headline-sm">{professional ? 'TailorMe' : title}</Link>
        <div className="portal-header-actions">{(role === 'tailor' || role === 'customer') && <NotificationBell />}<span className="portal-user-name">{profile?.full_name || 'Your account'}</span><Link to="/account" className="portal-avatar" aria-label="Your profile"><ProfileAvatar path={profile?.avatar_path??null} userId={profile?.id??''} name={profile?.full_name??''}/></Link><button ref={toggle} type="button" className="portal-menu-toggle" aria-label={open ? 'Close portal navigation' : 'Open portal navigation'} aria-expanded={open} aria-haspopup={fixedPortal?'dialog':undefined} aria-controls="portal-mobile-nav" onClick={() => setOpen(!open)}><PortalIcon name={open ? 'close' : 'menu'} /></button></div>
      </header>
      {fixedPortal?<dialog ref={drawer} id="portal-mobile-nav" className="portal-drawer" aria-labelledby="portal-drawer-title" aria-modal="true" onClose={()=>setOpen(false)} onCancel={event=>{event.preventDefault();setOpen(false)}} onClick={event=>{if(event.target===event.currentTarget)setOpen(false)}}>
        <div className="portal-drawer-panel"><div className="portal-drawer-heading"><div><h2 id="portal-drawer-title" className="font-display-lg text-headline-sm">{title}</h2><p className="text-sm capitalize">{role} navigation</p></div><button type="button" className="portal-drawer-close" aria-label="Close portal navigation" autoFocus onClick={()=>setOpen(false)}><PortalIcon name="close"/></button></div>
        <nav className="portal-nav portal-drawer-links" aria-label={`${role} navigation`} onClick={event=>{if(event.target instanceof Element&&event.target.closest('a'))setOpen(false)}}>{navigation}</nav><div className="portal-drawer-account"><p className="font-semibold break-words">{profile?.full_name||'Your account'}</p><LogoutButton/></div></div>
      </dialog>:<nav id="portal-mobile-nav" className="portal-mobile-nav portal-nav" aria-label="Mobile portal navigation" hidden={!open} onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) setOpen(false) }}>{navigation}<LogoutButton /></nav>}
      {fixedPortal?<div ref={scrollArea} className="portal-content-scroll">{pageContent}</div>:pageContent}
    </div>
  </div>
}
