import type { SiteSettings } from '#shared/types/site'

// SEO tools from Strapi "Site settings":
//  • Google Search Console: <meta name="google-site-verification"> in the
//    server-rendered <head> (what Google's verifier reads).
//  • Google Analytics 4 (gtag.js) and/or Google Tag Manager (gtm.js), loaded in
//    the browser only — after the visitor accepts cookies when consent is
//    required (PDPA).
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
  /** What has been loaded on this page so far (scripts can't be unloaded). */
  const loaded: { ga: string | null; gtm: string | null } = { ga: null, gtm: null }
  /** Consent withdrawn after loading: send nothing more. */
  let stopped = false
  /** Last URL counted: first load fires both app:mounted and page:finish — count it once. */
  let lastTracked = ''
  const ids = () => ({ ga: settings.value?.googleAnalyticsId ?? null, gtm: settings.value?.googleTagManagerId ?? null })
  const allowed = () => {
    const { ga, gtm } = ids()
    return !!(ga || gtm) && (!settings.value!.requireCookieConsent || consent.value === 'granted')
  }
  const path = () => router.currentRoute.value.path
  const anyLoaded = () => !!(loaded.ga || loaded.gtm)

  function script(src: string) {
    const s = document.createElement('script')
    s.async = true
    s.src = src
    document.head.appendChild(s)
  }
  function load() {
    const { ga, gtm } = ids()
    window.dataLayer = window.dataLayer || []
    // gtag must push the `arguments` object itself.
    window.gtag = window.gtag || function gtag() { window.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
    // Loaded only once the visitor allowed it (or consent isn't required): tell consent-aware tags so.
    window.gtag('consent', stopped ? 'update' : 'default', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' })
    stopped = false
    if (gtm && loaded.gtm !== gtm) {
      loaded.gtm = gtm
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
      script(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`)
    }
    if (ga && loaded.ga !== ga) {
      loaded.ga = ga
      window.gtag('js', new Date())
      window.gtag('config', ga, { send_page_view: false })
      script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`)
    }
    if (loaded.ga) window[`ga-disable-${loaded.ga}`] = false
  }
  /**
   * One page view per navigation, with a cleaned URL. Direct GA4 gets a
   * `page_view` event; Tag Manager gets a `plannity_page_view` dataLayer event
   * (use it as the trigger of your GA4 tags there — see Site settings help).
   */
  function pageView() {
    if (stopped || !anyLoaded() || UNTRACKED.test(path())) return
    const u = cleanUrl(router.currentRoute.value.fullPath)
    if (u.href === lastTracked) return
    lastTracked = u.href
    const view = { page_location: u.href, page_path: u.pathname + u.search, page_title: document.title }
    if (loaded.ga) window.gtag?.('event', 'page_view', view)
    if (loaded.gtm) window.dataLayer!.push({ event: 'plannity_page_view', ...view })
  }
  function sync() {
    if (allowed()) {
      if (UNTRACKED.test(path())) return // start on the next normal page
      const { ga, gtm } = ids()
      const fresh = stopped || loaded.ga !== ga || loaded.gtm !== gtm
      load()
      if (fresh) { lastTracked = ''; pageView() }
    } else if (anyLoaded() && !stopped) {
      // Consent withdrawn: stop sending, tell consent-aware tags, drop Google's cookies.
      stopped = true
      if (loaded.ga) window[`ga-disable-${loaded.ga}`] = true
      window.gtag?.('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
      for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]!.trim()
        if (/^(_ga|_gid|_gcl)/.test(name)) for (const domain of ['', `; domain=.${location.hostname.replace(/^www\./, '')}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`
      }
    }
  }

  nuxtApp.hook('app:mounted', () => {
    restore()
    sync()
    watch([consent, () => settings.value?.googleAnalyticsId, () => settings.value?.googleTagManagerId], sync)
  })
  // After each navigation (title is set by then): count the page, or start Analytics if we were waiting to leave /pay.
  nuxtApp.hook('page:finish', () => { setTimeout(() => {
    if (!allowed()) return
    if (!anyLoaded()) return sync()
    pageView()
  }, 0) })
})
