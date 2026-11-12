import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

// Compile the real TSX components in memory. Stub only the Supabase transport:
// no environment files, tokens, accounts, or network requests are used by tests.
const modules = new Map()
function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href)
  let source
  if (url.pathname.endsWith('/lib/supabase.ts')) {
    source = 'export let supabase = null; export function setSupabase(value) { supabase = value; } export const configurationError = null; export const authRedirect = { present: true, error: null };'
  } else if (/\.(css|png)$/.test(url.pathname)) {
    source = 'export default "";'
  } else {
    source = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    }).outputText
    // SSR does not run Navigate effects. Record the real component's navigation
    // props at the router boundary so tests can assert destinations and replace.
    if (source.includes('import { Link, Navigate, useLocation }')) {
      source = source.replace('import { Link, Navigate, useLocation }', 'import { Link, useLocation }')
      source += '\nfunction Navigate(props) { globalThis.__tailormeNavigation = props; return null; }'
    }
    source = source.replace(/from\s+['"]([^'"]+)['"]/g, (_, specifier) => {
      if (!specifier.startsWith('.')) return `from '${import.meta.resolve(specifier)}'`
      let child = new URL(specifier, url)
      if (!existsSync(child)) {
        child = ['.ts', '.tsx'].map((extension) => new URL(specifier + extension, url)).find((candidate) => existsSync(candidate))
        assert.ok(child, `Module exists: ${specifier}`)
      }
      return `from '${moduleUrl(child)}'`
    }).replace(/import\s+['"][^'"]+\.css['"];?/g, '')
  }
  const compiled = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  modules.set(url.href, compiled)
  return compiled
}
const load = (path) => import(moduleUrl(new URL(path, import.meta.url)))
const { AuthContext } = await load('../src/auth/authContext.ts')
const { PortalContext, dashboardPath } = await load('../src/auth/portalContext.ts')
const { default: PortalGuard } = await load('../src/auth/PortalGuard.tsx')
const { default: AccountPage } = await load('../src/pages/AccountPage.tsx')
const dashboards = await load('../src/pages/Dashboards.tsx')
const { default: AuthCallbackPage } = await load('../src/pages/AuthCallbackPage.tsx')
const { default: LoginPage } = await load('../src/pages/LoginPage.tsx')
const { authRedirect } = await load('../src/lib/supabase.ts')
const { default: ApplicationForm } = await load('../src/components/portal/ApplicationForm.tsx')
const { default: ApplicationReview } = await load('../src/components/portal/ApplicationReview.tsx')
const { default: ApplicationDetails } = await load('../src/components/portal/ApplicationDetails.tsx')
const { validateApplication, canEditApplication, emptyApplication } = await load('../src/utils/applicationValidation.ts')
const { default: ShopCard } = await load('../src/components/shops/ShopCard.tsx')
const { default: ShopProfileForm } = await load('../src/components/portal/ShopProfileForm.tsx')
const { default: ShopMediaEditor } = await load('../src/components/portal/ShopMediaEditor.tsx')
const { default: TailorDirectoryPage } = await load('../src/pages/TailorDirectoryPage.tsx')
const { validateShop, validateShopImage, shopFields, shopInitials } = await load('../src/utils/shopValidation.ts')
const { escapeLike, isOwnShopPath } = await load('../src/services/shopService.ts')
const { uploadShopImage } = await load('../src/services/shopUploads.ts')
const { default: ApplicationEvidence, EvidenceSummary } = await load('../src/components/portal/ApplicationEvidence.tsx')
const { EVIDENCE_BUCKET, EVIDENCE_PREVIEW_SECONDS, isOwnEvidencePath, uploadApplicationEvidence } = await load('../src/services/evidenceService.ts')
const h = React.createElement
const profile = { id: 'test-user', full_name: 'Avery Test', created_at: '', updated_at: '' }
const session = { user: { id: profile.id, email: 'avery@example.test' } }
function render(child, auth = {}, portal = {}, entry = '/') {
  globalThis.__tailormeNavigation = null
  return renderToString(h(MemoryRouter, { initialEntries: [entry] },
    h(AuthContext.Provider, { value: { session, loading: false, error: null, recovery: false, ...auth } },
      h(PortalContext.Provider, { value: { profile, role: 'customer', status: 'ready', error: '', retry() {}, ...portal } }, child))))
}
const guarded = (role) => h(PortalGuard, { role }, h('p', null, 'PRIVATE PORTAL CONTENT'))

test('Google button is a separate non-submit action', () => {
  const html = render(h(LoginPage))
  assert.match(html, /<button type="button"[^>]*aria-busy="false"[^>]*>[\s\S]*?<span>Google<\/span>/)
  assert.doesNotMatch(html, /Google sign-in is temporarily unavailable/)
})
test('callback waits for SDK session restoration', () => {
  assert.match(render(h(AuthCallbackPage), { loading: true }), /Completing sign-in/)
})
test('successful callback hands off to the role resolver', () => {
  assert.equal(render(h(AuthCallbackPage)), '')
})
test('callback reports provider cancellation even with a pre-existing session', () => {
  authRedirect.error = 'Google sign-in was cancelled'
  try {
    const html = render(h(AuthCallbackPage))
    assert.match(html, /role="alert"/)
    assert.match(html, /Google sign-in was cancelled/)
    assert.match(html, /Back to Sign In/)
  } finally { authRedirect.error = null }
})
test('callback without a returning session offers another sign-in attempt', () => {
  assert.match(render(h(AuthCallbackPage), { session: null }), /Sign-in could not be completed/)
})

for (const role of ['customer', 'tailor', 'admin']) {
  test(`${role}: matching role renders and resolves the correct dashboard path`, () => {
    assert.equal(dashboardPath(role), `/${role}/dashboard`)
    assert.match(render(guarded(role), {}, { role }), /PRIVATE PORTAL CONTENT/)
  })
  for (const visitor of ['customer', 'tailor', 'admin'].filter((other) => other !== role)) {
    test(`${visitor} cannot render ${role} portal`, () => {
      assert.doesNotMatch(render(guarded(role), {}, { role: visitor }), /PRIVATE PORTAL CONTENT/)
    })
  }
}
test('unauthenticated, restoring, and recovering sessions cannot render a portal', () => {
  for (const auth of [{ session: null }, { loading: true }, { recovery: true }]) {
    assert.doesNotMatch(render(guarded('customer'), auth), /PRIVATE PORTAL CONTENT/)
  }
})
for (const status of ['loading', 'missing-profile', 'missing-role', 'error']) {
  test(`${status} blocks portal and presents an accessible state`, () => {
    const html = render(guarded('customer'), {}, { status, role: null, error: 'Connection failed' })
    assert.doesNotMatch(html, /PRIVATE PORTAL CONTENT/)
    assert.match(html, status === 'loading' ? /role="status"/ : /role="alert"/)
    if (status !== 'loading') assert.match(html, /Retry/)
  })
}
test('auth errors block portal content', () => {
  assert.doesNotMatch(render(guarded('customer'), { error: 'Session failed' }), /PRIVATE PORTAL CONTENT/)
})
test('profile page uses database name, actual email, and role-aware dashboard link', () => {
  const html = render(h(AccountPage), {}, { role: 'tailor' })
  assert.match(html, /Avery Test/)
  assert.match(html, /avery@example.test/)
  assert.match(html, /href="\/tailor\/dashboard"/)
  assert.match(html, /Log Out/)
})
for (const [component, role, heading] of [
  ['CustomerDashboard', 'customer', 'My Requests'],
  ['TailorDashboard', 'tailor', 'Request overview'],
  ['AdminDashboard', 'admin', 'User Management'],
]) {
  test(`${role} screen uses real name and honest empty states`, () => {
    const html = render(h(dashboards[component]), {}, { role })
    assert.match(html, /Avery Test/)
    assert.match(html, new RegExp(heading))
    assert.doesNotMatch(html, /0 active orders|\$0\.00|These zeros|All counts are placeholders|Order tracking is not connected/)
    if(role!=='admin')assert.match(html, /href="\/(customer|tailor)\/requests"/)
    assert.match(html, /Log Out/)
    assert.doesNotMatch(html, /Julian|42,850|142,850|Alessandro Vieri/)
  })
}

const submittedFields = { shop_name: 'Avery Atelier', phone: '+94 11 222 3344', city: 'Colombo', address: '123 Main Street', description: 'A bespoke tailoring studio focused on individual fit.', specialties: 'Suits, alterations', years_experience: 5 }
const testApplication = { ...submittedFields, applicant_id: 'test-user', status: 'pending', version: 2,
  created_at: '2026-10-26T10:00:00Z', updated_at: '2026-10-26T10:00:00Z', reviewer_id: null, reviewed_at: null, rejection_reason: null }
