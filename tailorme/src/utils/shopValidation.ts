import { validateApplication } from './applicationValidation'
import type { ShopFields } from '../services/shopService'

export function shopInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0,2).map((word) => Array.from(word)[0]).join('').toUpperCase() || 'TM'
}

export function validateShop(fields: ShopFields, publish: boolean) {
  const errors = validateApplication({ shop_name: fields.shop_name, phone: fields.business_phone, city: fields.city,
    address: fields.public_address, description: fields.description, specialties: fields.specialties, years_experience: fields.years_experience }, publish)
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [key === 'phone' ? 'business_phone' : key === 'address' ? 'public_address' : key, value])) as Partial<Record<keyof ShopFields, string>>
}
export function shopFields(shop: ShopFields): ShopFields {
  return { shop_name: shop.shop_name, description: shop.description, specialties: shop.specialties, city: shop.city,
    public_address: shop.public_address, business_phone: shop.business_phone, years_experience: shop.years_experience, accepting_requests: shop.accepting_requests }
}
export const MAX_SHOP_IMAGE_BYTES = 5 * 1024 * 1024
export const shopImageExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export async function validateShopImage(file: File) {
  if (!shopImageExtensions[file.type]) throw new Error('Choose a JPEG, PNG, or WebP image. SVG is not allowed.')
  if (file.size <= 0 || file.size > MAX_SHOP_IMAGE_BYTES) throw new Error('Choose an image larger than 0 bytes and no larger than 5 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) {
    throw new Error('The image contents do not match its type. Export it as JPEG, PNG, or WebP and try again.')
  }
}
