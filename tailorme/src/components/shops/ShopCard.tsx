import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PublicShop } from '../../services/shopService'
import { publicShopImage } from '../../services/shopService'
import { shopInitials } from '../../utils/shopValidation'

export function ShopImage({ path, alt, shopName = 'TailorMe', className = '' }: { path: string | null; alt: string; shopName?: string; className?: string }) {
  const url = publicShopImage(path)
  const [failed,setFailed] = useState('')
  return url && failed !== url ? <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(url)} /> : <div className={`shop-image-placeholder ${className}`} role="img" aria-label={`${shopName} — TailorMe shop initials`}><span className="shop-brand-initials" aria-hidden="true">{shopInitials(shopName)}</span><span className="font-display-lg">TailorMe</span></div>
}
export default function ShopCard({ shop, query = '' }: { shop: PublicShop; query?: string }) {
  return <article className="shop-card"><Link to={`/tailors/${shop.owner_id}${query}`} className="shop-card-link"><div className="shop-card-photo"><ShopImage path={shop.cover_path} alt={`${shop.shop_name} shop cover`} shopName={shop.shop_name} /><span className="shop-availability">{shop.accepting_requests ? 'Open to new requests' : 'Not taking new requests'}</span></div><h2 className="font-display-lg text-headline-sm mt-5 break-words">{shop.shop_name}</h2><p className="mt-2 text-label-sm uppercase tracking-widest text-secondary break-words">{shop.specialties}</p><p className="mt-3 text-on-surface-variant line-clamp-2">{shop.description}</p><p className="mt-3 text-sm">{shop.city} · {shop.years_experience??'Not specified'} {shop.years_experience===null?'':'years of experience'}</p><p className="mt-3 text-label-sm text-secondary">Application reviewed</p><span className="shop-view-action">View shop</span></Link></article>
}
