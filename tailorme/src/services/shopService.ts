import { supabase, configurationError } from '../lib/supabase'

export const SHOP_BUCKET = 'tailor-public'
export type ShopFields = {
  shop_name: string; description: string; specialties: string; city: string
  public_address: string; business_phone: string; years_experience: number | null; accepting_requests: boolean
}
export type PublicShop = ShopFields & { owner_id: string; is_published: boolean; cover_path: string | null }
export type Shop = PublicShop & { version: number; created_at: string; updated_at: string }
export type PortfolioImage = { id: string; owner_id: string; image_path: string; caption: string }
export type DirectoryFilters = { search: string; city: string; specialty: string; page: number; excludeOwnerId?: string }
export const publicShopColumns = 'owner_id,shop_name,description,specialties,city,public_address,business_phone,years_experience,accepting_requests,is_published,cover_path'
function client() {
  if (!supabase) throw new Error(configurationError ?? 'Supabase is unavailable.')
  return supabase
}
export function publicShopImage(path: string | null) {
  return path && supabase ? supabase.storage.from(SHOP_BUCKET).getPublicUrl(path).data.publicUrl : ''
}
export function escapeLike(value: string) { return value.trim().replace(/[\\%_]/g, '\\$&') }
async function rpc<T>(name: string, args = {}): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}
export const shopService = {
  initialize: () => rpc<Shop>('initialize_tailor_profile'),
  save: (fields: ShopFields, publish: boolean, version: number) => rpc<Shop>('save_tailor_profile', { p_fields: fields, p_publish: publish, p_expected_version: version }),
  async cover(path: string | null, version: number) {
    const shop=await rpc<Shop>('set_tailor_cover',{p_path:path,p_expected_version:version})
    window.dispatchEvent(new Event('tailorme:shop-media-changed'))
    return shop
  },
  addImage: (path: string, caption: string) => rpc<PortfolioImage>('add_tailor_portfolio', { p_path: path, p_caption: caption }),
  caption: (id: string, caption: string) => rpc<void>('caption_tailor_portfolio', { p_id: id, p_caption: caption }),
  removeImage: (id: string) => rpc<string>('remove_tailor_portfolio', { p_id: id }),
  unused: () => rpc<{ path: string }[]>('unused_tailor_uploads'),
  async portfolio(ownerId: string): Promise<PortfolioImage[]> {
    const { data, error } = await client().from('tailor_portfolio').select('id,owner_id,image_path,caption').eq('owner_id', ownerId).order('id')
    if (error) throw new Error(error.message)
    return data as PortfolioImage[]
  },
  async directory(filters: DirectoryFilters): Promise<{ shops: PublicShop[]; count: number }> {
    let query = client().from('tailor_profiles').select(publicShopColumns, { count: 'exact' }).eq('is_published', true)
    if (filters.excludeOwnerId) query=query.neq('owner_id',filters.excludeOwnerId)
    if (filters.search.trim()) query = query.ilike('shop_name', `%${escapeLike(filters.search)}%`)
    if (filters.city.trim()) query = query.ilike('city', `%${escapeLike(filters.city)}%`)
    if (filters.specialty.trim()) query = query.ilike('specialties', `%${escapeLike(filters.specialty)}%`)
    const page = Math.max(0, filters.page)
    const { data, error, count } = await query.order('shop_name').order('owner_id').range(page * 12, page * 12 + 11)
    if (error) throw new Error(error.message)
    return { shops: data as PublicShop[], count: count ?? 0 }
  },
  async published(ownerId: string): Promise<PublicShop | null> {
    const { data, error } = await client().from('tailor_profiles').select(publicShopColumns).eq('owner_id', ownerId).eq('is_published', true).maybeSingle()
    if (error) throw new Error(error.message)
    return data as PublicShop | null
  },
  async deleteFile(path: string, userId: string) {
    if (!isOwnShopPath(path, userId)) throw new Error('Refusing to remove a file outside your shop folder.')
    const { error } = await client().storage.from(SHOP_BUCKET).remove([path])
    if (error) throw new Error('The unused file could not be removed. Use Clean Unused Uploads later.')
  },
}
export function isOwnShopPath(path: string, userId: string) {
  return path.split('/')[0] === userId && /^[0-9a-f-]{36}\/(cover|portfolio)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)
}
