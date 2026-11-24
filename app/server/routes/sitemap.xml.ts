// Public, indexable routes only (spec §5 SEO). /app/** is excluded and noindex.
const ROUTES = ['/', '/pricing', '/login', '/register', '/privacy', '/terms']

export default defineEventHandler((event) => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const urls = ROUTES.map((r) => `  <url><loc>${base}${r}</loc><changefreq>weekly</changefreq></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
})
