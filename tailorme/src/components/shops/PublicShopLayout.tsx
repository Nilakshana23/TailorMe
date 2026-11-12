import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/authContext'
import SiteFooter from '../SiteFooter'
import '../../pages/Shops.css'

export default function PublicShopLayout({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  const links = <><Link to="/">Home</Link><NavLink to={`/tailors${location.search}`}>Find a Tailor</NavLink>{session ? <Link to="/dashboard">My Dashboard</Link> : <Link to="/login">Sign In</Link>}</>
  return <div><a className="shop-skip-link" href="#directory-content">Skip to content</a><header className="shop-public-header"><Link to="/" className="font-display-lg text-headline-sm">TailorMe</Link><nav aria-label="Directory navigation" className="shop-public-desktop-nav">{links}</nav><details className="shop-public-mobile-nav" onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}><summary>Menu</summary><nav aria-label="Mobile directory navigation" onClick={(event) => { if (event.target instanceof Element && event.target.closest('a')) event.currentTarget.closest('details')?.removeAttribute('open') }}>{links}</nav></details></header><main id="directory-content" className="shop-public-main">{children}</main><SiteFooter /></div>
}
