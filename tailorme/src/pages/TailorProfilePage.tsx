import TailorBankDetails from '../components/portal/TailorBankDetails'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import PortalLayout from '../components/portal/PortalLayout'
import { DashboardHeading, DashboardPanel } from '../components/portal/DashboardParts'
import ShopProfileForm from '../components/portal/ShopProfileForm'
import ShopMediaEditor from '../components/portal/ShopMediaEditor'
import FormButton from '../components/ui/FormButton'
import { shopService } from '../services/shopService'
import type { PortfolioImage, Shop, ShopFields } from '../services/shopService'
import { authError } from '../services/authService'
import './Shops.css'

export default function TailorProfilePage() {
  const { session } = useAuth()
  const [attempt,setAttempt] = useState(0)
  const [result,setResult] = useState<{ key: string; shop: Shop | null; images: PortfolioImage[]; error: string } | null>(null)
  const [pending,setPending] = useState(false)
  const [mediaBusy,setMediaBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const busy = useRef(false)
  const key = `${session?.user.id}:${attempt}`
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const shop = await shopService.initialize()
        const images = await shopService.portfolio(shop.owner_id)
        if (active) setResult({ key,shop,images,error: '' })
      } catch (cause) { if (active) setResult({ key,shop: null,images: [],error: authError(cause) }) }
    }
    void load()
    return () => { active = false }
  },[key])
  const current = result?.key === key ? result : null
  async function save(fields: ShopFields, publish: boolean) {
    if (!current?.shop || busy.current || mediaBusy) return
    busy.current = true; setPending(true); setMessage(''); setError('')
    try {
      const shop = await shopService.save(fields,publish,current.shop.version)
      setResult({ ...current,shop }); setMessage(publish ? 'Shop saved and published in the directory.' : 'Shop saved and unpublished. Uploaded images remain public by URL.')
    } catch (cause) { setError(`${authError(cause)} Reload to reconcile before retrying.`) }
    finally { busy.current = false; setPending(false) }
  }
  return <PortalLayout><DashboardHeading eyebrow="Artisan panel / Shop profile" title="Your Public Atelier" description="Introduce your craft, your space, and the details that make it yours." />
    <div className="flex flex-wrap items-center gap-4 mb-8"><FormButton variant="secondary" className="px-5" disabled={pending || mediaBusy} onClick={() => { setMessage(''); setError(''); setAttempt((value) => value+1) }}>Reload Profile</FormButton><Link to="/tailors" className="underline">Browse Directory</Link><a href="#shop-photos" className="underline min-h-11 inline-flex items-center">Shop photo / cover</a></div>
    {!current ? <p role="status">Loading your approved shop profile…</p> : current.error || !current.shop ? <DashboardPanel title="Profile unavailable"><p role="alert">{current.error || 'Your shop profile could not be loaded.'}</p><FormButton className="mt-6" onClick={() => setAttempt((value) => value+1)}>Retry</FormButton></DashboardPanel> : <>
      <DashboardPanel title="Business Details"><div className="flex flex-wrap items-center gap-4 mb-8"><span className="portal-gold-tag">{current.shop.is_published ? 'Published' : 'Unpublished'}</span>{current.shop.is_published && <Link to={`/tailors/${current.shop.owner_id}`} className="underline">View Public Shop</Link>}</div><ShopProfileForm key={key} shop={current.shop} pending={pending || mediaBusy} onSave={save} /><p role="status" className="mt-4">{message}</p><p role="alert" className="mt-4 text-error">{error}</p></DashboardPanel>
      <ShopMediaEditor shop={current.shop} images={current.images} disabled={pending} onBusy={setMediaBusy} onShop={(shop) => setResult((old) => old?.key === key ? { ...old,shop } : old)} onImages={(images) => setResult((old) => old?.key === key ? { ...old,images } : old)} />
      <TailorBankDetails key={`bank:${session?.user.id}`}/>
    </>}
  </PortalLayout>
}