test('incomplete drafts validate but incomplete submissions do not', () => {
  assert.deepEqual(validateApplication(emptyApplication, false), {})
  assert.equal(Object.keys(validateApplication(emptyApplication, true)).length, 7)
  assert.deepEqual(validateApplication(submittedFields, true), {})
})
test('field validation rejects invalid years, phone, and oversized business fields', () => {
  for (const value of [-1, 81, 1.5, Number.NaN]) assert.ok(validateApplication({ ...submittedFields, years_experience: value }, false).years_experience)
  for (const value of ['invalid', '123', '1234567890123456']) assert.ok(validateApplication({ ...submittedFields, phone: value }, true).phone)
  assert.ok(validateApplication({ ...submittedFields, shop_name: 'x'.repeat(161) }, false).shop_name)
})
test('only new, draft and rejected applications are editable', () => {
  assert.ok(canEditApplication())
  assert.ok(canEditApplication('draft'))
  assert.ok(canEditApplication('rejected'))
  assert.equal(canEditApplication('pending'), false)
  assert.equal(canEditApplication('approved'), false)
})
test('draft form includes all business fields and separate save/submit actions', () => {
  const html = render(h(ApplicationForm, { application: null, pending: false, onSave() {} }))
  for (const field of Object.keys(emptyApplication)) assert.match(html, new RegExp(`name="${field}"`))
  assert.match(html, /Save Draft/)
  assert.match(html, /Submit Application/)
  assert.match(html, /type="button"/)
})
test('rejected application form permits resubmission', () => {
  const html = render(h(ApplicationForm, { application: { ...testApplication, status: 'rejected' }, pending: false, onSave() {} }))
  assert.match(html, /Resubmit Application/)
})
test('review decisions appear only for pending applications and require a rejection reason', () => {
  const html = render(h(ApplicationReview, { application: testApplication, onReviewed() {} }), {}, { role: 'admin' })
  assert.match(html, /Approve Application/)
  assert.match(html, /Reject Application/)
  assert.match(html, /Rejection Reason \(required to reject\)/)
  for (const status of ['draft', 'approved', 'rejected']) {
    const decided = render(h(ApplicationReview, { application: { ...testApplication, status }, onReviewed() {} }), {}, { role: 'admin' })
    assert.doesNotMatch(decided, /Approve Application|Reject Application/)
  }
})
test('application details show returned rejection reason as escaped text', () => {
  const html = render(h(ApplicationDetails, { application: { ...testApplication, status: 'rejected', rejection_reason: '<script>Provide a clearer address</script>' } }))
  assert.match(html, /Rejection reason/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})
test('navigation offers role-specific application links', () => {
  const customer = render(h(dashboards.CustomerDashboard))
  assert.match(customer, /href="\/become-a-tailor"/)
  assert.doesNotMatch(customer, /href="\/admin\/tailor-applications"/)
  const admin = render(h(dashboards.AdminDashboard), {}, { role: 'admin' })
  assert.match(admin, /href="\/admin\/tailor-applications"/)
  assert.doesNotMatch(admin, /href="\/become-a-tailor"/)
})

const shop = { owner_id: '40000000-0000-4000-8000-000000000001',shop_name: 'Avery Atelier',description: 'Thoughtful bespoke craftsmanship and alterations.',specialties: 'Bridal, suits',city: 'Colombo',public_address: '123 Public Street',business_phone: '+94112223344',years_experience: 5,accepting_requests: true,is_published: false,cover_path: null,version: 1,created_at: '',updated_at: '' }
test('shop fields exclude application and account data and validate publication', () => {
  const fields = shopFields({ ...shop, review_reason: 'private', email: 'private@example.test' })
  assert.deepEqual(Object.keys(fields).sort(), ['shop_name','description','specialties','city','public_address','business_phone','years_experience','accepting_requests'].sort())
  assert.deepEqual(validateShop(fields,true), {})
  assert.ok(validateShop({ ...fields,public_address: '' },true).public_address)
  assert.deepEqual(validateShop({ ...fields,public_address: '' },false), {})
})
test('shop profile editor has explicit publish controls and public business labels', () => {
  const html = render(h(ShopProfileForm,{ shop,pending: false,onSave() {} }),{},{ role: 'tailor' })
  assert.match(html,/Public Business Address/)
  assert.match(html,/Business Phone/)
  assert.match(html,/Publish Shop/)
  assert.match(html,/Available for new requests/)
  assert.match(render(h(ShopProfileForm,{ shop: { ...shop,is_published: true },pending: false,onSave() {} })),/Unpublish Shop/)
})
test('public card has real details and availability without fabricated business metrics', () => {
  const html = render(h(ShopCard,{ shop }))
  assert.match(html,/Avery Atelier/)
  assert.match(html,/Colombo/)
  assert.match(html,/Open to new requests/)
  assert.doesNotMatch(html,/ratings?|reviews|\$|orders|Skill verified|Quality guaranteed/i)
  assert.match(html,/Application reviewed/)
})
test('directory includes name, city, specialty filters and accessible loading', () => {
  const html = render(h(TailorDirectoryPage))
  assert.match(html,/Shop Name/)
  assert.match(html,/Specialty/)
  assert.match(html,/City/)
  assert.match(html,/Loading published shops/)
  assert.match(html,/role="status"/)
})
test('shop media explains public visibility and provides upload controls', () => {
  const html = render(h(ShopMediaEditor,{ shop,images: [],disabled: false,onShop() {},onImages() {},onBusy() {} }))
  assert.match(html,/These photos will be publicly visible/)
  assert.match(html,/photos you have permission to share/)
  assert.match(html,/Upload cover photo/)
  assert.match(html,/Add work photos/)
  assert.match(html,/Clean Unused Uploads/)
  assert.match(html,/accept="image\/jpeg,image\/png,image\/webp"/)
})
test('storage cleanup path validation cannot target another owner or path traversal', () => {
  const path = `${shop.owner_id}/cover/40000000-0000-4000-8000-000000000010.jpg`
  assert.ok(isOwnShopPath(path,shop.owner_id))
  assert.equal(isOwnShopPath(path,'40000000-0000-4000-8000-000000000002'),false)
  assert.equal(isOwnShopPath(`${shop.owner_id}/../private.jpg`,shop.owner_id),false)
  assert.equal(isOwnShopPath(`${shop.owner_id}/cover/file.svg`,shop.owner_id),false)
  assert.equal(escapeLike(' %_\\ '),'\\%\\_\\\\')
})
const pngFile = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'shop.png',{ type: 'image/png' })
test('image validation accepts supported signatures and rejects SVG/spoofed/oversized input', async () => {
  await validateShopImage(pngFile())
  await assert.rejects(validateShopImage(new File(['<svg/>'],'shop.svg',{ type: 'image/svg+xml' })),/SVG/)
  await assert.rejects(validateShopImage(new File(['<svg/>'],'shop.png',{ type: 'image/png' })),/contents/)
  await assert.rejects(validateShopImage(new File([new Uint8Array(5242881)],'large.png',{ type: 'image/png' })),/5 MB/)
})
test('successful upload uses a unique owner-scoped path, attaches after transfer, and skips cleanup', async () => {
  const calls = []
  const result = await uploadShopImage({ file: pngFile(),userId: shop.owner_id,kind: 'portfolio',progress() {},
    transfer: async (path) => { assert.ok(isOwnShopPath(path,shop.owner_id)); calls.push('upload') },
    attach: async () => { calls.push('attach'); return 'saved' },cleanup: async () => { calls.push('cleanup') } })
  assert.deepEqual(calls,['upload','attach'])
  assert.equal(result.result,'saved')
})
test('failed database attachment compensates only the just-uploaded owner file', async () => {
  let transferred
  let cleaned
  await assert.rejects(uploadShopImage({ file: pngFile(),userId: shop.owner_id,kind: 'cover',progress() {},
    transfer: async (path) => { transferred = path },attach: async () => { throw new Error('Database unavailable') },
    cleanup: async (path,owner) => { cleaned = path; assert.equal(owner,shop.owner_id) } }),/Database unavailable/)
  assert.equal(cleaned,transferred)
})
test('cleanup failure leaves an actionable retry message rather than pretending success', async () => {
  await assert.rejects(uploadShopImage({ file: pngFile(),userId: shop.owner_id,kind: 'cover',progress() {},
    transfer: async () => {},attach: async () => { throw new Error('Network interrupted') },cleanup: async () => { throw new Error('Offline') } }),/Clean Unused Uploads/)
})
test('tailor navigation exposes shop editor and all portals link to directory', () => {
  const html = render(h(dashboards.TailorDashboard),{},{ role: 'tailor' })
  assert.match(html,/href="\/tailor\/profile"/)
  assert.match(html,/href="\/tailors"/)
})

test('legacy work-photo summary is honest and does not fabricate evidence', () => {
  for (const status of ['pending','approved']) {
    const html = render(h(EvidenceSummary,{ count: 0,status }))
    assert.match(html,/No evidence provided/)
    assert.match(html,/remain valid without evidence/)
  }
})
test('application photo instructions allow phone photos and explain limited review purpose', () => {
  const html = render(h(ApplicationEvidence,{ application: null,applicantId: profile.id }))
  assert.match(html,/Ordinary phone photos are fine/)
  assert.match(html,/do not prove skill or identity/)
  assert.match(html,/There are no video calls/)
  assert.doesNotMatch(html,/Save your draft first/)
  assert.doesNotMatch(html,/Skill verified|Quality guaranteed/)
})
test('application previews use a separate private bucket and short expiry', () => {
  assert.equal(EVIDENCE_BUCKET,'tailor-application-evidence')
  assert.ok(EVIDENCE_PREVIEW_SECONDS > 0 && EVIDENCE_PREVIEW_SECONDS <= 120)
  const path = `${shop.owner_id}/work/40000000-0000-4000-8000-000000000010.png`
  assert.ok(isOwnEvidencePath(path,shop.owner_id))
  assert.equal(isOwnEvidencePath(path,'40000000-0000-4000-8000-000000000002'),false)
  assert.equal(isOwnEvidencePath(`${shop.owner_id}/portfolio/40000000-0000-4000-8000-000000000010.png`,shop.owner_id),false)
})
test('private upload generates an owner-scoped work path and attaches after transfer', async () => {
  const calls = []
  await uploadApplicationEvidence({ file: pngFile(),userId: shop.owner_id,version: 1,progress() {},
    send: async (path) => { assert.ok(isOwnEvidencePath(path,shop.owner_id)); calls.push('transfer') },
    attach: async (path,version) => { assert.equal(version,1); calls.push('attach'); return { id: 'photo',applicant_id: shop.owner_id,image_path: path } },
    cleanup: async () => { calls.push('cleanup') } })
  assert.deepEqual(calls,['transfer','attach'])
})
test('private upload/attachment failure cleans only its generated work file', async () => {
  let attempted
  let cleaned
  await assert.rejects(uploadApplicationEvidence({ file: pngFile(),userId: shop.owner_id,version: 2,progress() {},
    send: async (path) => { attempted = path },attach: async () => { throw new Error('Pending work photos are locked') },
    cleanup: async (path,owner) => { cleaned = path; assert.equal(owner,shop.owner_id) } }),/locked/)
  assert.equal(cleaned,attempted)
  assert.ok(isOwnEvidencePath(cleaned,shop.owner_id))
})
test('failed private cleanup gives a recovery action without pretending upload success', async () => {
  await assert.rejects(uploadApplicationEvidence({ file: pngFile(),userId: shop.owner_id,version: 1,progress() {},
    send: async () => { throw new Error('Offline') },attach: async () => { throw new Error('must not attach') },
    cleanup: async () => { throw new Error('Offline') } }),/Clean Unused Work Photos/)
})
test('photo-free shops have branded initials and optional public portfolio copy', () => {
  assert.equal(shopInitials('Avery Atelier'),'AA')
  assert.equal(shopInitials('  '),'TM')
  const card = render(h(ShopCard,{ shop: { ...shop,cover_path: null } }))
  assert.match(card,/shop-brand-initials/)
  assert.match(card,/>AA<\/span>/)
  assert.doesNotMatch(card,/Shop image unavailable/)
  const editor = render(h(ShopMediaEditor,{ shop,images: [],disabled: false,onShop() {},onImages() {},onBusy() {} }))
  assert.match(editor,/Photos of your work \(optional\)/)
  assert.match(editor,/can be published without one/)
})

const { default: ApplicationQualifications } = await load('../src/components/portal/ApplicationQualifications.tsx')
const { validateCertificate, validateQualificationDetails, isOwnQualificationPath, uploadApplicationQualification, CERTIFICATE_BUCKET, CERTIFICATE_PREVIEW_SECONDS } = await load('../src/services/qualificationService.ts')
test('qualifications remain optional with honest review language', () => {
  const html = render(h(ApplicationQualifications,{ application: null,applicantId: profile.id }))
  assert.match(html,/Tailoring qualifications \(optional\)/)
  assert.match(html,/You can apply without certificates/)
  assert.match(html,/not automatically authenticated/)
  assert.doesNotMatch(html,/Certificate verified|Skill verified/)
  assert.equal(CERTIFICATE_BUCKET,'tailor-application-certificates')
  assert.equal(CERTIFICATE_PREVIEW_SECONDS,120)
})
test('certificate validation covers PDF signature, image signatures, size and details', async () => {
  await validateCertificate(new File(['%PDF-1.7 test'],'certificate.pdf',{ type: 'application/pdf' }))
  await assert.rejects(validateCertificate(new File(['fake'],'certificate.pdf',{ type: 'application/pdf' })),/not a PDF/)
  await assert.rejects(validateCertificate(new File([new Uint8Array(5242881)],'large.pdf',{ type: 'application/pdf' })),/5 MB/)
  await assert.rejects(validateCertificate(new File(['<svg/>'],'bad.svg',{ type: 'image/svg+xml' })),/JPEG/)
  assert.throws(() => validateQualificationDetails({ course_name: '',institute: '',qualification_level: '' }),/course/)
  assert.throws(() => validateQualificationDetails({ course_name: 'Course',institute: '',qualification_level: '' }),/institute/)
  validateQualificationDetails({ course_name: 'Course',institute: 'Institute',qualification_level: '' })
})
test('certificate uploads attach details after transfer and compensate failures safely', async () => {
  const userId='60000000-0000-4000-8000-000000000001'
  const file=new File(['%PDF-1.7 test'],'certificate.pdf',{ type: 'application/pdf' })
  const details={ course_name: 'Tailoring',institute: 'Institute',qualification_level: '' }
  const events=[]
  const record=await uploadApplicationQualification({ file,userId,version: 1,details,progress() {},
    send: async (path) => { assert.ok(isOwnQualificationPath(path,userId)); events.push('send') },
    attach: async (path,version,fields) => { assert.equal(version,1); assert.deepEqual(fields,details); events.push('attach'); return { ...details,id: 'id',applicant_id: userId,file_path: path } },
    cleanup: async () => assert.fail('successful upload should not clean') })
  assert.deepEqual(events,['send','attach']); assert.match(record.file_path,/\.pdf$/)
  let sent
  await assert.rejects(uploadApplicationQualification({ file,userId,version: 1,details,progress() {},send: async (path) => { sent=path },attach: async () => { throw new Error('Application locked') },cleanup: async (path,owner) => { assert.equal(path,sent); assert.equal(owner,userId); throw new Error('offline') } }),/Clean Unused Certificates/)
  assert.equal(isOwnQualificationPath(record.file_path,'other'),false)
  assert.equal(isOwnQualificationPath(userId+'/certificates/../secret.pdf',userId),false)
})

