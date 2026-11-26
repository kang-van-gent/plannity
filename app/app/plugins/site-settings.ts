import type { SiteSettings } from '#shared/types/site'

// SEO tools from Strapi "Site settings":
//  • Google Search Console: <meta name="google-site-verification"> in the
//    server-rendered <head> (what Google's verifier reads).
//  • Google Tag Manager (GTM-…): in every page's <head> with Google Consent
//    Mode v2 — consent starts "denied" (unless the visitor already allowed it,
//    or consent isn't required) and the cookie banner updates it. Tags that
//    honour consent don't set cookies before "Allow", and our page views are
//    only pushed after it.
//  • Google Analytics 4 direct (G-…): gtag.js, loaded in the browser only after
//    "Allow" (when consent is required).
// Page views are sent by us on every navigation with a cleaned URL: tokens in
// /invite links and non-campaign query strings never reach Google, and the
// payment hand-off (/pay) and sign-in callbacks (/auth) never load or send anything.

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window { dataLayer?: unknown[]; gtag?: Gtag; [k: `ga-disable-${string}`]: boolean | undefined }
}

const UNTRACKED = /^\/(pay|auth)(\/|$)/
const KEEP_QUERY = /^(utm_[a-z_]+|gclid|gbraid|wbraid)$/
const CONSENT_KEY = 'plannity-analytics-consent' // same key as useAnalytics
const GRANTED = { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }
const DENIED = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }

function cleanUrl(fullPath: string): URL {
  const u = new URL(fullPath, window.location.origin)
  u.pathname = u.pathname.replace(/^\/invite\/[^/]+/, '/invite/:token')
  const keep = new URLSearchParams()
  for (const [k, v] of u.searchParams) if (KEEP_QUERY.test(k)) keep.append(k, v)
  u.search = keep.toString()
  u.hash = ''
  return u
}

/** Inline head script: Consent Mode defaults (restoring a stored "Allow") + GTM bootstrap. IDs are validated server-side. */
function gtmBootstrap(id: string, requireConsent: boolean): string {
  return [
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;',
    `gtag('consent','default',${JSON.stringify({ ...(requireConsent ? DENIED : GRANTED), wait_for_update: 500 })});`,
    requireConsent ? `try{if(localStorage.getItem(${JSON.stringify(CONSENT_KEY)})==='granted')gtag('consent','update',${JSON.stringify(GRANTED)})}catch(e){}` : '',
    `dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});`,
    // Loaded from here (not a separate tag) so the consent defaults always run first.
    `var s=document.createElement('script');s.async=true;s.src=${JSON.stringify(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`)};document.head.appendChild(s);`,
  ].join('') + `/* ${id} */` // id in the text so a changed container re-renders the tag
}

export default defineNuxtPlugin(async (nuxtApp) => {
  const { settings, consent, restore } = useAnalytics()
  if (!settings.value) settings.value = await $fetch<SiteSettings>('/api/site-settings').catch(() => null)
  const route = useRoute()
  const gtmId = computed(() => (UNTRACKED.test(route.path) ? null : settings.value?.googleTagManagerId ?? null))

  useHead({
    meta: computed(() => (settings.value?.googleSiteVerification ? [{ name: 'google-site-verification', content: settings.value.googleSiteVerification }] : [])),
    script: computed(() => {
      const id = gtmId.value
      if (!id) return []
      return [{ key: 'gtm', innerHTML: gtmBootstrap(id, settings.value!.requireCookieConsent), tagPriority: 'critical' as const }]
    }),
  })

  if (import.meta.server) return

  const router = useRouter()
  /** Direct GA4 loaded on this page (scripts can't be unloaded). */
  let gaLoaded: string | null = null
  /** Consent state last told to Google: null = nothing told yet. */
  let told: 'granted' | 'denied' | null = null
  /** Last URL counted: first load fires both app:mounted and page:finish — count it once. */
  let lastTracked = ''
  const path = () => router.currentRoute.value.path
  const allowed = () => !!settings.value && (!settings.value.requireCookieConsent || consent.value === 'granted')
  const gtag: Gtag = (...args) => {
    window.dataLayer = window.dataLayer || []
    window.gtag = window.gtag || function gtag() { window.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
    window.gtag(...args)
  }

  function loadGa(id: string) {
    window[`ga-disable-${id}`] = false
    if (gaLoaded === id) return
    gaLoaded = id
    gtag('js', new Date())
    gtag('config', id, { send_page_view: false })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(s)
  }
  /** Direct GA4 gets `page_view`; Tag Manager gets a `plannity_page_view` dataLayer event (trigger your GA4 tags on it). */
  function pageView() {
    if (!allowed() || UNTRACKED.test(path())) return
    const s = settings.value!
    if (!gaLoaded && !s.googleTagManagerId) return
    const u = cleanUrl(router.currentRoute.value.fullPath)
    if (u.href === lastTracked) return
    lastTracked = u.href
    const view = { page_location: u.href, page_path: u.pathname + u.search, page_title: document.title }
    if (gaLoaded) gtag('event', 'page_view', view)
    if (s.googleTagManagerId) window.dataLayer!.push({ event: 'plannity_page_view', ...view })
  }
  function sync() {
    const s = settings.value
    if (!s || (!s.googleAnalyticsId && !s.googleTagManagerId)) return
    const ok = allowed()
    // Keep Google's consent state in step with the banner (Tag Manager tags read it).
    const state = ok ? 'granted' : 'denied'
    if (told !== state) {
      gtag('consent', 'update', ok ? GRANTED : DENIED)
      told = state
    }
    if (ok) {
      if (UNTRACKED.test(path())) return // start on the next normal page
      if (s.googleAnalyticsId) loadGa(s.googleAnalyticsId)
      lastTracked = ''
      pageView()
    } else if (gaLoaded || s.googleTagManagerId) {
      // Not allowed (or withdrawn): stop direct GA and drop Google's cookies.
      if (gaLoaded) window[`ga-disable-${gaLoaded}`] = true
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
  // After each navigation (title is set by then): count the page.
  nuxtApp.hook('page:finish', () => {
    setTimeout(() => {
      if (!allowed()) return
      const id = settings.value?.googleAnalyticsId
      if (id && !gaLoaded && !UNTRACKED.test(path())) loadGa(id)
      pageView()
    }, 0)
  })
})
