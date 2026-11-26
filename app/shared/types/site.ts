/** Public SEO / analytics settings (Strapi "Site settings", sanitised by /api/site-settings). */
export interface SiteSettings {
  /** Google tag ID (GA4 G-… or GT-…), or null when Analytics is off. */
  googleAnalyticsId: string | null
  /** Google Tag Manager container (GTM-…), or null. */
  googleTagManagerId: string | null
  /** Ask before loading Analytics / Tag Manager (PDPA). */
  requireCookieConsent: boolean
  /** Google Search Console HTML-tag verification token. */
  googleSiteVerification: string | null
}