const { safeReturnDestination, returnDestination, authPath, afterLogin } = await load('../src/utils/authNavigation.ts')
const { default: SignupPage } = await load('../src/pages/SignupPage.tsx')
for (const entry of ['/tailors?city=Colombo&specialty=Bridal&page=2','/tailors/123-test?from=directory#portfolio']) {
  test(`signed-out direct navigation preserves ${entry}`, () => {
    const html = render(h(PortalGuard,{ authenticatedOnly: true },h('p',null,'BROWSE CONTENT')), { session: null }, {}, entry)
    assert.doesNotMatch(html,/BROWSE CONTENT/)
    assert.deepEqual(globalThis.__tailormeNavigation,{ to: authPath('/login',entry), replace: true })
  })
  test(`loading session never redirects or renders protected content at ${entry}`, () => {
    const html = render(h(PortalGuard,{ authenticatedOnly: true },h('p',null,'BROWSE CONTENT')), { session: null,loading: true }, {}, entry)
    assert.match(html,/Restoring your session/)
    assert.doesNotMatch(html,/BROWSE CONTENT/)
    assert.equal(globalThis.__tailormeNavigation,null)
  })
}
for (const role of ['customer','tailor','admin']) {
  test(`${role} may browse without waiting for portal role initialization`, () => {
    assert.match(render(h(PortalGuard,{ authenticatedOnly: true },h('p',null,'BROWSE CONTENT')), {}, { role,status: 'loading' }, '/tailors'),/BROWSE CONTENT/)
    assert.equal(globalThis.__tailormeNavigation,null)
  })
  test(`${role} keeps the normal dashboard redirect`, () => {
    render(h(PortalGuard), {}, { role }, '/dashboard')
    assert.deepEqual(globalThis.__tailormeNavigation,{ to: `/${role}/dashboard`,replace: true })
  })
}
test('unsafe return targets cannot redirect outside the browsing routes', () => {
  for (const value of [null,undefined,'https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','/%2f%2fevil.test','/tailors%2f%2fevil.test','/login','/auth/callback','/admin/dashboard','/tailors\n//evil.test','/tailors/abc/extra']) {
    assert.equal(safeReturnDestination(value),null, String(value))
    assert.equal(afterLogin(value),'/dashboard')
    assert.equal(authPath('/login',value),'/login')
  }
  const destination='/tailors?city=Kandy&name=Silk%20%26%20Thread&page=2'
  assert.equal(returnDestination(new URL(authPath('/login',destination),'https://local.test').search),destination)
  assert.equal(afterLogin(destination),destination)
})
test('signup/login links carry the validated return destination', () => {
  const destination='/tailors/abc?from=directory'
  const login=render(h(LoginPage),{}, {},authPath('/login',destination))
  assert.ok(login.includes(`href="${authPath('/signup',destination)}"`))
  const signup=render(h(SignupPage),{}, {},authPath('/signup',destination))
  assert.ok(signup.includes(`href="${authPath('/login',destination)}"`))
})
test('OAuth/email callback returns to the captured internal destination only after initialization', () => {
  authRedirect.returnTo='/tailors?city=Galle&page=3'
  try {
    render(h(AuthCallbackPage),{ loading: true })
    assert.equal(globalThis.__tailormeNavigation,null)
    render(h(AuthCallbackPage))
    assert.deepEqual(globalThis.__tailormeNavigation,{ to: authRedirect.returnTo,replace: true })
    authRedirect.returnTo='//evil.test'
    render(h(AuthCallbackPage))
    assert.deepEqual(globalThis.__tailormeNavigation,{ to: '/dashboard',replace: true })
  } finally { delete authRedirect.returnTo }
})
test('OAuth cancellation retains a safe destination in the retry link', () => {
  authRedirect.error='Cancelled'
  try {
    const html=render(h(AuthCallbackPage),{}, {},authPath('/auth/callback','/tailors?city=Galle'))
    assert.ok(html.includes(`href="${authPath('/login','/tailors?city=Galle')}"`))
    assert.equal(globalThis.__tailormeNavigation,null)
  } finally { authRedirect.error=null }
})
test('Google and email confirmation requests include only validated callback destinations', async () => {
  const { setSupabase }=await load('../src/lib/supabase.ts')
  const { authService }=await load('../src/services/authService.ts')
  const previousWindow=globalThis.window
  globalThis.window={ location: { origin: 'https://tailorme.test' } }
  let request
  setSupabase({ auth: { signUp: async (value) => { request=value; return {} },signInWithOAuth: async (value) => { request=value; return {} } } })
  try {
    const destination='/tailors?city=Matara&page=2'
    await authService.signInWithGoogle(destination)
    assert.equal(request.options.redirectTo,'https://tailorme.test'+authPath('/auth/callback',destination))
    await authService.signUp('Test','test@example.test','password',destination)
    assert.equal(request.options.emailRedirectTo,'https://tailorme.test'+authPath('/auth/callback',destination))
    await authService.signInWithGoogle('https://evil.test')
    assert.equal(request.options.redirectTo,'https://tailorme.test/auth/callback')
  } finally { setSupabase(null); globalThis.window=previousWindow }
})
test('route wiring protects direct directory URLs while keeping the landing page public', () => {
  const source=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.match(source,/<Route path="\/tailors" element={<PortalGuard authenticatedOnly><TailorDirectoryPage \/><\/PortalGuard>}/)
  assert.match(source,/<Route path="\/tailors\/:id" element={<PortalGuard authenticatedOnly><PublicTailorPage \/><\/PortalGuard>}/)
  assert.match(source,/<Route path="\/" element={<WelcomePage \/>}/)
  for (const file of ['LoginPage','SignupPage']) {
    const page=readFileSync(new URL(`../src/pages/${file}.tsx`,import.meta.url),'utf8')
    assert.match(page,/navigate\(afterLogin\(destination\), { replace: true }\)/)
  }
})

const { createApplicationSaveFlow, isBlankQualification } = await load('../src/services/applicationSaveFlow.ts')
const { default: ApplicationWorkspace } = await load('../src/components/portal/ApplicationWorkspace.tsx')
function saveFlowFixture() {
  const userId='60000000-0000-4000-8000-000000000001'
  const state={ application: null,photos: [],qualifications: [],objects: new Set(),events: [],failTransferAt: 0,transfers: 0,loseAttach: false,loseSave: '',attached: [],statuses: [],snapshot: null }
  const transport={
    own: async () => state.application,
    save: async (fields,submit,version) => {
      assert.equal(version,state.application?.version ?? null,'save uses the known server version')
      assert.ok(!state.application || ['draft','rejected'].includes(state.application.status),'no save after submission')
      if (submit) assert.ok(state.photos.length >= 1 && state.photos.length <= 3)
      state.events.push(submit ? 'submit' : 'draft')
      state.application={ ...testApplication,...fields,applicant_id: userId,status: submit ? 'pending' : 'draft',version: (version ?? 0)+1 }
      if (state.loseSave === (submit ? 'submit' : 'draft')) { state.loseSave=''; throw new Error('Save response lost') }
      return state.application
    },
    load: async () => ({ photos: [...state.photos],qualifications: [...state.qualifications] }),
    exists: async (_bucket,path) => state.objects.has(path),
    transfer: async (bucket,path,_file,progress,owns) => {
      assert.ok(owns(path,userId)); assert.notEqual(bucket,'tailor-public')
      state.transfers++; state.events.push('transfer'); progress(50)
      if (state.failTransferAt === state.transfers) throw new Error('Connection failed')
      assert.ok(!state.objects.has(path),'never overwrite an existing object')
      state.objects.add(path); progress(100)
    },
    attachPhoto: async (path,version) => {
      assert.equal(version,state.application.version,'attachment uses known server version'); assert.equal(state.application.status,'draft'); assert.ok(state.objects.has(path))
      assert.ok(!state.photos.some((photo) => photo.image_path === path),'no duplicate attachment')
      const photo={ id: crypto.randomUUID(),applicant_id: userId,image_path: path }; state.photos.push(photo); state.events.push('attach-photo')
      if (state.loseAttach) { state.loseAttach=false; throw new Error('Attachment response lost') }
      return photo
    },
    attachQualification: async (path,version,details) => {
      assert.equal(version,state.application.version,'attachment uses known server version'); assert.equal(state.application.status,'draft'); assert.ok(state.objects.has(path))
      const record={ ...details,id: crypto.randomUUID(),applicant_id: userId,file_path: path }; state.qualifications.push(record); state.events.push('attach-certificate'); return record
    },
  }
  const jobs=[]
  const options={ fields: { ...submittedFields },submit: true,jobs,
    onStatus: (text) => state.statuses.push(text),onApplication() {},onSnapshot: (snapshot) => { state.snapshot=snapshot },onAttached: (id) => state.attached.push(id),onPath() {} }
  const flow=createApplicationSaveFlow(userId,null,transport)
  const addPhoto=() => { const job={ id: crypto.randomUUID(),kind: 'work',file: new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'work.png',{ type: 'image/png' }) }; jobs.push(job); return job }
  return { state,transport,flow,options,jobs,addPhoto }
}
test('first-time submission saves draft, uploads and attaches work, then submits without certificates', async () => {
  const { state,flow,options,addPhoto }=saveFlowFixture(); addPhoto()
  const saved=await flow.run(options)
  assert.equal(saved.status,'pending')
  assert.deepEqual(state.events,['draft','transfer','attach-photo','submit'])
  assert.equal(state.application.version,2); assert.equal(state.qualifications.length,0)
  assert.ok(state.statuses.some((status) => status.startsWith('Uploading')))
  assert.ok(state.statuses.includes('Submitting your application...'))
})
test('draft saving allows empty photos and ignores a completely blank qualification', async () => {
  assert.ok(isBlankQualification({ details: { course_name: ' ',institute: '',qualification_level: '' },file: null }))
  assert.equal(isBlankQualification({ details: { course_name: 'Course',institute: '',qualification_level: '' },file: null }),false)
  const { state,flow,options }=saveFlowFixture()
  const saved=await flow.run({ ...options,fields: { ...emptyApplication },submit: false })
  assert.equal(saved.status,'draft'); assert.equal(state.photos.length,0); assert.equal(state.transfers,0)
})
test('draft saving uploads selected work photos and optional certificates without submitting', async () => {
  const { state,flow,options,jobs,addPhoto }=saveFlowFixture(); addPhoto()
  jobs.push({ id: 'certificate',kind: 'certificate',file: new File(['%PDF-1.7 certificate'],'certificate.pdf',{ type: 'application/pdf' }),details: { course_name: 'Tailoring',institute: 'Institute',qualification_level: '' } })
  const saved=await flow.run({ ...options,submit: false })
  assert.equal(saved.status,'draft'); assert.equal(state.photos.length,1); assert.equal(state.qualifications.length,1)
  assert.equal(state.events.includes('submit'),false)
})
test('partial upload failure retains files and retries only the remaining upload', async () => {
  const { state,flow,options,jobs,addPhoto }=saveFlowFixture(); const first=addPhoto(); const second=addPhoto()
  state.failTransferAt=2
  await assert.rejects(flow.run(options),/Connection failed/)
  assert.equal(state.application.status,'draft'); assert.equal(state.photos.length,1)
  assert.equal(jobs[1].file,second.file); assert.ok(second.path); const failedPath=second.path
  await flow.run(options)
  assert.equal(second.path,failedPath); assert.equal(state.photos.length,2)
  assert.equal(state.events.filter((event) => event === 'draft').length,1)
  assert.equal(state.events.filter((event) => event === 'attach-photo').length,2)
  assert.equal(state.photos[0].image_path,first.path)
})
test('lost attachment response is reconciled by original path without re-upload or deletion', async () => {
  const { state,flow,options,addPhoto }=saveFlowFixture(); const job=addPhoto(); state.loseAttach=true
  await assert.rejects(flow.run(options),/Attachment response lost/)
  assert.equal(state.application.status,'draft'); assert.equal(state.photos.length,1)
  await flow.run(options)
  assert.equal(state.transfers,1); assert.equal(state.photos.length,1); assert.ok(state.objects.has(job.path))
})
test('completed object with lost transfer response is reused on retry', async () => {
  const fixture=saveFlowFixture(); const { state,transport,options,addPhoto }=fixture; addPhoto()
  const transfer=transport.transfer; let lose=true
  transport.transfer=async (...args) => { await transfer(...args); if (lose) { lose=false; throw new Error('Transfer response lost') } }
  const flow=createApplicationSaveFlow('60000000-0000-4000-8000-000000000001',null,transport)
  await assert.rejects(flow.run(options),/Transfer response lost/)
  await flow.run(options)
  assert.equal(state.transfers,1); assert.equal(state.photos.length,1); assert.equal(state.application.status,'pending')
})
for (const step of ['draft','submit']) {
  test(`lost ${step} response is reconciled without duplicate saves or attachments`, async () => {
    const { state,flow,options,addPhoto }=saveFlowFixture(); addPhoto(); state.loseSave=step
    await assert.rejects(flow.run(options),/Save response lost/)
    await flow.run(options)
    assert.equal(state.application.status,'pending'); assert.equal(state.application.version,2)
    assert.equal(state.events.filter((event) => event === 'draft').length,1)
    assert.equal(state.events.filter((event) => event === 'submit').length,1)
    assert.equal(state.transfers,1); assert.equal(state.photos.length,1)
  })
}
test('invalid files and work-photo count prevent draft creation and submission', async () => {
  const { state,flow,options,jobs,addPhoto }=saveFlowFixture()
  await assert.rejects(flow.run(options),/1–3/)
  addPhoto(); jobs[0].file=new File(['fake'],'fake.png',{ type: 'image/png' })
  await assert.rejects(flow.run(options),/contents/)
  assert.equal(state.application,null); assert.equal(state.transfers,0)
})
test('coordinator prevents overlapping saves and never overwrites externally changed versions', async () => {
  const { state,transport,options,addPhoto }=saveFlowFixture(); addPhoto()
  let release
  let firstLoad=true
  transport.load=() => { if (!firstLoad) return Promise.resolve({ photos: [],qualifications: [] }); firstLoad=false; return new Promise((resolve) => { release=() => resolve({ photos: [],qualifications: [] }) }) }
  const initial={ ...testApplication,status: 'draft',version: 1 }
  state.application=initial
  const flow=createApplicationSaveFlow('60000000-0000-4000-8000-000000000001',initial,transport)
  const saving=flow.run(options)
  await assert.rejects(flow.run(options),/already in progress/)
  state.application={ ...initial,version: 2 }
  release()
  await assert.rejects(saving,/known server version/)
  assert.equal(state.application.version,2)
})
test('new application form shows local attachment controls without a manual draft prerequisite', () => {
  const html=render(h(ApplicationWorkspace,{ application: null,applicantId: 'test-user',onApplication() {},onBusy() {} }))
  assert.match(html,/Add work photos/)
  assert.match(html,/Choose certificate file/)
  assert.match(html,/Course\/certificate name/)
  assert.match(html,/Save Draft/)
  assert.match(html,/Submit Application/)
  assert.doesNotMatch(html,/Save (your )?draft first|Save a draft first/)
})

