// Activity log rules — mirror of server/src/utils/activity.js (used by the
// in-browser demo backend; the server's copy is what runs with Strapi).
import type { ActivityChange } from '~/types'

export const CONTENT_AUDIT_FIELDS = [
  'title', 'concept', 'pillar', 'objective', 'platform', 'format', 'hook', 'caption', 'cta', 'hashtags',
  'visualBrief', 'videoScript', 'status', 'scheduledDate', 'scheduledTime', 'publishedAt', 'postUrl', 'archivedAt',
] as const
const BRAND_FIELDS = ['name', 'color', 'archivedAt']
const PROFILE_FIELDS = ['industry', 'description', 'products', 'usp', 'audience', 'painPoints', 'tone', 'language', 'platforms',
  'guidelines', 'forbiddenWords', 'competitors', 'pillars', 'ctaPreferences', 'goals']
const SCHEDULE = ['scheduledDate', 'scheduledTime']
const MAX = 300

function short(v: unknown): unknown {
  if (v === undefined || v === '') return null
  if (Array.isArray(v)) return v.map(short)
  if (typeof v === 'string' && v.length > MAX) return `${v.slice(0, MAX)}…`
  return v
}
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export function diffFields(before: object, after: object, fields: readonly string[]): ActivityChange[] {
  const b = before as Record<string, unknown>, a = after as Record<string, unknown>
  return fields.filter((f) => f in a && !same(b[f], a[f])).map((f) => ({ field: f, from: short(b[f]), to: short(a[f]) }))
}

export function diffBrand(before: { profile?: object } & object, after: { profile?: object } & object): ActivityChange[] {
  const out = diffFields(before, after, BRAND_FIELDS)
  if (after.profile) for (const c of diffFields(before.profile ?? {}, after.profile, PROFILE_FIELDS)) out.push({ ...c, field: `profile.${c.field}` })
  return out
}

export function classifyContent(changes: ActivityChange[]): string | null {
  const arch = changes.find((c) => c.field === 'archivedAt')
  if (arch) return arch.to ? 'content.archived' : 'content.restored'
  if (!changes.length) return null
  const fields = changes.map((c) => c.field)
  if (fields.every((f) => f === 'status' || f === 'publishedAt') && fields.includes('status')) return 'content.status_changed'
  if (fields.every((f) => SCHEDULE.includes(f))) {
    const d = changes.find((c) => c.field === 'scheduledDate')
    if (d && !d.to) return 'content.unscheduled'
    if (d && !d.from) return 'content.scheduled'
    return 'content.rescheduled'
  }
  return 'content.updated'
}

export function classifyBrand(changes: ActivityChange[]): string | null {
  const arch = changes.find((c) => c.field === 'archivedAt')
  if (arch) return arch.to ? 'brand.archived' : 'brand.restored'
  return changes.length ? 'brand.updated' : null
}
