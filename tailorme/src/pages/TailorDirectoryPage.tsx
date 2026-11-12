import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { usePortal } from '../auth/portalContext'
import { PortalStatusMessage } from '../auth/PortalGuard'
import SelectedDesign from '../components/portal/SelectedDesign'
import PublicShopLayout from '../components/shops/PublicShopLayout'
import ShopCard from '../components/shops/ShopCard'
import FormButton from '../components/ui/FormButton'
import { shopService } from '../services/shopService'
import type { PublicShop } from '../services/shopService'
import { authError } from '../services/authService'

export default function TailorDirectoryPage() {
  const {session,loading}=useAuth()
  const {role,status}=usePortal()
  const userId=session?.user.id
  const [params,setParams] = useSearchParams()
  const [attempt,setAttempt] = useState(0)
  useEffect(()=>{
    const refresh=()=>setAttempt(value=>value+1)
    window.addEventListener('focus',refresh);window.addEventListener('tailorme:shop-media-changed',refresh)
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('tailorme:shop-media-changed',refresh)}
  },[])
  const [result,setResult] = useState<{ key: string; shops: PublicShop[]; count: number; error: string } | null>(null)
  const search = params.get('q')?.slice(0,160) ?? ''
  const city = params.get('city')?.slice(0,120) ?? ''
  const specialty = params.get('specialty')?.slice(0,500) ?? ''
  const rawPage = Number(params.get('page') ?? 1)
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage-1 : 0
  const key = JSON.stringify([userId,role,status,loading,search,city,specialty,page,attempt])
  useEffect(() => {
    if(loading||!userId||status!=='ready')return
    let active = true
    shopService.directory({ search,city,specialty,page,...(role==='tailor'?{excludeOwnerId:userId}:{}) }).then((data) => { if (active) setResult({ key,...data,error: '' }) })
      .catch((cause: unknown) => { if (active) setResult({ key,shops: [],count: 0,error: authError(cause) }) })
    return () => { active = false }
  },[key,search,city,specialty,page,userId,loading,role,status])
  const current = result?.key === key ? result : null
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    if(params.get('design')) next.set('design',params.get('design')!)
    for (const field of ['q','city','specialty']) { const value = String(values.get(field) ?? '').trim(); if (value) next.set(field,value) }
    setParams(next)
  }
  function paginate(nextPage: number) { const next = new URLSearchParams(params); next.set('page',String(nextPage+1)); setParams(next) }
  if(loading)return <PublicShopLayout><p role="status">Restoring your session...</p></PublicShopLayout>
  if(status!=='ready')return <PublicShopLayout><PortalStatusMessage/></PublicShopLayout>
  return <PublicShopLayout>
    <SelectedDesign id={params.get('design')} />
    <div className="shop-directory-heading"><p className="text-label-sm uppercase tracking-widest text-secondary mb-4">The TailorMe directory</p><h1 className="font-display-lg text-headline-md">Find a tailor</h1><p className="mt-4 text-body-lg text-on-surface-variant max-w-2xl">Discover independent ateliers and the craft behind every detail. Explore published shops from approved TailorMe artisans.</p></div>
    <form key={`${search}:${city}:${specialty}`} className="shop-directory-filters" onSubmit={filter}><div><label htmlFor="shop-search">Shop Name</label><input id="shop-search" name="q" maxLength={160} defaultValue={search} placeholder="Search shops…" type="search" /></div><div><label htmlFor="shop-city">City</label><input id="shop-city" name="city" maxLength={120} defaultValue={city} placeholder="Any city" /></div><div><label htmlFor="shop-specialty">Specialty</label><input id="shop-specialty" name="specialty" maxLength={500} defaultValue={specialty} placeholder="For example: bridal" /></div><FormButton type="submit" className="px-6">Find Tailors</FormButton><button type="button" className="underline min-h-11" onClick={() => setParams(params.get('design') ? {design:params.get('design')!} : {})}>Clear All</button></form>
    {!current ? <p role="status" className="py-12">Loading published shops…</p> : current.error ? <div className="portal-card"><p role="alert">Unable to load the directory. {current.error}</p><FormButton className="mt-6" onClick={() => setAttempt((value) => value+1)}>Retry</FormButton></div> : <>
      <p role="status" className="text-sm text-on-surface-variant mb-8">{current.count} published shop{current.count === 1 ? '' : 's'} matching your search.</p>
      {current.shops.length ? <div className="shop-directory-grid">{current.shops.map((shop) => <ShopCard key={shop.owner_id} shop={shop} query={params.size ? `?${params.toString()}` : ''} />)}</div> : <div className="shop-directory-empty"><span aria-hidden="true" className="material-symbols-outlined">content_cut</span><h2 className="font-display-lg text-headline-sm mt-4">No shops to show</h2><p className="mt-3 text-on-surface-variant">Try another shop name, city, or specialty, or clear your filters. New shops appear after their owners publish them.</p></div>}
      <nav aria-label="Directory pages" className="shop-pagination"><FormButton variant="secondary" className="px-6" disabled={page === 0} onClick={() => paginate(page-1)}>Previous</FormButton><span>Page {page+1}</span><FormButton variant="secondary" className="px-6" disabled={(page+1)*12 >= current.count} onClick={() => paginate(page+1)}>Next</FormButton></nav>
    </>}
  </PublicShopLayout>
}