test('qualification retry retains its prepared path across UI job reconstruction', async () => {
  const { state,transport,options,addPhoto }=saveFlowFixture(); addPhoto()
  const certificate={ id: 'certificate-retry',kind: 'certificate',file: new File(['%PDF-1.7'],'course.pdf',{ type: 'application/pdf' }),details: { course_name: 'Tailoring',institute: 'Institute',qualification_level: 'NVQ 4' } }
  const attach=transport.attachQualification; let fail=true; let preparedPath
  transport.attachQualification=async (...args) => { if (fail) { fail=false; throw new Error('Attachment temporarily unavailable') } return attach(...args) }
  const flow=createApplicationSaveFlow('60000000-0000-4000-8000-000000000001',null,transport)
  await assert.rejects(flow.run({ ...options,jobs: [...options.jobs,{ ...certificate }],onPath: (id,path) => { if (id === certificate.id) preparedPath=path } }),/temporarily unavailable/)
  assert.ok(preparedPath); assert.equal(state.qualifications.length,0)
  await flow.run({ ...options,jobs: [{ ...certificate,path: preparedPath }] })
  assert.equal(state.transfers,2,'one photo and one certificate transfer total')
  assert.equal(state.qualifications.length,1); assert.equal(state.qualifications[0].file_path,preparedPath)
  assert.equal(state.application.status,'pending')
})
test('explicit refresh adopts the server version without discarding user-entered fields', async () => {
  const { state,transport,options,addPhoto }=saveFlowFixture(); addPhoto()
  const original={ ...testApplication,status: 'draft',version: 1 }
  state.application={ ...original,city: 'Galle',version: 2 }
  const flow=createApplicationSaveFlow('60000000-0000-4000-8000-000000000001',original,transport)
  const entered={ ...options.fields,shop_name: 'My unsaved edit' }
  await assert.rejects(flow.run({ ...options,fields: entered }),/known server version/)
  assert.equal((await flow.refresh()).version,2)
  await flow.run({ ...options,fields: entered })
  assert.equal(state.application.shop_name,'My unsaved edit'); assert.equal(entered.shop_name,'My unsaved edit')
  assert.equal(state.application.status,'pending')
})

test('lost save reconciliation preserves multiline description boundaries used by the existing RPC', async () => {
  const { state,flow,options,addPhoto }=saveFlowFixture(); addPhoto(); state.loseSave='draft'
  const fields={ ...options.fields,description: '\nA bespoke tailoring studio focused on individual fit.\n' }
  await assert.rejects(flow.run({ ...options,fields }),/Save response lost/)
  await flow.run({ ...options,fields })
  assert.equal(state.application.status,'pending'); assert.equal(state.application.version,2)
  assert.equal(state.application.description,fields.description)
})

const { requestToday, validateRequest, requestService } = await load('../src/services/requestService.ts')
const { default: RequestComposer } = await load('../src/components/portal/RequestComposer.tsx')
const { default: RequestsPage } = await load('../src/pages/RequestsPage.tsx')
test('request validation enforces quantity, details and future Sri Lanka calendar dates', () => {
  const fields={ garment_type: 'Dress',description: 'A linen dress for an event.',quantity: 1,preferred_date: '2099-12-01' }
  assert.equal(validateRequest(fields),'')
  for (const quantity of [0,101,1.5,Number.NaN]) assert.match(validateRequest({ ...fields,quantity }),/quantity/)
  for (const preferred_date of ['2020-01-01',requestToday(),'2099-02-30','invalid','']) assert.match(validateRequest({ ...fields,preferred_date }),/future/)
  assert.match(validateRequest({ ...fields,garment_type: ' ' }),/garment/)
  assert.match(validateRequest({ ...fields,description: 'short' }),/Describe/)
  assert.equal(requestToday(new Date('2026-10-27T20:00:00Z')),'2026-10-28')
})
test('customers and tailors can request another accepting shop without expanding customer tools', () => {
  const html=render(h(RequestComposer,{ tailorId: 'tailor',available: true }))
  assert.match(html,/Send tailoring request/)
  for (const label of ['Garment type','Description','Quantity','Preferred completion date']) assert.ok(html.includes(label))
  assert.match(html,/subject to tailor confirmation/)
  assert.match(html,/not confirming a price, payment or guaranteed completion date/)
  for (const role of ['admin']) assert.doesNotMatch(render(h(RequestComposer,{ tailorId: 'tailor',available: true }),{}, { role }),/<form/)
  const tailor=render(h(RequestComposer,{tailorId:'another-tailor',available:true}),{},{role:'tailor'})
  assert.match(tailor,/<form/);assert.match(tailor,/My Orders/);assert.doesNotMatch(tailor,/Optional measurement sharing|customer\/measurements/)
  assert.doesNotMatch(render(h(RequestComposer,{ tailorId: 'tailor',available: false })),/<form/)
})
test('request navigation appears for customers and tailors, not admins', () => {
  assert.match(render(h(dashboards.CustomerDashboard)),/href="\/customer\/requests"/)
  assert.match(render(h(dashboards.TailorDashboard),{}, { role: 'tailor' }),/href="\/tailor\/requests"/)
  assert.doesNotMatch(render(h(dashboards.AdminDashboard),{}, { role: 'admin' }),/href="\/(customer|tailor)\/requests"/)
  assert.match(render(h(RequestsPage)),/Loading requests/)
})
test('request service passes stable submission IDs and expected decision versions to scoped RPCs', async () => {
  const { setSupabase }=await load('../src/lib/supabase.ts')
  const calls=[]
  setSupabase({ rpc: async (name,args) => { calls.push({ name,args }); return { data: { id: args.p_id,version: 2 },error: null } } })
  try {
    const fields={ garment_type: 'Dress',description: 'A linen dress for an event.',quantity: 2,preferred_date: '2099-12-01' }
    await requestService.send('stable-id','tailor-id',fields)
    await requestService.send('stable-id','tailor-id',fields)
    assert.deepEqual(calls[0],calls[1])
    await requestService.decide({ id: 'stable-id',version: 1 },'rejected','Cannot meet the timing.')
    assert.deepEqual(calls[2],{ name: 'decide_tailoring_request',args: { p_id: 'stable-id',p_status: 'rejected',p_reason: 'Cannot meet the timing.',p_expected_version: 1 } })
  } finally { setSupabase(null) }
})

test('ambiguous request failures must retain the same submission ID even when a read returns no row', async () => {
  const { requestDefinitelyRejected }=await load('../src/services/requestService.ts')
  for (const cause of [new Error('Network failed'),{ code: 'PGRST000' },{ code: '504' },null]) assert.equal(requestDefinitelyRejected(cause),false)
  for (const code of ['22023','23514','23502','42501']) assert.equal(requestDefinitelyRejected({ code }),true)
})

const { deadlineGroup }=await load('../src/services/workService.ts')
const { default: RequestStatusBadge }=await load('../src/components/portal/RequestStatusBadge.tsx')
const { default: RequestWork }=await load('../src/components/portal/RequestWork.tsx')
test('dashboard deadline groups ignore preferred dates and completed/nonaccepted inquiries',()=>{
 const row={ ...testApplication,status:'accepted',preferred_date:'2026-10-20',confirmed_date:null,completed_at:null }
 assert.equal(deadlineGroup(row,'2026-10-27'),'unscheduled')
 assert.equal(deadlineGroup({...row,confirmed_date:'2026-10-26'},'2026-10-27'),'overdue')
 assert.equal(deadlineGroup({...row,confirmed_date:'2026-10-27'},'2026-10-27'),'upcoming')
 assert.equal(deadlineGroup({...row,confirmed_date:'2026-10-28',completed_at:'2026-10-27T10:00Z'},'2026-10-27'),'inactive')
 assert.equal(deadlineGroup({...row,status:'cancelled'},'2026-10-27'),'inactive')
})
test('completed work has participant-visible text without replacing inquiry states',()=>{
 assert.match(render(h(RequestStatusBadge,{status:'accepted',completed:true})),/Completed/)
 const request={...testApplication,id:'test',status:'accepted',preferred_date:'2026-11-10',confirmed_date:'2026-11-12',completed_at:null}
 const customer=render(h(RequestWork,{request,canManage:false,onUpdated(){}}))
 assert.match(customer,/2026-11-10/);assert.match(customer,/2026-11-12/);assert.match(customer,/not an agreed deadline/)
 assert.doesNotMatch(customer,/Save confirmed date|Mark work completed/)
 const tailor=render(h(RequestWork,{request,canManage:true,onUpdated(){}}))
 assert.match(tailor,/Save confirmed date/);assert.doesNotMatch(tailor,/Mark work completed/)
})

const { colomboDate, deadlineVisibility, formatWorkDate }=await load('../src/utils/deadlineVisibility.ts')
const { default: WorkCard }=await load('../src/components/portal/WorkCard.tsx')
test('deadline badges use confirmed calendar dates across Colombo midnight',()=>{
 const row={status:'accepted',completed_at:null,confirmed_date:'2026-10-29'}
 const before=colomboDate(new Date('2026-10-27T18:29:59Z'))
 const after=colomboDate(new Date('2026-10-27T18:30:00Z'))
 assert.equal(before,'2026-10-27');assert.equal(after,'2026-10-28')
 assert.equal(deadlineVisibility(row,before).text,'Due in 2 days')
 assert.equal(deadlineVisibility(row,after).text,'Due tomorrow')
 assert.equal(deadlineVisibility(row,'2026-10-29').text,'Due today')
 assert.equal(deadlineVisibility(row,'2026-10-30').text,'Overdue by 1 day')
 assert.equal(deadlineVisibility(row,'2026-11-01').text,'Overdue by 3 days')
 assert.equal(deadlineVisibility(row,'2026-10-25').text,'Due in 4 days')
 assert.equal(deadlineVisibility({...row,confirmed_date:null},after).text,'Date not confirmed')
 assert.equal(deadlineVisibility({...row,completed_at:'2026-10-29T10:00Z'},'2026-11-01'),null)
 assert.equal(deadlineVisibility({...row,status:'cancelled'},after),null)
 assert.equal(formatWorkDate('2026-10-29'),'29 Oct 2026')
})
test('calendar deadline math handles leap days and year boundaries',()=>{
 const row={status:'accepted',completed_at:null,confirmed_date:'2028-03-01'}
 assert.equal(deadlineVisibility(row,'2028-02-28').text,'Due in 2 days')
 assert.equal(deadlineVisibility({...row,confirmed_date:'2027-01-01'},'2026-12-31').text,'Due tomorrow')
})
test('work cards separate status/deadline, emphasize confirmed date, and link to details',()=>{
 const request={id:'work-id',garment_type:'Dress',customer_name:'Avery',status:'accepted',completed_at:null,confirmed_date:'2026-10-29',preferred_date:'2026-10-20'}
 const html=render(h(WorkCard,{request,today:'2026-10-29'}))
 assert.match(html,/Accepted/);assert.match(html,/Due today/);assert.match(html,/work-card-today/)
 assert.match(html,/Confirmed completion:.*29 Oct 2026/);assert.match(html,/Customer preferred:.*20 Oct 2026/)
 assert.match(html,/href="\/tailor\/requests\/work-id"/)
 const completed=render(h(WorkCard,{request:{...request,completed_at:'2026-10-29T10:00Z'},today:'2026-11-01'}))
 assert.match(completed,/Completed/);assert.doesNotMatch(completed,/Overdue by|Due today|Due in|Date not confirmed/)
})

