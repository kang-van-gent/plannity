import type { Content, ContentStatus, Platform } from '~/types'

export const PLATFORM_META: Record<Platform, { label: string; short: string; bg: string; fg: string }> = {
  facebook: { label: 'Facebook', short: 'f', bg: '#1877F2', fg: '#fff' },
  instagram: { label: 'Instagram', short: 'IG', bg: 'linear-gradient(135deg,#feda75,#fa7e1e 30%,#d62976 60%,#962fbf 85%)', fg: '#fff' },
  tiktok: { label: 'TikTok', short: 'TT', bg: '#111111', fg: '#fff' },
  youtube: { label: 'YouTube', short: 'YT', bg: '#FF0033', fg: '#fff' },
  line: { label: 'LINE OA', short: 'LINE', bg: '#06C755', fg: '#fff' },
  x: { label: 'X', short: 'X', bg: '#0f0f0f', fg: '#fff' },
  linkedin: { label: 'LinkedIn', short: 'in', bg: '#0A66C2', fg: '#fff' },
}

export const STATUS_META: Record<ContentStatus, { dot: string; chip: string }> = {
  draft: { dot: 'bg-slate-400', chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  in_review: { dot: 'bg-sun', chip: 'bg-sun/15 text-amber-700 dark:text-sun' },
  approved: { dot: 'bg-sky', chip: 'bg-sky/15 text-sky-700 dark:text-sky' },
  scheduled: { dot: 'bg-brand-500', chip: 'bg-brand-500/12 text-brand-600 dark:text-brand-300' },
  published: { dot: 'bg-success', chip: 'bg-success/12 text-success' },
}

export const BRAND_COLORS = ['#6C4CF5', '#FF6FAE', '#FFB23F', '#62C5F4', '#A7E66B', '#211C3A'] as const

export const CREDIT_PACKAGES = [10, 30, 50, 100] as const

/**
 * Status rules (spec §10): moving back is always allowed; `scheduled` needs a
 * date; `published` needs publishedAt (set when the user confirms).
 */
export function statusBlocker(c: Pick<Content, 'scheduledDate'>, next: ContentStatus): 'needs_date' | null {
  if (next === 'scheduled' && !c.scheduledDate) return 'needs_date'
  return null
}
