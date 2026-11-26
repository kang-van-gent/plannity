import type { SiteSettings } from '#shared/types/site'

// Visitor's choice about analytics cookies (PDPA). The site-settings plugin
// watches this and loads / turns off Google Analytics accordingly.
const KEY = 'plannity-analytics-consent'
export type AnalyticsConsent = 'granted' | 'denied' | null

export function useAnalytics() {
  const settings = useState<SiteSettings | null>('site-settings', () => null)
  const consent = useState<AnalyticsConsent>('analytics-consent', () => null)
  /** Analytics is set up in Strapi, needs consent, and the visitor hasn't chosen yet. */
  const configured = computed(() => !!(settings.value?.googleAnalyticsId || settings.value?.googleTagManagerId))
  const needsChoice = computed(() => configured.value && !!settings.value?.requireCookieConsent && consent.value === null)

  function restore() {
    try {
      const v = localStorage.getItem(KEY)
      consent.value = v === 'granted' || v === 'denied' ? v : null
    } catch { /* storage blocked: ask again */ }
  }
  function choose(v: 'granted' | 'denied') {
    consent.value = v
    try { localStorage.setItem(KEY, v) } catch { /* choice holds for this visit */ }
  }
  /** Ask again (privacy page "cookie settings"). */
  function reset() {
    consent.value = null
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }
  return { settings, consent, needsChoice, configured, restore, choose, reset }
}