const { exactCharge,quoteFields,lkr,quoteService }=await load('../src/services/quoteService.ts')
const { default: RequestQuotations }=await load('../src/components/portal/RequestQuotations.tsx')
test('quotation amounts normalize decimal strings without floating-point arithmetic',()=>{
 assert.equal(exactCharge('12'),'12.00');assert.equal(exactCharge('0.1'),'0.10');assert.equal(exactCharge('000.20'),'0.20')
 assert.equal(exactCharge('999999999.99'),'999999999.99')
 for(const value of ['-1','1.001','1e3','NaN','Infinity','1000000000.00','', '1,000.00'])assert.throws(()=>exactCharge(value))
 assert.equal(lkr('2999999999.97'),'LKR 2,999,999,999.97')
 assert.throws(()=>quoteFields({stitching:'0',material:'0',other:'0',other_explanation:'',notes:''}),/positive/)
 assert.throws(()=>quoteFields({stitching:'1',material:'0',other:'0.01',other_explanation:' ',notes:''}),/Explain/)
 const fields=quoteFields({stitching:'0.1',material:'0.2',other:'0',other_explanation:'',notes:'Whole request.'})
 assert.equal(fields.stitching,'0.10');assert.equal(fields.material,'0.20');assert.equal('total'in fields,false)
})
test('quotations explain whole-quantity pricing, separate acceptance and no payment',()=>{
 const html=render(h(RequestQuotations,{request:{...testApplication,id:'test-request',quantity:4,tailor_id:'tailor',customer_id:'test-user'}}))
 assert.match(html.replace(/<!--.*?-->/g,''),/whole request quantity \(4\)/);assert.match(html,/does not make a payment/)
 assert.match(html,/Request acceptance and quotation acceptance are separate/);assert.match(html,/Loading quotations/)
})
test('quote service sends string charges, stable IDs and expected versions, never a client total',async()=>{
 const { setSupabase }=await load('../src/lib/supabase.ts');const calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push({name,args});return{data:'quote-id',error:null}}})
 try{
  const request={id:'request-id',version:7};const fields={stitching:'0.10',material:'0.20',other:'0.00',other_explanation:'',notes:''}
  await quoteService.send('quote-id',request,fields);await quoteService.send('quote-id',request,fields)
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].args.p_expected_request_version,7);assert.equal(calls[0].args.p_stitching,'0.10');assert.equal('p_total'in calls[0].args,false)
  await quoteService.answer({id:'quote-id',version:1},'accepted')
  assert.deepEqual(calls[2],{name:'answer_request_quotation',args:{p_id:'quote-id',p_status:'accepted',p_expected_version:1}})
 }finally{setSupabase(null)}
})

const { availableStages,stageLabel,progressService }=await load('../src/services/progressService.ts')
const { default: RequestProgress }=await load('../src/components/portal/RequestProgress.tsx')
test('progress stage choices start explicitly and only move forward, with optional skips',()=>{
 assert.deepEqual(availableStages(null,false),['confirmed'])
 assert.deepEqual(availableStages('confirmed',false),['designing','stitching','fitting','ready','completed'])
 assert.deepEqual(availableStages('fitting',false),['ready','completed'])
 assert.deepEqual(availableStages('ready',true),[])
 assert.equal(stageLabel(null),'Not started');assert.equal(stageLabel('ready'),'Ready')
})
test('progress details distinguish states and explain ready and customer visibility',()=>{
 const request={...testApplication,id:'request',status:'accepted',progress_stage:null,work_stage:null,completed_at:null}
 const html=render(h(RequestProgress,{request,canManage:true,onUpdated(){}}))
 assert.match(html,/Current stage:.*Not started/)
 assert.match(html,/Request status and quotation acceptance are separate/)
 assert.match(html,/Ready means ready for collection/)
 assert.match(html,/Loading progress/)
 const legacy=render(h(RequestProgress,{request:{...request,completed_at:'2026-10-27T10:00Z',work_stage:'completed'},canManage:false,onUpdated(){}}))
 assert.match(legacy,/Completed/)
 assert.doesNotMatch(legacy,/Choose next stage/)
})
test('progress service uses expected versions and the existing completion RPC with explicit confirmation',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts');const calls=[]
 setSupabase({rpc:async(name,args)=>{calls.push({name,args});return{data:{},error:null}}})
 try{
  await progressService.advance({id:'r',version:3},'stitching','Customer-visible note.',false)
  assert.deepEqual(calls[0],{name:'advance_request_progress',args:{p_id:'r',p_stage:'stitching',p_note:'Customer-visible note.',p_expected_version:3,p_confirm_completed:false}})
  await progressService.advance({id:'r',version:4},'completed','Done.',true)
  assert.deepEqual(calls[1],{name:'complete_tailoring_request',args:{p_id:'r',p_expected_version:4,p_note:'Done.',p_confirmed:true}})
 }finally{setSupabase(null)}
})

const {defaultDesign,designColours,designLengthLabel,designBrowseUrl,designService}=await load('../src/services/designService.ts')
const {default:DesignIllustration}=await load('../src/components/portal/DesignIllustration.tsx')
const {default:PublicShopLayout}=await load('../src/components/shops/PublicShopLayout.tsx')
test('design illustration changes actual SVG geometry for supported necklines, sleeves and lengths',()=>{
 const svg=(design)=>render(h(DesignIllustration,{design})).match(/<svg[\s\S]*?<\/svg>/)[0]
 const paths=(html)=>[...html.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1]).join('|')
 for(const key of ['neckline','sleeve','length']){
  const values=key==='neckline'?['round','v','square']:key==='sleeve'?['sleeveless','short','long']:['short','midi','long']
  assert.equal(new Set(values.map(value=>paths(svg({...defaultDesign,[key]:value})))).size,3,`${key} changes geometry`)
 }
 for(const [colour,hex] of Object.entries(designColours))assert.ok(svg({...defaultDesign,colour}).includes(`fill="${hex}"`))
 const dress=paths(svg(defaultDesign));const blouse=paths(svg({...defaultDesign,garment_type:'blouse'}));const skirt=paths(svg({...defaultDesign,garment_type:'skirt',neckline:'none',sleeve:'none'}))
 assert.equal(new Set([dress,blouse,skirt]).size,3)
 assert.equal(designLengthLabel({...defaultDesign,garment_type:'blouse',length:'long'}),'Tunic length')
 const html=render(h(DesignIllustration,{design:defaultDesign}))
 assert.match(html,/Design illustration/);assert.match(html,/not a prediction of body fit or measurements/)
 assert.doesNotMatch(html,/<image|<foreignObject|type="file"|<script/)
})
test('supported design combinations render accessible illustrations without photo or AI placeholders',()=>{
 let combinations=0
 for(const garment_type of ['dress','blouse','skirt'])for(const colour of Object.keys(designColours))for(const length of ['short','midi','long'])for(const neckline of garment_type==='skirt'?['none']:['round','v','square'])for(const sleeve of garment_type==='skirt'?['none']:['sleeveless','short','long']){
  const html=render(h(DesignIllustration,{design:{...defaultDesign,garment_type,colour,length,neckline,sleeve}}))
  assert.match(html,/<svg[^>]*role="img"[^>]*aria-labelledby=/);assert.match(html,/<title/);combinations++
 }
 assert.equal(combinations,285)
})
test('design selection survives directory links and sign-in return navigation',()=>{
 const id='82000000-0000-4000-8000-000000000001';const url=designBrowseUrl(id)
 assert.equal(returnDestination(new URL(authPath('/login',url),'https://local.test').search),url)
 assert.equal(afterLogin(`/customer/designer/${id}`),`/customer/designer/${id}`)
 const layout=render(h(PublicShopLayout,null,h('p',null,'Directory')),{}, {},`/tailors/tailor-id?design=${id}&city=Colombo`)
 assert.ok(layout.includes(`href="/tailors?design=${id}&amp;city=Colombo"`))
 const directory=readFileSync(new URL('../src/pages/TailorDirectoryPage.tsx',import.meta.url),'utf8')
 assert.match(directory,/next.set\('design',params.get\('design'\)!\)/)
})
test('request transport attaches the selected saved design version with a stable submission identifier',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts');let call
 setSupabase({rpc:async(name,args)=>{call={name,args};return{data:{id:args.p_id},error:null}}})
 try{
  const fields={garment_type:'dress',description:'Please tailor this design.',quantity:2,preferred_date:'2099-12-01'}
  await requestService.send('request-id','tailor-id',fields,{id:'design-id',version:2})
  assert.equal(call.name,'send_tailoring_request_with_measurements');assert.equal(call.args.p_share,false);assert.equal(call.args.p_values,null);assert.equal(call.args.p_design_id,'design-id');assert.equal(call.args.p_design_version,2);assert.equal('p_snapshot'in call.args,false)
  await designService.save('design-id',{...defaultDesign,owner_id:'forged',version:99},null)
  assert.equal(call.name,'save_customer_design');assert.equal(call.args.p_expected_version,null)
  assert.equal('owner_id'in call.args.p_fields,false);assert.equal('version'in call.args.p_fields,false)
 }finally{setSupabase(null)}
})

const geometryForRender=await load('../src/utils/necklineGeometry.ts')
const alignmentForRender=await load('../src/utils/stylingAlignment.ts')
const shapeForRender=await load('../src/utils/previewShape.ts')
const extendedModel=await load('../src/services/designService.ts')
const {default:GarmentOptionsControls}=await load('../src/components/portal/GarmentOptionsControls.tsx')
const {default:ColourControl}=await load('../src/components/ui/ColourControl.tsx')

test('saved sketch comparison ignores jsonb object-key order but retains artwork layer order',()=>{
 const item={kind:'rectangle',mode:'canvas',colour:'#123ABC',width:3,fill:'#FEDCBA',points:[[0,0],[10000,10000]]}
 const design={...extendedModel.defaultSketch,decorations:{version:2,strokes:[item,{...item,kind:'ellipse'}]}}
 const reordered={...design,decorations:{strokes:design.decorations.strokes.map(s=>Object.fromEntries(Object.entries(s).reverse())),version:2}}
 assert.equal(extendedModel.designFingerprint(design),extendedModel.designFingerprint(reordered))
 assert.notEqual(extendedModel.designFingerprint(design),extendedModel.designFingerprint({...design,decorations:{...design.decorations,strokes:[...design.decorations.strokes].reverse()}}))
})

