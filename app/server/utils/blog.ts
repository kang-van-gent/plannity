import type { H3Event } from 'h3'
import type { BlogBlock, BlogImage, BlogInline, BlogList, BlogPost, BlogPostSummary } from '#shared/types/blog'

// Strapi "Blog post" → the shape the /blog pages render. Posts are public, so
// these calls go to Strapi without the visitor's session.

type Raw = Record<string, unknown>

/** Strapi serves uploads as /uploads/… on its own origin; make them absolute. */
export function blogMediaBase(event: H3Event): string {
  const c = useRuntimeConfig(event)
  return String(c.public.mediaBaseUrl || c.strapiPublicUrl || c.strapiUrl).replace(/\/$/, '')
}

const absolute = (url: string, base: string) => (/^https?:\/\//i.test(url) ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`)

function image(raw: unknown, base: string): BlogImage | null {
  const r = raw as Raw | null | undefined
  if (!r || typeof r.url !== 'string') return null
  return {
    url: absolute(r.url, base),
    alternativeText: (r.alternativeText as string) ?? null,
    caption: (r.caption as string) ?? null,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
  }
}

/** Image URLs inside the rich text are relative too. */
function withAbsoluteImages(blocks: BlogBlock[], base: string): BlogBlock[] {
  return blocks.map((b) => (b.type === 'image' && b.image ? { ...b, image: image(b.image, base) ?? b.image } : b))
}

function inlineText(nodes: BlogInline[] = []): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : inlineText(n.children))).join('')
}
function listText(l: BlogList): string {
  return l.children.map((c) => (c.type === 'list' ? listText(c) : inlineText(c.children))).join(' ')
}
export function blocksText(blocks: BlogBlock[] = []): string {
  return blocks.map((b) => (b.type === 'list' ? listText(b) : b.type === 'image' ? '' : inlineText(b.children))).join(' ')
}

/** Thai has no spaces between words, so count its characters separately. */
export function readingMinutes(text: string): number {
  const thai = (text.match(/[฀-๿]/g) ?? []).length
  const words = text.replace(/[฀-๿]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 220 + thai / 700))
}

export function toSummary(r: Raw, base: string): BlogPostSummary {
  const content = (r.content as BlogBlock[]) ?? []
  const excerpt = String(r.excerpt ?? '').trim() || blocksText(content).slice(0, 180).trim()
  return {
    id: String(r.documentId ?? r.id),
    slug: String(r.slug ?? ''),
    title: String(r.title ?? ''),
    excerpt,
    category: (r.category as string) || null,
    author: (r.author as string) || 'Plannity Team',
    publishedAt: String(r.publishedAt ?? r.createdAt ?? ''),
    cover: image(r.cover, base),
    featured: !!r.featured,
    minutes: readingMinutes(blocksText(content)),
  }
}

export function toPost(r: Raw, base: string): BlogPost {
  return {
    ...toSummary(r, base),
    content: withAbsoluteImages((r.content as BlogBlock[]) ?? [], base),
    seoTitle: (r.seoTitle as string) || null,
    seoDescription: (r.seoDescription as string) || null,
  }
}

/** GET /api/blog-posts on Strapi (public role, published only). */
export async function strapiBlog(event: H3Event, query: Record<string, string | number>) {
  try {
    return await $fetch<{ data: Raw[]; meta: { pagination?: { page: number; pageCount: number; total: number } } }>(
      `${strapiBase(event)}/api/blog-posts`,
      { query: { 'populate[cover]': 'true', 'sort[0]': 'publishedAt:desc', ...query }, headers: { accept: 'application/json' } },
    )
  } catch {
    throw createError({ statusCode: 503, data: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Blog is unavailable' } } })
  }
}

export const isStrapi = (event: H3Event) => useRuntimeConfig(event).public.dataSource === 'strapi'
