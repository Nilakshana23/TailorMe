import {useAuth} from '../auth/authContext'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import RequestComposer from '../components/portal/RequestComposer'
import PublicShopLayout from '../components/shops/PublicShopLayout'
import { ShopImage } from '../components/shops/ShopCard'
import FormButton from '../components/ui/FormButton'
import { shopService } from '../services/shopService'
import type { PublicShop, PortfolioImage } from '../services/shopService'
import { authError } from '../services/authService'

export default function PublicTailorPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const {session}=useAuth()
  const [attempt,setAttempt] = useState(0)
  useEffect(()=>{
    const refresh=()=>setAttempt(value=>value+1)
    window.addEventListener('focus',refresh);window.addEventListener('tailorme:shop-media-changed',refresh)
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('tailorme:shop-media-changed',refresh)}
  },[])
  const [result,setResult] = useState<{ key: string; shop: PublicShop | null; images: PortfolioImage[]; error: string } | null>(null)
  const key = `${id}:${attempt}`
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const shop = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? await shopService.published(id) : null
        const images = shop ? await shopService.portfolio(id) : []
        if (active) setResult({ key,shop,images,error: '' })
      } catch (cause) { if (active) setResult({ key,shop: null,images: [],error: authError(cause) }) }
    }
    void load()
    return () => { active = false }
  },[key,id])
  const current = result?.key === key ? result : null
  const shop = current?.shop
  return <PublicShopLayout><Link to={`/tailors${location.search}`} className="shop-back-control">← Back to Tailors</Link>
    {!current ? <p role="status">Loading shop and portfolio…</p> : current.error ? <div><p role="alert">Unable to load this shop. {current.error}</p><FormButton className="mt-6" onClick={() => setAttempt((value) => value+1)}>Retry</FormButton></div> : !shop ? <div className="shop-directory-empty"><h1 className="font-display-lg text-headline-md">Shop not available</h1><p className="mt-4">This shop does not exist or is not currently published.</p></div> : <>
      <header className="shop-detail-header"><ShopImage path={shop.cover_path} alt={`${shop.shop_name} shop cover`} shopName={shop.shop_name} className="shop-public-cover" /><div><h1 className="font-display-lg text-headline-md break-words">{shop.shop_name}</h1><p className="mt-2 break-words">{shop.city} ? {shop.specialties}</p><p className="portal-gold-tag mt-3">{shop.accepting_requests?'Accepting requests':'Not accepting requests'}</p><p className="text-sm mt-3">Application reviewed</p></div></header>
      <div className="shop-detail-grid mt-10"><section><h2 className="font-display-lg text-headline-sm">About</h2><p className="mt-6 text-body-lg whitespace-pre-wrap break-words text-on-surface-variant">{shop.description}</p><h2 className="font-display-lg text-headline-sm mt-10">Specialties</h2><p className="mt-4 break-words">{shop.specialties}</p></section><aside className="portal-card"><dl className="shop-contact-details"><div><dt>Public Business Address</dt><dd>{shop.public_address}</dd></div><div><dt>Business Phone</dt><dd>{shop.business_phone}</dd></div><div><dt>Experience</dt><dd>{shop.years_experience===null?'Not specified':`${shop.years_experience} years`}</dd></div></dl></aside></div>
      <RequestComposer key={`${session?.user.id}:${shop.owner_id}:${new URLSearchParams(location.search).get('design')??'none'}`} designId={new URLSearchParams(location.search).get('design')} tailorId={shop.owner_id} available={shop.accepting_requests} />
      <p className="mt-8 text-sm text-secondary">Application reviewed. Application photos support review; they do not prove skill or identity.</p>
      {current.images.length>0&&<section className="shop-work-photos"><h2 className="font-display-lg text-headline-md mb-8">Work Photos</h2>{current.images.length ? <div className="shop-portfolio-grid">{current.images.map((image) => <figure key={image.id}><ShopImage path={image.image_path} alt={image.caption || `${shop.shop_name} portfolio work`} shopName={shop.shop_name} /><figcaption className="mt-3 whitespace-pre-wrap break-words">{image.caption}</figcaption></figure>)}</div> : <p className="shop-directory-empty">This shop has chosen not to share public work photos.</p>}</section>}
    </>}
  </PublicShopLayout>
}