test('directory reference thumbnail and participant request details render the same complete sketch; details read only the snapshot',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts'),queries=[]
 const sketch={...extendedModel.defaultSketch,id:'95000000-0000-4000-8000-000000000001',name:'Reference outfit',notes:'Keep every border',owner_id:'customer',version:2,decorations:{version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#123ABC',width:4,fill:'#FEDCBA',points:[[0,0],[10000,10000]]},{mode:'canvas',colour:'#303039',width:2,points:[[0,10000],[10000,0]]}]}}
 const snapshot={...structuredClone(sketch),request_id:'request-id',design_id:sketch.id,design_version:2}
 setSupabase({from:table=>({select:()=>({eq:(column,value)=>{queries.push({table,column,value});return {maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?sketch:snapshot),error:null})}}})})})
 async function mount(path,props,key){
  const state=[];let cursor=0
  globalThis.__referenceHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useEffect(effect,deps){const i=cursor++;if(!state[i]||JSON.stringify(state[i])!==JSON.stringify(deps)){state[i]=deps;effect()}}}
  const file=new URL(path,import.meta.url)
  let source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  source=source.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
   if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
   let child=new URL(specifier,file);if(!existsSync(child))child=['.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate))
   return `from '${moduleUrl(child)}'`
  }).replace(/import \{ useEffect, useState \} from '[^']+';/,'const {useEffect,useState}=globalThis.__referenceHooks;').replace(/import \{ usePortal \} from '[^']+';/,"const usePortal=()=>({role:'customer'});")
  const {default:Component}=await import(`data:text/javascript;base64,${Buffer.from(source+`\n// ${key}`).toString('base64')}`)
  cursor=0;Component(props);await new Promise(setImmediate);cursor=0;return Component(props)
 }
 try{
  const selected=await mount('../src/components/portal/SelectedDesign.tsx',{id:sketch.id},'banner')
  const banner=render(selected);assert.match(banner,/Customer design reference/);assert.match(banner,/design-thumbnail/)
  assert.ok(banner.includes(`/customer/designer/${sketch.id}`))
  queries.length=0
  const details=await mount('../src/components/portal/RequestDesign.tsx',{requestId:'request-id'},'details')
  assert.deepEqual(queries,[{table:'request_design_snapshots',column:'request_id',value:'request-id'}])
  const customer=render(details),tailor=render(details,{}, {role:'tailor'})
  assert.match(customer.replaceAll('<!-- -->',''),/Fixed snapshot of saved design version 2/)
  assert.match(customer,/Customer design reference/);assert.match(customer,/Keep every border/)
  const svg=html=>html.match(/<svg[\s\S]*?<\/svg>/)[0].replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
  assert.equal(svg(banner),svg(customer));assert.equal(svg(customer),svg(tailor))
  assert.equal(svg(customer),svg(render(h(DesignIllustration,{design:sketch,illustrationOnly:true}))))
 }finally{setSupabase(null);delete globalThis.__referenceHooks}
})

test('tailor filters, pagination, clearing and shop/back links retain the selected sketch ID',async()=>{
 const id='95000000-0000-4000-8000-000000000001',file=new URL('../src/pages/TailorDirectoryPage.tsx',import.meta.url)
 const state=[];let cursor=0,params=new URLSearchParams({design:id})
 globalThis.__directoryHooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]},useEffect(){}}
 globalThis.__directoryParams=()=>[params,next=>{params=new URLSearchParams(next)}]
 let source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 source=source.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
  if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
  let child=new URL(specifier,file);if(!existsSync(child))child=['.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate))
  return `from '${moduleUrl(child)}'`
 }).replace(/import \{ useEffect, useState \} from '[^']+';/,'const {useEffect,useState}=globalThis.__directoryHooks;').replace(/import \{ useSearchParams \} from '[^']+';/,'const useSearchParams=globalThis.__directoryParams;').replace(/import \{ useAuth \} from '[^']+';/,"const useAuth=()=>({session:{user:{id:'directory-customer'}},loading:false});").replace(/import \{ usePortal \} from '[^']+';/,"const usePortal=()=>({role:'customer',status:'ready'});")
 const {default:Directory}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
 const shop={owner_id:'50000000-0000-4000-8000-000000000002',shop_name:'Sketch Atelier',description:'Custom garment work',specialties:'Kurtis',city:'Colombo',years_experience:5,accepting_requests:true,cover_path:null}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 let tree;const redraw=()=>{cursor=0;state[1]={key:JSON.stringify(['directory-customer','customer','ready',false,params.get('q')??'',params.get('city')??'',params.get('specialty')??'',Number(params.get('page')??1)-1,state[0]??0]),shops:[shop],count:36,error:''};tree=Directory()}
 const originalFormData=globalThis.FormData
 try{
  redraw();assert.equal(params.get('design'),id)
  globalThis.FormData=class {constructor(values){this.values=values}get(key){return this.values[key]}}
  nodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{q:'Sketch',city:'Colombo',specialty:'Kurtis'}});redraw()
  assert.equal(params.get('design'),id);assert.equal(params.get('city'),'Colombo')
  nodes(tree).find(n=>n.props?.children==='Next').props.onClick();redraw()
  assert.equal(params.get('design'),id);assert.equal(params.get('page'),'2')
  const card=nodes(tree).find(n=>n.type===ShopCard)
  assert.ok(card.props.query.includes(`design=${id}`))
  const href=render(card).match(/href="([^"]+)"/)[1].replaceAll('&amp;','&')
  assert.equal(new URL(href,'https://local.test').searchParams.get('design'),id)
  const layout=render(h(PublicShopLayout,null,h('p',null,'Shop')),{}, {},href)
  assert.ok(layout.includes(`/tailors?${new URLSearchParams(params).toString().replaceAll('&','&amp;')}`))
  nodes(tree).find(n=>n.props?.children==='Clear All').props.onClick();redraw()
  assert.deepEqual([...params.entries()],[['design',id]])
  const page=readFileSync(new URL('../src/pages/PublicTailorPage.tsx',import.meta.url),'utf8')
  assert.match(page,/designId=\{new URLSearchParams\(location.search\).get\('design'\)\}/)
  assert.equal(returnDestination(new URL(authPath('/login',extendedModel.designBrowseUrl(id)),'https://local.test').search),extendedModel.designBrowseUrl(id))
 }finally{globalThis.FormData=originalFormData;delete globalThis.__directoryHooks;delete globalThis.__directoryParams}
})

test('categorized and uncategorized sketches show their complete reference and submit only saved ID/version',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts')
 const file=new URL('../src/components/portal/RequestComposer.tsx',import.meta.url)
 const fixture={...extendedModel.defaultSketch,id:'95000000-0000-4000-8000-000000000001',owner_id:'customer',version:3,attached_at:null,name:'Reference outfit',notes:'Keep the whole border and filled shapes.',decorations:{version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#123ABC',width:4,fill:'#FEDCBA',points:[[0,0],[10000,10000]]},{kind:'ellipse',mode:'canvas',colour:'#ff00aa',width:2,fill:null,points:[[2000,2000],[5000,7000]]}]}}
 try{
  for(const [number,category] of [null,'kurti','unavailable'].entries()){
   const row=category==='unavailable'?null:{...fixture,sketch_category:category},state=[],calls=[],navigation=[]
   let cursor=0
   const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(effect,deps){const i=cursor++;if(!state[i]||JSON.stringify(state[i])!==JSON.stringify(deps)){state[i]=deps;effect()}}}
   const personal={owner_id:'customer',values_cm:{waist:80.01,shoulder_width:40},measured_on:'2026-10-28'}
   setSupabase({from:table=>({select:()=>({maybeSingle:async()=>({data:personal,error:null}),eq:()=>({maybeSingle:async()=>({data:table==='customer_designs'?row:null,error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return {data:{id:'request-id'},error:null}}})
   globalThis.__sharingHooks=hooks;globalThis.__sharingNavigate=(...args)=>navigation.push(args)
   let source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
   source=source.replace(/from\s+['"]([^'"]+)['"]/g,(_,specifier)=>{
    if(!specifier.startsWith('.'))return `from '${import.meta.resolve(specifier)}'`
    let child=new URL(specifier,file);if(!existsSync(child))child=['.ts','.tsx'].map(ext=>new URL(specifier+ext,file)).find(candidate=>existsSync(candidate))
    return `from '${moduleUrl(child)}'`
   }).replace(/import\s+['"][^'"]+\.css['"];?/g,'')
   source=source.replace(/import \{ useEffect, useRef, useState \} from '[^']+';/,'const {useEffect,useRef,useState}=globalThis.__sharingHooks;')
   source=source.replace(/import \{ Link, useNavigate \} from '([^']+)';/,"import {Link} from '$1';const navigate=globalThis.__sharingNavigate;const useNavigate=()=>navigate;")
   source=source.replace(/import \{ usePortal \} from '[^']+';/,"const usePortal=()=>({role:'customer',status:'ready'});")
   const {default:Composer}=await import(`data:text/javascript;base64,${Buffer.from(source+`\n// fixture ${number}`).toString('base64')}`)
   const treeNodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(treeNodes)]
   let tree;const redraw=()=>{cursor=0;tree=Composer({tailorId:'tailor-id',available:true,designId:fixture.id})}
   redraw();await new Promise(setImmediate);redraw()
   const byId=id=>treeNodes(tree).find(n=>n.props?.id===id)
   if(!row){assert.match(render(tree),/Selected design is unavailable/);assert.ok(treeNodes(tree).find(n=>n.props?.type==='submit').props.disabled);assert.equal(calls.length,0);continue}
   const checkbox=treeNodes(tree).find(n=>n.props?.type==='checkbox')
   assert.equal(checkbox.props.checked,false,'consent starts unchecked')
   if(category==='kurti'){checkbox.props.onChange({target:{checked:true}});redraw()}
   const html=render(tree)
   assert.match(html,/Customer-provided; tailor confirmation recommended/)
   assert.match(html.replace(/<!-- -->/g,''),/80.01 cm/)
   assert.match(html,/Tailor will see this design/);assert.match(html,/Customer design reference/);assert.match(html,/Keep the whole border and filled shapes/)
   const svg=content=>content.match(/<svg[\s\S]*?<\/svg>/)[0].replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
   assert.equal(svg(html),svg(render(h(DesignIllustration,{design:row}))))
   assert.match(html,/viewBox="0 0 320 480" preserveAspectRatio="xMidYMid meet"/)
   assert.equal(byId('request-garment').props.value,category??'')
   assert.equal(byId('request-garment').props.readOnly,!!category)
   if(!category){byId('request-garment').props.onChange({target:{value:'Custom outfit'}});redraw()}
   byId('request-description').props.onChange({target:{value:'Please follow this customer design reference.'}});redraw()
   byId('request-date').props.onChange({target:{value:'2099-12-01'}});redraw()
   await treeNodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});redraw()
   await treeNodes(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
   assert.equal(calls[0].name,'send_tailoring_request_with_measurements');assert.equal(calls[0].args.p_share,category==='kurti');assert.deepEqual(calls[0].args.p_values,category==='kurti'?{waist:80.01,shoulder_width:40}:null);assert.equal(calls[0].args.p_measured_on,category==='kurti'?'2026-10-28':null);assert.equal(calls[0].args.p_design_id,fixture.id);assert.equal(calls[0].args.p_design_version,3)
   assert.equal(calls[0].args.p_garment_type,category??'Custom outfit');assert.deepEqual(calls[0],calls[1])
   assert.deepEqual(navigation[0],['/customer/requests/request-id',{replace:true,state:{sent:true}}])
   assert.deepEqual(Object.keys(calls[0].args).sort(),['p_id','p_tailor_id','p_garment_type','p_description','p_quantity','p_preferred_date','p_design_id','p_design_version','p_share','p_values','p_measured_on'].sort())
  }
 }finally{setSupabase(null);delete globalThis.__sharingHooks;delete globalThis.__sharingNavigate}
})

test('blank sketch renderer contains only artwork/background and preserves filled shapes and layer order through save/snapshot',async()=>{
 const model=extendedModel,art={version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#123ABC',width:3,fill:'#FEDCBA',points:[[1000,1000],[6000,6000]]},{kind:'ellipse',mode:'canvas',colour:'#abcdef',width:2,fill:null,points:[[2000,2000],[5000,7000]]},{mode:'canvas',colour:'#303039',width:2,points:[[0,0],[10000,10000]]}]}
 const design={...model.defaultSketch,name:'My own outfit',notes:'Sleeve idea',decorations:art}
 assert.equal(model.validateDesignOptions(design),'')
 const html=render(h(DesignIllustration,{design}))
 assert.match(html,/Customer design reference/);assert.match(html,/Sleeve idea/)
 assert.equal((html.match(/<polygon/g)??[]).length,2)
 assert.equal((html.match(/<polyline/g)??[]).length,1)
 assert.match(html,/fill="#FEDCBA"/);assert.doesNotMatch(html,/<path|clipPath|Design illustration/)
 assert.match(html,/<rect width="320" height="480" fill="#f3e6ce"/)
 assert.ok(html.indexOf('data-drawing-stroke="0"')<html.indexOf('data-drawing-stroke="1"'))
 const colours=render(h(ColourControl,{id:'test-colour',label:'Shape fill',value:'#123ABC',onChange(){}}))
 assert.equal((colours.match(/aria-pressed=/g)??[]).length,28)
 assert.match(colours,/type="color"/);assert.match(colours,/#RRGGBB/)
 const {setSupabase}=await load('../src/lib/supabase.ts');let saved,snapshot
 setSupabase({rpc:async(_name,args)=>{saved={...structuredClone(args.p_fields),id:args.p_id,version:1};return {data:saved,error:null}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?saved:snapshot),error:null})})})})})
 try{
  const id='90000000-0000-4000-8000-000000000001';await designService.save(id,design,null)
  const reopened=await designService.get(id);assert.equal(reopened.design_kind,'sketch');assert.equal(reopened.format_version,4)
  assert.deepEqual(reopened.decorations,art)
  snapshot={...structuredClone(saved),request_id:'r',design_id:id,design_version:1};const customer=await designService.snapshot('r')
  saved.decorations={version:2,strokes:[]};const tailor=await designService.snapshot('r')
  const svg=d=>render(h(DesignIllustration,{design:d})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
  assert.equal(svg(customer),svg(tailor));assert.equal(svg(reopened),svg(tailor))
 }finally{setSupabase(null)}
 const garment={...defaultDesign,garment_fill:'#123ABC',decorations:art}
 assert.match(render(h(DesignIllustration,{design:garment})),/<g fill="#123ABC"/)
 assert.ok(model.validateDesignOptions({...design,decorations:{version:2,strokes:[{...art.strokes[0],mode:'garment'}]}}))
})

