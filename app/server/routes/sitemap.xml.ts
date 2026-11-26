// Public, indexable pages for search engines (spec §5 SEO), including every
// published blog post. /app/**, /pay/** and /invite/** are private and excluded.
// Submit https://<site>/sitemap.xml in Google Search Console → Sitemaps.
const ROUTES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.9' },
  { path: '/blog', changefreq: 'daily', priority: '0.8' },
  { path: '/register', changefreq: 'yearly', priority: '0.5' },
  { path: '/login', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Published posts' slugs + last change (Strapi, or the sample posts in demo mode). Never fails the sitemap. */
async function posts(event: Parameters<typeof isStrapi>[0]): Promise<{ slug: string; lastmod: string | null }[]> {
  if (!isStrapi(event)) return SAMPLE_POSTS.map((p) => ({ slug: p.slug, lastmod: p.publishedAt }))
  const out: { slug: string; lastmod: string | null }[] = []
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await strapiBlog(event, { 'pagination[page]': page, 'pagination[pageSize]': 100, 'fields[0]': 'slug', 'fields[1]': 'updatedAt', 'fields[2]': 'publishedAt' })
      for (const r of res.data) if (r.slug) out.push({ slug: String(r.slug), lastmod: String(r.updatedAt ?? r.publishedAt ?? '') || null })
      if (page >= (res.meta.pagination?.pageCount ?? 1)) break
    }
  } catch { /* blog unavailable: list the static pages only */ }
  return out
}

export default defineCachedEventHandler(async (event) => {
  const base = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, '')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  const urls = [
    ...ROUTES.map((r) => `  <url><loc>${esc(base + r.path)}</loc><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`),
    ...(await posts(event)).map((p) => `  <url><loc>${esc(`${base}/blog/${encodeURIComponent(p.slug)}`)}</loc>${p.lastmod ? `<lastmod>${esc(p.lastmod)}</lastmod>` : ''}<changefreq>monthly</changefreq><priority>0.7</priority></url>`),
  ].join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}, { maxAge: 600, swr: true, name: 'sitemap', getKey: () => 'v1' })
