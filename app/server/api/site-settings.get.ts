import type { SiteSettings } from '#shared/types/site'

// GET /api/site-settings — Google Analytics + Search Console settings for the
// public site. Edited in Strapi (Content Manager → Site settings); cached here
// for a minute so every page view doesn't hit Strapi. Values are validated
// before they reach the page, since they end up in <head>.

const GA_ID = /^G-[A-Z0-9]{4,15}$/
const TOKEN = /^[\w-]{10,100}$/

/** Accepts the bare token or the whole `<meta name="google-site-verification" content="…">` tag. */
function verificationToken(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(s)?.[1]
  const token = (fromTag ?? s).trim()
  return TOKEN.test(token) ? token : null
}

export default defineCachedEventHandler(async (event): Promise<SiteSettings> => {
  const config = useRuntimeConfig(event)
  let row: Record<string, unknown> | null = null
  if (isStrapi(event)) {
    try {
      const res = await $fetch<{ data: Record<string, unknown> | null }>(`${strapiBase(event)}/api/site-setting`, { headers: { accept: 'application/json' } })
      row = res?.data ?? null
    } catch { /* not created yet (404) or Strapi down: fall back to env */ }
  }
  const gaRaw = String(row?.googleAnalyticsId || config.googleAnalyticsId || '').trim().toUpperCase()
  const enabled = row ? row.analyticsEnabled !== false : true
  return {
    googleAnalyticsId: enabled && GA_ID.test(gaRaw) ? gaRaw : null,
    requireCookieConsent: row ? row.requireCookieConsent !== false : true,
    googleSiteVerification: verificationToken(row?.googleSiteVerification || config.googleSiteVerification),
  }
}, { maxAge: 60, swr: true, name: 'site-settings', getKey: () => 'v1' })