test('designer mode switching preserves both drafts and blocks navigation/reload while either is unsaved',async()=>{
 let source=ts.transpileModule(readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 const state=[];let cursor=0,blockCallback,blocked=false,reset=false,proceeded=false
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]},useEffect(){}}
 globalThis.__modeHooks=hooks;globalThis.__modeModel=extendedModel
 globalThis.__modeRouter={useLocation:()=>({key:'mode-route'}),useParams:()=>({}),useNavigate:()=>()=>{},useBlocker:fn=>{blockCallback=fn;return {state:blocked?'blocked':'unblocked',reset(){reset=true},proceed(){proceeded=true}}}}
 source=source.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g,(_all,clause,spec)=>{
  if(spec==='react/jsx-runtime')return `import ${clause} from '${import.meta.resolve(spec)}';`
  if(spec==='react')return `const ${clause}=globalThis.__modeHooks;`
  if(spec==='react-router-dom')return `const Link=()=>null;const {useNavigate,useParams,useBlocker,useLocation}=globalThis.__modeRouter;`
  if(spec.endsWith('/designService'))return `const ${clause}=globalThis.__modeModel;`
  if(spec.endsWith('/authService'))return 'const authError=String;'
  if(clause.startsWith('{'))return `const ${clause}=Object.fromEntries(['DashboardHeading','DashboardPanel'].map(name=>[name,()=>null]));`
  return `const ${clause}=()=>null;`
 }).replace(/import\s+['"][^'"]+\.css['"];?/g,'')
 const {default:Page}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
 let tree;const renderPage=()=>{cursor=0;tree=Page()}
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(nodes)]
 const find=p=>nodes(tree).find(p)
 const click=label=>{const button=find(n=>n.type==='button'&&n.props.children===label);assert.ok(button,label);button.props.onClick();renderPage()}
 try{
  renderPage();state[5]='new:0';state[11].current='garment-draft-id';renderPage()
  assert.equal(blockCallback(),false)
  const garmentEditor=find(n=>n.type?.name==='DesignDrawingEditor'&&n.props.design.design_kind!=='sketch')
  const art={version:2,strokes:[{kind:'rectangle',mode:'canvas',colour:'#123456',width:2,fill:null,points:[[100,100],[500,500]]}]}
  garmentEditor.props.onChange(art);renderPage();assert.equal(blockCallback(),true)
  click('Draw your own design');assert.equal(state[3].design_kind,'sketch');assert.equal(state[3].decorations.strokes.length,0)
  find(n=>n.props?.id==='sketch-notes').props.onChange({target:{value:'My sketch note'}});renderPage()
  click('Customize a garment');assert.deepEqual(state[3].decorations,art);assert.equal(state[11].current,'garment-draft-id')
  click('Draw your own design');assert.equal(state[3].notes,'My sketch note');assert.equal(blockCallback(),true)
  blocked=true;renderPage();assert.ok(find(n=>n.props?.role==='alertdialog'))
  click('Keep editing');assert.equal(reset,true);click('Discard and leave');assert.equal(proceeded,true)
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.match(app,/createBrowserRouter/);assert.match(app,/RouterProvider/)
  const page=readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8')
  assert.match(page,/beforeunload/);assert.match(page,/event.preventDefault\(\)/)
 }finally{delete globalThis.__modeHooks;delete globalThis.__modeModel;delete globalThis.__modeRouter}
})

test('canvas annotations render outside garment clipping in mixed stroke order and share the same save/snapshot data',async()=>{
 const legacy={colour:'#303039',width:3,points:[[100,100],[9000,9000]]}
 const decorations={version:1,strokes:[legacy,{...legacy,mode:'canvas'},{...legacy,mode:'garment'}]}
 const design={...defaultDesign,decorations}
 const html=render(h(DesignIllustration,{design}))
 const groups=[...html.matchAll(/<g data-drawing-mode="([^"]+)"([^>]*)>([\s\S]*?)<\/g>/g)]
 assert.deepEqual(groups.map(g=>g[1]),['garment','canvas','garment'])
 assert.match(groups[0][2],/clip-path=/);assert.doesNotMatch(groups[1][2],/clip-path=/);assert.match(groups[2][2],/clip-path=/)
 assert.match(groups[1][3],/points="3.2,4.8 288,432"/)
 const canvasOnly=render(h(DesignIllustration,{design:{...design,decorations:{version:1,strokes:[{...legacy,mode:'canvas'}]}}}))
 assert.doesNotMatch(canvasOnly,/<clipPath|clip-path=/)
 assert.match(canvasOnly,/<g fill="#a8324a"/,'garment remains visible below annotations')
 const page=readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8')
 assert.match(page,/design-thumbnail[\s\S]*?<DesignIllustration design=\{design\} illustrationOnly/)
 const {setSupabase}=await load('../src/lib/supabase.ts');let row,snapshot
 setSupabase({rpc:async(_name,args)=>{row={...structuredClone(args.p_fields),id:args.p_id,version:1};return {data:row,error:null}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?row:snapshot),error:null})})})})})
 try{
  const id='89000000-0000-4000-8000-000000000001'
  await designService.save(id,design,null)
  const reopened=await designService.get(id);assert.deepEqual(reopened.decorations,decorations)
  snapshot={...structuredClone(row),request_id:'r',design_id:id,design_version:1}
  const customer=await designService.snapshot('r');row.decorations={version:1,strokes:[]}
  const tailor=await designService.snapshot('r')
  const svg=d=>render(h(DesignIllustration,{design:d})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
  assert.equal(svg(customer),svg(tailor));assert.equal(svg(reopened),svg(tailor))
  assert.deepEqual(tailor.decorations.strokes.map(s=>s.mode),[undefined,'canvas','garment'])
 }finally{setSupabase(null)}
})

test('decorative strokes clip to the actual filled silhouette for every garment, custom neckline and collar',()=>{
 const strokes={version:1,strokes:[{colour:'#b08d35',width:4,points:[[0,0],[10000,10000]]}]}
 const paths=html=>[...html.matchAll(/<path[^>]* d="([^"]+)"/g)].map(match=>match[1])
 const filled=html=>{
  const stack=['black'],result=[]
  for(const tag of html.match(/<\/?g\b[^>]*>|<path\b[^>]*>/g)??[]){
   if(tag.startsWith('</g')){stack.pop();continue}
   const fill=tag.match(/\bfill="([^"]+)"/)?.[1]??stack.at(-1)
   if(tag.startsWith('<g')){stack.push(fill);continue}
   if(fill!=='none')result.push(tag.match(/\bd="([^"]+)"/)[1])
  }
  return result
 }
 const cases=Object.keys(extendedModel.garmentLabels).map(type=>extendedModel.switchGarment(defaultDesign,type))
 cases.push({...extendedModel.switchGarment(defaultDesign,'shirt'),collar_style:null,garment_options:{collar:'band'}},...['dress','blouse','shirt','kurti','salwar_top'].map(type=>({...extendedModel.switchGarment(defaultDesign,type),...(type==='shirt'?{garment_options:{collar:'none'}}:{}),custom_neckline:{depths:[65,80,108,90,65]}})))
 for(const design of cases){
  const original=structuredClone(design),base=render(h(DesignIllustration,{design,illustrationOnly:true}))
  const html=render(h(DesignIllustration,{design:{...design,decorations:strokes},illustrationOnly:true}))
  const clip=html.match(/<clipPath[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/clipPath>/)
  assert.ok(clip,design.garment_type)
  assert.deepEqual(paths(clip[2]),filled(base),`${design.garment_type} clip is exactly the closed filled garment paths`)
  assert.ok(html.includes(`clip-path="url(#${clip[1]})"`))
  assert.match(html,/<polyline[^>]*points="0,0 320,480"[^>]*stroke="#b08d35"[^>]*stroke-width="4"/)
  assert.doesNotMatch(html,/<image|<foreignObject|<script/)
  assert.deepEqual(design,original)
  assert.equal(base.includes('<clipPath'),false,'legacy empty design has no drawing layer')
 }
})

test('decorations survive explicit save/reopen and immutable snapshot rendering without accepting photo data',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts');let row,snapshot
 setSupabase({rpc:async(name,args)=>{assert.equal(name,'save_customer_design');assert.equal('photo' in args.p_fields,false);assert.equal('alignment' in args.p_fields,false);row={...structuredClone(args.p_fields),id:args.p_id,version:1,owner_id:'customer'};return {data:structuredClone(row),error:null}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?row:snapshot),error:null})})})})})
 try{
  const decorations={version:1,strokes:[{colour:'#a8324a',width:3,points:[[4000,3000],[5000,3500],[6000,3000]]}]}
  const design={...extendedModel.switchGarment(defaultDesign,'kurti'),custom_neckline:{depths:[65,80,108,90,65]},decorations}
  const id='87000000-0000-4000-8000-000000000001'
  await designService.save(id,{...design,photo:'private',alignment:{x:50}},null)
  const reopened=await designService.get(id)
  assert.deepEqual(reopened.decorations,decorations)
  assert.deepEqual(extendedModel.editableDesign(reopened).decorations,decorations)
  snapshot={...structuredClone(row),request_id:'request',design_id:id,design_version:1}
  const customer=await designService.snapshot('request');row.decorations={version:1,strokes:[]}
  const tailor=await designService.snapshot('request')
  const svg=fields=>render(h(DesignIllustration,{design:fields})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
  assert.equal(svg(reopened),svg(customer));assert.equal(svg(customer),svg(tailor))
  assert.deepEqual(tailor.decorations,decorations)
  await assert.rejects(designService.save(id,{...design,decorations:{version:1,strokes:[{colour:'url(evil)',width:3,points:[[0,0],[1,1]]}]}},1),/Invalid decorative/)
 }finally{setSupabase(null)}
 const composer=readFileSync(new URL('../src/components/portal/RequestComposer.tsx',import.meta.url),'utf8')
 assert.match(composer,/Tailor will see this design/);assert.match(composer,/<DesignIllustration design=\{selectedDesign.design\}/)
})

