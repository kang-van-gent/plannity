/** Public SEO / analytics settings (Strapi "Site settings", sanitised by /api/site-settings). */
export interface SiteSettings {
  /** GA4 Measurement ID (G-…), or null when Analytics is off. */
  googleAnalyticsId: string | null
  /** Ask before loading Analytics (PDPA). */
  requireCookieConsent: boolean
  /** Google Search Console HTML-tag verification token. */
  googleSiteVerification: string | null
}
