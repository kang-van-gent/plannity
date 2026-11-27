// Mirrors server/src/utils/pricing.js (pricing.md v0.2) for display and the demo
// backend. The server copy is authoritative — the app shows what the API returns
// from /billing/me whenever it can. Keep the numbers in sync.
import type { FeatureFlags, PlanKey, PricingConfig } from '~/types'

export const PLAN_KEYS: PlanKey[] = ['solo', 'team', 'studio']
export const PAID_PLANS = ['team', 'studio'] as const

export const DEFAULT_PRICING: PricingConfig = {
  currency: 'THB',
  plans: {
    solo: { key: 'solo', monthlySatang: 0, includedBrands: 2, maxMembers: 1, collaboration: false },
    team: { key: 'team', monthlySatang: 34900, includedBrands: 2, maxMembers: 5, collaboration: true },
    studio: { key: 'studio', monthlySatang: 99900, includedBrands: null, maxMembers: 10, collaboration: true },
  },
  additionalBrandMonthlySatang: 9900,
  aiContentCreditSatang: 1000,
  aiBriefCreditSatang: 1000,
}

const rank = (k: PlanKey) => PLAN_KEYS.indexOf(k)

export function featureFlags(planKey: PlanKey): FeatureFlags {
  const collab = planKey === 'team' || planKey === 'studio'
  return { collaboration: collab, memberPositions: collab, taskAssignment: collab, taskReview: collab, postPreview: true, creativeBrief: true, socialConnections: collab }
}

interface Period { planKey: PlanKey; status: 'active' | 'cancelled'; periodStart: string; periodEnd: string }
interface AddonPeriod { quantity: number; status: 'active' | 'cancelled'; periodStart: string; periodEnd: string }
const covers = (r: { status: string; periodStart: string; periodEnd: string }, now: string) => r.status === 'active' && r.periodStart <= now && now < r.periodEnd

export function activePlan(subs: Period[], now: string): { planKey: PlanKey; periodEnd: string | null } {
  let best: { planKey: PlanKey; periodEnd: string | null } = { planKey: 'solo', periodEnd: null }
  for (const s of subs) {
    if (!covers(s, now) || s.planKey === 'solo') continue
    if (rank(s.planKey) > rank(best.planKey) || (s.planKey === best.planKey && s.periodEnd > (best.periodEnd ?? ''))) best = { planKey: s.planKey, periodEnd: s.periodEnd }
  }
  if (best.periodEnd) {
    let end = best.periodEnd
    for (let moved = true; moved;) {
      moved = false
      for (const s of subs) if (s.status === 'active' && s.planKey === best.planKey && s.periodStart <= end && s.periodEnd > end) { end = s.periodEnd; moved = true }
    }
    best.periodEnd = end
  }
  return best
}

export const activeAddonUnits = (addons: AddonPeriod[], now: string) => addons.filter((a) => covers(a, now)).reduce((n, a) => n + a.quantity, 0)

export function brandCapacity(planKey: PlanKey, addonUnits: number, cfg = DEFAULT_PRICING): number | null {
  const inc = cfg.plans[planKey].includedBrands
  return inc === null ? null : inc + addonUnits
}

export function seatCount(members: { userId: string; email: string | null }[], pendingEmails: string[]): number {
  const ids = new Set(members.map((m) => m.userId))
  const emails = new Set(members.map((m) => (m.email ?? '').toLowerCase()).filter(Boolean))
  const extra = new Set(pendingEmails.map((e) => e.toLowerCase()).filter((e) => !emails.has(e)))
  return ids.size + extra.size
}

export function addBillingMonths(iso: string, n: number): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + n)
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString()
}

/** Same plan → renews from its end; higher → starts now; lower while higher runs → starts when it ends. */
export function nextPeriod(planKey: PlanKey, subs: Period[], now: string) {
  const current = activePlan(subs, now)
  let start = now
  if (current.planKey === planKey && current.periodEnd) start = current.periodEnd
  else if (current.periodEnd && rank(current.planKey) > rank(planKey)) start = current.periodEnd
  for (const s of subs) if (s.status === 'active' && s.planKey === planKey && s.periodEnd > start && s.periodStart <= start) start = s.periodEnd
  return { periodStart: start, periodEnd: addBillingMonths(start, 1) }
}

// ---- Per-brand cover (mirrors server/src/utils/pricing.js) ---------------------
// The 2 oldest owned brands are free forever; others need Studio (while it runs)
// or their own monthly slot. Uncovered brands are locked (read-only) until renewed.
export const FREE_BRANDS = 2
export interface SlotRow { id: string; brandId: string | null; quantity: number; status: 'active' | 'cancelled'; periodStart: string; periodEnd: string }
const slotCovers = (r: SlotRow, now: string) => r.status === 'active' && r.periodStart <= now && now < r.periodEnd

export function coveredUntil(rows: SlotRow[], now: string): string | null {
  let end: string | null = null
  for (const r of rows) if (slotCovers(r, now) && (!end || r.periodEnd > end)) end = r.periodEnd
  if (!end) return null
  for (let moved = true; moved;) {
    moved = false
    for (const r of rows) if (r.status === 'active' && r.periodStart <= end && r.periodEnd > end) { end = r.periodEnd; moved = true }
  }
  return end
}

export function brandCoverage(brands: { id: string; createdAt: string }[], planKey: PlanKey, planEnd: string | null, slots: SlotRow[], now: string) {
  const studio = planKey === 'studio'
  const list = [...brands].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((b, i) => {
    if (i < FREE_BRANDS) return { id: b.id, kind: 'included' as const, until: null, paidUntil: null, locked: false }
    const paidUntil = coveredUntil(slots.filter((s) => s.brandId === b.id), now)
    if (studio) return { id: b.id, kind: 'plan' as const, until: paidUntil && planEnd && paidUntil > planEnd ? paidUntil : planEnd, paidUntil, locked: false }
    if (paidUntil) return { id: b.id, kind: 'slot' as const, until: paidUntil, paidUntil, locked: false }
    return { id: b.id, kind: 'none' as const, until: null, paidUntil: null, locked: true }
  })
  const freeSlots = slots.filter((s) => !s.brandId && slotCovers(s, now)).reduce((n, s) => n + s.quantity, 0)
  return { brands: list, freeSlots }
}

export function slotAssignments(cov: ReturnType<typeof brandCoverage>, slots: SlotRow[], now: string) {
  const free = slots.filter((s) => !s.brandId && slotCovers(s, now)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)).flatMap((s) => Array<string>(s.quantity).fill(s.id))
  return cov.brands.filter((b) => b.locked).slice(0, free.length).map((b, i) => ({ slotId: free[i]!, brandId: b.id }))
}

export const brandCreateErrorFor = (cov: ReturnType<typeof brandCoverage>, planKey: PlanKey) =>
  planKey === 'studio' || cov.brands.length < FREE_BRANDS || cov.freeSlots > 0 ? null : 'brand_limit'

export const renewalStart = (until: string | null, now: string) => (until && until > now ? until : now)

/** Expiring soon = cover ends within this many days. */
export const RENEW_SOON_DAYS = 7
