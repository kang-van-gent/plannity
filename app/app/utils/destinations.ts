import type { Content, ContentImage, Platform, PublishDestination } from '~/types'

/**
 * Multi-platform content helpers. Mirrors server/src/utils/destinations.js
 * (the backend is authoritative; this copy drives the UI and the demo backend).
 */

export const DEFAULT_TIMEZONE = 'Asia/Bangkok'
export const MAX_CAPTION = 5000

/** The platforms a post goes to, in order (falls back to its own platform). */
export function platformsOf(c: Pick<Content, 'platform' | 'destinations'>): Platform[] {
  return c.destinations?.length ? c.destinations.map((d) => d.platform) : [c.platform]
}

/** Published on n of m platforms. */
export function publishProgress(c: Pick<Content, 'destinations' | 'status'>): { done: number; total: number } {
  const list = c.destinations ?? []
  if (!list.length) return { done: c.status === 'published' ? 1 : 0, total: 1 }
  return { done: list.filter((d) => d.status === 'published').length, total: list.length }
}

/** What a member actually posts on this platform: its own caption/images, or the post's. */
export function effectiveCaption(d: Pick<PublishDestination, 'captionOverride'>, caption: string): string {
  return d.captionOverride ?? caption
}
export function effectiveImages(d: Pick<PublishDestination, 'mediaOverrideIds'>, images: ContentImage[]): ContentImage[] {
  if (!d.mediaOverrideIds) return images
  const byId = new Map(images.map((i) => [i.id, i]))
  return d.mediaOverrideIds.map((id) => byId.get(id)).filter((i): i is ContentImage => !!i)
}

/** Bangkok wall-clock date + time → UTC ISO (the app plans in Asia/Bangkok, UTC+7, no DST). */
export function bangkokToUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T${/^\d{2}:\d{2}$/.test(time) ? time : '12:00'}:00+07:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
/** UTC ISO → Bangkok { date, time }. */
export function utcToBangkok(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString()
  return { date: d.slice(0, 10), time: d.slice(11, 16) }
}

/**
 * The content state implied by its destinations: published only when every
 * platform is (partial success never counts as fully published).
 */
export function rollupContent(c: Pick<Content, 'status' | 'scheduledDate' | 'postUrl'>, list: Pick<PublishDestination, 'status' | 'publishedAt' | 'externalPostUrl'>[]): Partial<Content> | null {
  if (!list.length) return null
  const all = list.every((d) => d.status === 'published')
  if (all && c.status !== 'published') {
    const times = list.map((d) => d.publishedAt).filter((x): x is string => !!x).sort()
    const urls = list.map((d) => d.externalPostUrl).filter((x): x is string => !!x)
    return { status: 'published', publishedAt: times.at(-1) ?? new Date().toISOString(), postUrl: list.length === 1 ? (urls[0] ?? c.postUrl ?? null) : (c.postUrl || urls[0] || null) }
  }
  if (!all && c.status === 'published') return { status: c.scheduledDate ? 'scheduled' : 'approved', publishedAt: null }
  return null
}