test('new garments have distinct silhouettes and every supported option has working shared SVG geometry',()=>{
 const paths=design=>[...render(h(DesignIllustration,{design,illustrationOnly:true})).matchAll(/<path d="([^"]+)"/g)].map(match=>match[1]).join('|')
 const bases=Object.keys(extendedModel.garmentLabels).map(type=>type==='dress'?defaultDesign:extendedModel.switchGarment(defaultDesign,type))
 assert.equal(new Set(bases.map(paths)).size,7)
 let combinations=0
 for(const type of ['shirt','trousers','kurti','salwar_top']){
  const base=extendedModel.switchGarment(defaultDesign,type)
  const opts=type==='shirt'?['point','band','none'].map(collar=>({collar})):type==='trousers'?['flat','elastic'].flatMap(waist_style=>['straight','tapered','wide'].map(leg_style=>({waist_style,leg_style}))):['none','short','long'].map(side_slits=>({side_slits}))
  assert.equal(new Set(opts.map(garment_options=>paths({...base,collar_style:null,garment_options}))).size,opts.length,`${type} options change rendered paths`)
  for(const garment_options of opts)for(const length of ['short','midi','long'])for(const neckline of type==='trousers'?['none']:type==='shirt'&&garment_options.collar!=='none'?['round']:['round','v','square'])for(const sleeve of type==='trousers'?['none']:type==='shirt'?['short','long']:['sleeveless','short','long']){
   const design={...base,collar_style:null,garment_options,length,neckline,sleeve}
   assert.equal(extendedModel.validateDesignOptions(design),'')
   const html=render(h(DesignIllustration,{design}))
   assert.match(html,/<svg/);assert.doesNotMatch(html,/Unsupported|NaN|Infinity/)
   if(type!=='trousers')assert.equal(shapeForRender.validatePreviewShape(shapeForRender.defaultPreviewShape(design),design),'',JSON.stringify(design))
   combinations++
  }
 }
 assert.equal(combinations,210)
})

test('garment switches clear incompatible selections; relevant controls and custom-neckline support follow the type',()=>{
 const source={...defaultDesign,format_version:2,custom_neckline:{depths:[65,80,100,80,65]},colour:'navy',length:'long'}
 for(const type of Object.keys(extendedModel.garmentLabels)){
  const changed=extendedModel.switchGarment(source,type)
  assert.equal(changed.custom_neckline,null);assert.equal(changed.length,'midi');assert.equal(changed.name,source.name);assert.equal(changed.colour,'navy')
  assert.equal(extendedModel.validateDesignOptions(changed),'')
  const controls=render(h(GarmentOptionsControls,{fields:changed,onChange(){},disabled:false}))
  if(type==='trousers'){assert.match(controls,/design-waist-style/);assert.match(controls,/design-leg-style/);assert.doesNotMatch(controls,/design-neckline|design-sleeve|Edit neckline/)}
  if(type==='shirt'){assert.match(controls,/design-collar/);assert.match(controls,/design-sleeve/);assert.match(controls,/design-neckline|Edit neckline/);assert.doesNotMatch(controls,/Sleeveless/)}
  if(type==='kurti'||type==='salwar_top'){assert.match(controls,/design-side-slits/);assert.match(controls,/Edit neckline/)}
 }
 const top=extendedModel.switchGarment(source,'shirt')
 const uncollared={...top,garment_options:{collar:'none'},custom_neckline:source.custom_neckline}
 assert.equal(extendedModel.validateDesignOptions(uncollared),'')
 assert.equal(extendedModel.validateDesignOptions({...top,custom_neckline:source.custom_neckline}),'')
 assert.ok(extendedModel.validateDesignOptions({...top,collar_style:'shirt',custom_neckline:source.custom_neckline}))
 assert.ok(extendedModel.validateDesignOptions({...top,collar_style:null,garment_options:{collar:'point'},custom_neckline:source.custom_neckline}))
 for(const type of ['shirt','kurti','salwar_top']){
  const design={...extendedModel.switchGarment(source,type),custom_neckline:source.custom_neckline,...(type==='shirt'?{garment_options:{collar:'none'}}:{})}
  const body=shapeForRender.shapedGarmentPaths(design,shapeForRender.defaultPreviewShape(design)).body
  assert.ok(body.includes(geometryForRender.customNecklinePath(source.custom_neckline)))
 }
 assert.ok(extendedModel.validateDesignOptions({...extendedModel.switchGarment(source,'trousers'),garment_options:{waist_style:'flat',leg_style:'script'}}))
 assert.ok(extendedModel.validateDesignOptions({...top,format_version:2}))
})

test('new garment options save/reopen and participant snapshots use identical final rendering',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts');let row,snapshot
 setSupabase({rpc:async(name,args)=>{assert.equal(name,'save_customer_design');row={...structuredClone(args.p_fields),id:args.p_id,version:1,owner_id:'customer',attached_at:null};return {data:structuredClone(row),error:null}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?row:snapshot),error:null})})})})})
 try{
  for(const type of ['shirt','trousers','kurti','salwar_top']){
   const fields=extendedModel.switchGarment(defaultDesign,type),id='86000000-0000-4000-8000-000000000001'
   await designService.save(id,fields,null)
   const reopened=await designService.get(id)
   assert.deepEqual(extendedModel.editableDesign(reopened),extendedModel.editableDesign(fields))
   snapshot={...structuredClone(row),request_id:'request',design_id:id,design_version:1}
   const customer=await designService.snapshot('request')
   row.garment_options={};row.colour='black'
   const tailor=await designService.snapshot('request')
   const svg=design=>render(h(DesignIllustration,{design})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
   assert.equal(svg(customer),svg(tailor));assert.deepEqual(tailor.garment_options,fields.garment_options)
   assert.equal(svg(reopened),svg(tailor))
  }
 }finally{setSupabase(null)}
})

test('direct preview shape edits replace filled paths, retain custom neckline and details, and never alter normal design rendering',()=>{
 const design={...defaultDesign,format_version:2,custom_neckline:{depths:[65,80,108,90,65]},sleeve:'long'}
 const copy=structuredClone(design)
 const normal=()=>render(h(DesignIllustration,{design})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
 const before=normal()
 let shape=shapeForRender.defaultPreviewShape(design)
 shape=shapeForRender.changeShape(shape,'left.sleeveWidth',50,false,design)
 shape=shapeForRender.changeShape(shape,'left.waist',45,false,design)
 shape=shapeForRender.changeShape(shape,'hemY',430,false,design)
 const expected=shapeForRender.shapedGarmentPaths(design,shape)
 const preview=render(h(DesignIllustration,{design,illustrationOnly:true,previewShape:shape}))
 const paths=html=>[...html.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1])
 assert.deepEqual(paths(preview),[...expected.sleeves,expected.body,expected.seam,...expected.details])
 assert.ok(expected.body.includes(geometryForRender.customNecklinePath(design.custom_neckline)))
 assert.match(expected.body,/Z$/);assert.equal(paths(preview).length,6)
 assert.notEqual(paths(preview)[0],paths(before)[0]);assert.notEqual(paths(preview)[2],paths(before)[2])
 const marks={leftShoulder:{x:35,y:15},rightShoulder:{x:65,y:15},leftWaist:{x:40,y:40},rightWaist:{x:60,y:40},leftHip:{x:32,y:55},rightHip:{x:68,y:55},hem:{x:50,y:90}}
 const warp=alignmentForRender.alignmentWarp(marks,design)
 const aligned=render(h(DesignIllustration,{design,illustrationOnly:true,previewShape:shape,previewWarp:warp}))
 assert.deepEqual(paths(aligned),paths(preview).map(path=>alignmentForRender.warpIllustrationPath(path,warp)))
 assert.equal(normal(),before);assert.deepEqual(design,copy)
 const invalid=render(h(DesignIllustration,{design,previewShape:{...shape,hemY:100}}))
 assert.match(invalid,/cannot be drawn safely/);assert.doesNotMatch(invalid,/<svg/)
})

test('guided warp preserves custom necklines, colour, sleeves and details without changing saved/snapshot rendering',()=>{
 const design={...defaultDesign,format_version:2,custom_neckline:{depths:[65,80,108,90,65]},sleeve:'long'}
 const marks={leftShoulder:{x:35,y:15},rightShoulder:{x:65,y:15},leftWaist:{x:40,y:40},rightWaist:{x:60,y:40},leftHip:{x:32,y:55},rightHip:{x:68,y:55},hem:{x:50,y:90}}
 const original=structuredClone(design)
 const normal=()=>render(h(DesignIllustration,{design})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
 const before=normal()
 const warp=alignmentForRender.alignmentWarp(marks,design)
 const preview=render(h(DesignIllustration,{design,illustrationOnly:true,previewWarp:warp}))
 assert.match(preview,/viewBox="0 0 100 100"/);assert.match(preview,/preserveAspectRatio="none"/)
 assert.match(preview,/custom neckline, long sleeves/);assert.match(preview,/fill="#a8324a"/)
 const paths=html=>[...html.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1])
 assert.deepEqual(paths(preview),paths(before).map(path=>alignmentForRender.warpIllustrationPath(path,warp)))
 assert.equal(paths(preview).length,6,'two sleeves, garment, waist seam and two detail lines remain')
 const changedNeck=render(h(DesignIllustration,{design:{...design,custom_neckline:{depths:[65,70,75,70,65]}},illustrationOnly:true,previewWarp:warp}))
 assert.notEqual(paths(preview)[2],paths(changedNeck)[2])
 assert.deepEqual(design,original)
 assert.equal(normal(),before)
 assert.match(before,/viewBox="0 0 320 480"/)
 const requestDesign=readFileSync(new URL('../src/components/portal/RequestDesign.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(requestDesign,/previewWarp|alignment|measurements/)
})

test('custom neckline replaces the filled silhouette, with no preset line in final illustrations',()=>{
 const {customNecklinePath}=geometryForRender
 const custom_neckline={depths:[65,80,108,90,65]}
 for(const garment_type of ['dress','blouse'])for(const neckline of ['round','v','square']){
  const html=render(h(DesignIllustration,{design:{...defaultDesign,garment_type,neckline,format_version:2,custom_neckline}}))
  const paths=[...html.matchAll(/<path d="([^"]+)"/g)].map(match=>match[1])
  assert.equal(paths.filter(path=>path.includes(customNecklinePath(custom_neckline))).length,1)
  assert.ok(paths.some(path=>path.startsWith('M120 65 L143 65 C')&&path.endsWith('Z')),'curve belongs to the closed filled garment')
  assert.doesNotMatch(html,/Q160 100 177 65|L160 110 L177 65|L143 95 L177 95 L177 65|stroke-dasharray/)
  assert.match(html,/Custom curve/)
 }
 const invalid=render(h(DesignIllustration,{design:{...defaultDesign,format_version:2,custom_neckline:{depths:[65,80,999,90,65]}}}))
 assert.match(invalid,/Unsupported design geometry/);assert.doesNotMatch(invalid,/<svg/)
})

test('geometry survives service save/reopen and snapshots render the same garment for both participants',async()=>{
 const {setSupabase}=await load('../src/lib/supabase.ts')
 let stored,snapshot
 const id='82000000-0000-4000-8000-000000000001'
 setSupabase({rpc:async(name,args)=>{
  assert.equal(name,'save_customer_design')
  stored={...structuredClone(args.p_fields),id:args.p_id,version:1,owner_id:'customer',attached_at:null}
  return {data:structuredClone(stored),error:null}
 },from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:structuredClone(table==='customer_designs'?stored:snapshot),error:null})})})})})
 try{
  const fields={...defaultDesign,format_version:2,custom_neckline:{depths:[65,80,108,90,65]}}
  await designService.save(id,{...fields,svg:'<svg/>',owner_id:'forged'},null)
  assert.equal('svg' in stored,false);assert.equal(stored.owner_id,'customer')
  const reopened=await designService.get(id)
  assert.deepEqual(reopened.custom_neckline,fields.custom_neckline)
  assert.equal(reopened.format_version,2)
  snapshot={...structuredClone(stored),request_id:'request',design_id:id,design_version:1}
  const customerSnapshot=await designService.snapshot('request')
  stored.custom_neckline.depths[2]=115
  const tailorSnapshot=await designService.snapshot('request')
  const svg=design=>render(h(DesignIllustration,{design})).replace(/id="[^"]*"|aria-labelledby="[^"]*"/g,'')
  assert.equal(svg(customerSnapshot),svg(tailorSnapshot))
  assert.deepEqual(tailorSnapshot.custom_neckline,fields.custom_neckline)
  await assert.rejects(designService.save(id,{...fields,custom_neckline:{depths:[65,80,999,90,65]}},1),/Invalid custom neckline/)
 }finally{setSupabase(null)}
 const page=readFileSync(new URL('../src/pages/DesignerPage.tsx',import.meta.url),'utf8')
 assert.match(page,/setFields\(value\?editableDesign\(value\)/)
 assert.match(page,/setFields\(editableDesign\(design\)\)/)
 assert.match(page,/designFingerprint\(fields\)/)
 const composer=readFileSync(new URL('../src/components/portal/RequestComposer.tsx',import.meta.url),'utf8')
 assert.match(composer,/Tailor will see this design/)
})
