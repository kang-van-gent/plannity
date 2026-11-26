import type { SiteSettings } from '#shared/types/site'

// SEO tools from Strapi "Site settings":
//  • Google Search Console: <meta name="google-site-verification"> in the
//    server-rendered <head> (what Google's verifier reads).
//  • Google Analytics 4: gtag.js, loaded in the browser only — after the visitor
//    accepts analytics cookies when consent is required (PDPA).
// Page views are sent by us on every navigation with a cleaned URL: tokens in
// /invite links and non-campaign query strings never reach Google, and the
// payment hand-off (/pay) and sign-in callbacks (/auth) are never tracked.

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag; [k: `ga-disable-${string}`]: boolean | undefined }
}

const UNTRACKED = /^\/(pay|auth)(\/|$)/
const KEEP_QUERY = /^(utm_[a-z_]+|gclid|gbraid|wbraid)$/

function cleanUrl(fullPath: string): URL {
  const u = new URL(fullPath, window.location.origin)
  u.pathname = u.pathname.replace(/^\/invite\/[^/]+/, '/invite/:token')
  const keep = new URLSearchParams()
  for (const [k, v] of u.searchParams) if (KEEP_QUERY.test(k)) keep.append(k, v)
  u.search = keep.toString()
  u.hash = ''
  return u
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const { settings, consent, restore } = useAnalytics()
  if (!settings.value) settings.value = await $fetch<SiteSettings>('/api/site-settings').catch(() => null)

  useHead({
    meta: computed(() => (settings.value?.googleSiteVerification ? [{ name: 'google-site-verification', content: settings.value.googleSiteVerification }] : [])),
  })

  if (import.meta.server) return

  const router = useRouter()
  let loadedId: string | null = null
  /** Last URL counted: first load fires both app:mounted and page:finish — count it once. */
  let lastTracked = ''
  const allowed = () => !!settings.value?.googleAnalyticsId && (!settings.value.requireCookieConsent || consent.value === 'granted')
  const path = () => router.currentRoute.value.path

  function load(id: string) {
    if (loadedId === id) { window[`ga-disable-${id}`] = false; return }
    loadedId = id
    window.dataLayer = window.dataLayer || []
    // gtag must push the `arguments` object itself.
    window.gtag = function gtag() { window.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
    window.gtag('js', new Date())
    window.gtag('config', id, { send_page_view: false })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(s)
  }
  function pageView() {
    if (!loadedId || UNTRACKED.test(path())) return
    const u = cleanUrl(router.currentRoute.value.fullPath)
    if (u.href === lastTracked) return
    lastTracked = u.href
    window.gtag?.('event', 'page_view', { page_location: u.href, page_path: u.pathname + u.search, page_title: document.title })
  }
  function sync() {
    if (allowed()) {
      if (UNTRACKED.test(path())) return // start on the next normal page
      const fresh = loadedId !== settings.value!.googleAnalyticsId
      load(settings.value!.googleAnalyticsId!)
      if (fresh) pageView()
    } else if (loadedId) {
      // Consent withdrawn: stop sending and drop Google's cookies.
      window[`ga-disable-${loadedId}`] = true
      for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]!.trim()
        if (/^_ga/.test(name)) for (const domain of ['', `; domain=.${location.hostname.replace(/^www\./, '')}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`
      }
    }
  }

  nuxtApp.hook('app:mounted', () => {
    restore()
    sync()
    watch([consent, () => settings.value?.googleAnalyticsId], sync)
  })
  // After each navigation (title is set by then): count the page, or start Analytics if we were waiting to leave /pay.
  nuxtApp.hook('page:finish', () => { setTimeout(() => {
    if (!allowed()) return
    if (!loadedId) return sync()
    if (!window[`ga-disable-${loadedId}`]) pageView()
  }, 0) })
})
