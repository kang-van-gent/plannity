import type { BlogPostResponse } from '#shared/types/blog'

// GET /api/blog/:slug — one published post plus a few others to keep reading.
export default defineEventHandler(async (event): Promise<BlogPostResponse> => {
  const slug = decodeURIComponent(getRouterParam(event, 'slug') ?? '')
  if (!slug || slug.length > 200) throw createError({ statusCode: 404, statusMessage: 'Post not found' })

  if (!isStrapi(event)) {
    const raw = SAMPLE_POSTS.find((s) => s.slug === slug)
    if (!raw) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
    const related = SAMPLE_POSTS.filter((s) => s.slug !== slug).slice(0, 3)
    return {
      data: toPost(raw as unknown as Record<string, unknown>, ''),
      related: related.map((s) => toSummary(s as unknown as Record<string, unknown>, '')),
      sample: true,
    }
  }

  const base = blogMediaBase(event)
  const [one, latest] = await Promise.all([
    strapiBlog(event, { 'filters[slug][$eq]': slug, 'pagination[pageSize]': 1 }),
    strapiBlog(event, { 'filters[slug][$ne]': slug, 'pagination[pageSize]': 3 }),
  ])
  const raw = one.data[0]
  if (!raw) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return { data: toPost(raw, base), related: latest.data.map((r) => toSummary(r, base)), sample: false }
})
