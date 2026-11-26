import type { BlogListResponse } from '#shared/types/blog'

// GET /api/blog?page=1&pageSize=9 — published posts, newest first.
export default defineEventHandler(async (event): Promise<BlogListResponse> => {
  const q = getQuery(event)
  const page = Math.max(1, Math.min(1000, Number(q.page) || 1))
  const pageSize = Math.max(1, Math.min(24, Number(q.pageSize) || 9))

  if (!isStrapi(event)) {
    const all = SAMPLE_POSTS.map((s) => toSummary(s as unknown as Record<string, unknown>, ''))
    return {
      data: all.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, pageCount: Math.max(1, Math.ceil(all.length / pageSize)), total: all.length, sample: true },
    }
  }

  const base = blogMediaBase(event)
  const res = await strapiBlog(event, { 'pagination[page]': page, 'pagination[pageSize]': pageSize })
  const p = res.meta.pagination ?? { page, pageCount: 1, total: res.data.length }
  return { data: res.data.map((r) => toSummary(r, base)), meta: { page: p.page, pageCount: Math.max(1, p.pageCount), total: p.total, sample: false } }
})
