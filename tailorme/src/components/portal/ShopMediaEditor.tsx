import { useEffect, useRef, useState } from 'react'
import type { PortfolioImage, Shop } from '../../services/shopService'
import { ShopImage } from '../shops/ShopCard'
import { publicShopImage, shopService } from '../../services/shopService'
import { uploadShopImage } from '../../services/shopUploads'
import { authError } from '../../services/authService'
import FormButton from '../ui/FormButton'

function UploadPreview({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <figure className="mt-4"><img ref={ref} className="shop-upload-preview" alt="Selected photo preview" /><figcaption className="text-sm mt-2 break-words">{file.name}</figcaption></figure>
}

function UploadControl({ id, label, disabled, choose }: { id: string; label: string; disabled: boolean; choose: (file: File | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="shop-upload-control">
    <input ref={input} id={id} className="sr-only" tabIndex={-1} type="file" aria-label={label} aria-describedby={`${id}-help`} disabled={disabled} accept="image/jpeg,image/png,image/webp" onChange={(event) => { choose(event.target.files?.[0]); event.target.value = '' }} />
    <FormButton className="shop-upload-button" disabled={disabled} aria-describedby={`${id}-help`} onClick={() => input.current?.click()}><span aria-hidden="true">↑</span>{label}</FormButton>
    <p id={`${id}-help`} className="text-sm text-on-surface-variant">JPEG, PNG or WebP · Up to 5 MB per photo</p>
  </div>
}

function CaptionEditor({ image, disabled, save }: { image: PortfolioImage; disabled: boolean; save: (id: string, caption: string) => void }) {
  const [caption, setCaption] = useState(image.caption)
  return <div><label htmlFor={`caption-${image.id}`} className="block text-sm mt-3 mb-2">Caption</label><input id={`caption-${image.id}`} className="shop-textarea" maxLength={300} disabled={disabled} value={caption} onChange={(event) => setCaption(event.target.value)} /><FormButton variant="secondary" className="w-full mt-3" disabled={disabled || caption === image.caption} onClick={() => save(image.id,caption)}>Save Caption</FormButton></div>
}

export default function ShopMediaEditor({ shop, images, disabled, onShop, onImages, onBusy }: {
  shop: Shop; images: PortfolioImage[]; disabled: boolean; onShop: (shop: Shop) => void
  onImages: (images: PortfolioImage[]) => void; onBusy: (busy: boolean) => void
}) {
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const busy = useRef(false)
  async function action(work: () => Promise<void>) {
    if (busy.current || disabled) return
    busy.current = true; setPending(true); onBusy(true); setError(''); setMessage(''); setProgress(null)
    try { await work() } catch (cause) { setError(authError(cause)) }
    finally { busy.current = false; setPending(false); onBusy(false); setProgress(null); setUploading(null) }
  }
  async function cleanup(path: string) {
    try { await shopService.deleteFile(path,shop.owner_id) }
    catch { setMessage('The image reference was updated, but file cleanup could not finish. Use Clean Unused Uploads after one hour.') }
  }
  function choose(file: File | undefined, kind: 'cover' | 'portfolio') {
    if (!file || busy.current || disabled || (kind === 'portfolio' && images.length >= 20)) return
    void action(async () => {
      setUploading(file)
      const { result } = await uploadShopImage({ file, userId: shop.owner_id, kind, progress: setProgress,
        attach: async (path) => kind === 'cover' ? shopService.cover(path,shop.version) : shopService.addImage(path,caption) })
      if (kind === 'cover') { onShop(result as Shop); if (shop.cover_path) await cleanup(shop.cover_path) }
      else { onImages([...images,result as PortfolioImage]); setCaption('') }
      setMessage((current) => current || 'Image uploaded and saved.')
    })
  }
  return <section className="portal-card mt-8">
    <h2 className="font-display-lg text-headline-sm mb-4" id="shop-photos">Shop photo / cover (optional)</h2>
    <p className="shop-public-notice">These photos will be publicly visible. Upload only shop or garment photos you have permission to share.</p>
    <fieldset disabled={pending || disabled} className="mt-8 space-y-8">
      <div><h3 className="font-semibold mb-4">Public shop cover</h3>{shop.cover_path ? <><ShopImage className="shop-editor-cover" path={shop.cover_path} shopName={shop.shop_name} alt="Your shop cover" /><FormButton variant="secondary" className="mt-4 px-5" onClick={() => { void action(async () => {
        const updated = await shopService.cover(null,shop.version); onShop(updated)
        await cleanup(shop.cover_path!); setMessage((current) => current || 'Cover removed. Your shop publication status is unchanged.')
      }) }}>Remove Cover</FormButton></> : <p className="text-on-surface-variant">A cover photo is optional. Your shop can be published without one.</p>}
      <UploadControl id="cover-upload" label={shop.cover_path?'Replace cover photo':'Upload cover photo'} disabled={pending || disabled} choose={(file) => choose(file, 'cover')} /></div>
      <div><h3 className="font-semibold mb-4">Photos of your work (optional) ({images.length}/20)</h3><label htmlFor="new-portfolio-caption" className="block text-sm mb-2">Caption for the next image (optional)</label><input id="new-portfolio-caption" maxLength={300} className="shop-textarea" value={caption} onChange={(event) => setCaption(event.target.value)} /><UploadControl id="portfolio-upload" label="Add work photos" disabled={images.length >= 20 || pending || disabled} choose={(file) => choose(file, 'portfolio')} /><p className="text-sm mt-2 text-on-surface-variant">{images.length >= 20 ? 'Remove a photo to add another.' : 'Add one photo at a time, up to 20. Work photos are optional.'}</p>
      <div className="shop-portfolio-grid mt-6">{images.map((image) => <article key={image.id} className="shop-portfolio-edit"><img src={publicShopImage(image.image_path)} alt={image.caption || 'Shop portfolio work'} loading="lazy" /><CaptionEditor key={`${image.id}:${image.caption}`} image={image} disabled={pending || disabled} save={(id,value) => { void action(async () => { await shopService.caption(id,value); onImages(images.map((item) => item.id === id ? { ...item,caption: value.trim() } : item)); setMessage('Caption saved.') }) }} /><FormButton variant="secondary" className="mt-3 w-full" onClick={() => { void action(async () => { const path = await shopService.removeImage(image.id); onImages(images.filter((item) => item.id !== image.id)); await cleanup(path); setMessage((current) => current || 'Portfolio image removed.') }) }}>Remove Image</FormButton></article>)}</div></div>
      <div className="border-t border-outline-variant pt-6"><FormButton variant="secondary" className="px-5" onClick={() => { void action(async () => {
        const unused = await shopService.unused()
        for (const { path } of unused) await shopService.deleteFile(path,shop.owner_id)
        const remaining = await shopService.unused()
        setMessage(remaining.length ? 'Some unused uploads remain. Reload and try cleanup again.' : `Cleanup checked ${unused.length} unused files. Only unreferenced uploads older than one hour are eligible.`)
      }) }}>Clean Unused Uploads</FormButton><p className="text-sm text-on-surface-variant mt-3">This removes only your unreferenced files older than one hour, including uploads interrupted before saving. It never removes files attached to a shop or portfolio.</p></div>
    </fieldset>
    {uploading && <UploadPreview file={uploading} />}
    {progress !== null && <div className="mt-6" role="status" aria-live="polite"><label htmlFor="shop-upload-progress">{progress === 100 ? 'Upload complete. Saving your photo...' : `Uploading image: ${progress}%`}</label><progress id="shop-upload-progress" className="w-full mt-2" max={100} value={progress}>{progress}%</progress></div>}
    <p role="status" aria-live="polite" className="mt-4">{message || (pending && progress === null ? uploading ? 'Preparing your photo...' : 'Updating shop images...' : '')}</p><p role="alert" className="mt-4 text-error">{error}</p>
  </section>
}
