'use strict';

/**
 * Commercial rules from pricing.md v0.2 — the authoritative copy.
 * app/app/utils/pricing.ts mirrors the numbers for display only; keep them in sync.
 *
 * Money is integer satang. Prices can be overridden per environment
 * (PLAN_TEAM_PRICE_SATANG, …) without touching code.
 *
 * Billing boundary: plans and brand add-ons belong to the paying account (the
 * user who created/owns the brands — brand.owner), never to a brand. Brand
 * membership stays brand-scoped.
 */

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

function pricing(env = process.env) {
  return {
    currency: 'THB',
    plans: {
      solo: { key: 'solo', monthlySatang: 0, includedBrands: 2, maxMembers: 1, collaboration: false },
      team: { key: 'team', monthlySatang: num(env.PLAN_TEAM_PRICE_SATANG, 34900), includedBrands: 2, maxMembers: 5, collaboration: true },
      // includedBrands null = commercially unlimited (not zero).
      studio: { key: 'studio', monthlySatang: num(env.PLAN_STUDIO_PRICE_SATANG, 99900), includedBrands: null, maxMembers: 10, collaboration: true },
    },
    additionalBrandMonthlySatang: num(env.BRAND_ADDON_PRICE_SATANG, 9900),
    aiContentCreditSatang: num(env.CREDIT_PRICE_SATANG, 1000),
    aiBriefCreditSatang: num(env.CREDIT_PRICE_SATANG, 1000),
  };
}

const PLAN_KEYS = ['solo', 'team', 'studio'];
const PAID_PLANS = ['team', 'studio'];
const rank = (k) => PLAN_KEYS.indexOf(k);

/** Centralised entitlement flags (pricing.md §6). Post preview + manual briefs are on every plan. */
function featureFlags(planKey) {
  const collab = planKey === 'team' || planKey === 'studio';
  return { collaboration: collab, memberPositions: collab, taskAssignment: collab, taskReview: collab, postPreview: true, creativeBrief: true, socialConnections: collab };
}

const isActiveAt = (row, now) => row && row.status === 'active' && row.periodStart <= now && now < row.periodEnd;

/** Highest plan with a period covering `now` (Solo when none). */
function activePlan(subscriptions, now = new Date().toISOString()) {
  let best = { planKey: 'solo', periodEnd: null };
  for (const s of subscriptions || []) {
    if (!isActiveAt(s, now) || !PAID_PLANS.includes(s.planKey)) continue;
    if (rank(s.planKey) > rank(best.planKey) || (s.planKey === best.planKey && s.periodEnd > best.periodEnd)) best = { planKey: s.planKey, periodEnd: s.periodEnd };
  }
  // A paid plan's coverage continues through back-to-back periods of the same plan.
  if (best.periodEnd) {
    let end = best.periodEnd;
    for (let moved = true; moved;) {
      moved = false;
      for (const s of subscriptions) {
        if (s.status === 'active' && s.planKey === best.planKey && s.periodStart <= end && s.periodEnd > end) { end = s.periodEnd; moved = true; }
      }
    }
    best.periodEnd = end;
  }
  return best;
}

/** Brand add-on units active at `now`. */
function activeAddonUnits(addons, now = new Date().toISOString()) {
  return (addons || []).filter((a) => a.status === 'active' && a.periodStart <= now && now < a.periodEnd).reduce((n, a) => n + Number(a.quantity || 0), 0);
}

/** Owned-brand capacity: null = unlimited (Studio). Solo/Team = 2 + active add-on units. */
function brandCapacity(planKey, addonUnits, cfg = pricing()) {
  const plan = cfg.plans[planKey] || cfg.plans.solo;
  return plan.includedBrands === null ? null : plan.includedBrands + Number(addonUnits || 0);
}

/** Why the owner may not create another brand (null = allowed). Archived brands still count. */
function brandLimitError(planKey, addonUnits, ownedCount, cfg = pricing()) {
  const cap = brandCapacity(planKey, addonUnits, cfg);
  return cap !== null && ownedCount >= cap ? 'brand_limit' : null;
}

/**
 * Seats = unique people across every brand the account owns, owner included.
 * A collaborator in several of the owner's brands counts once; a pending
 * invitation reserves a seat unless that person is already counted.
 */
function seatCount({ members = [], pendingEmails = [] }) {
  const ids = new Set();
  const emails = new Set();
  for (const m of members) {
    ids.add(String(m.userId));
    if (m.email) emails.add(String(m.email).toLowerCase());
  }
  let n = ids.size;
  const seen = new Set();
  for (const e of pendingEmails) {
    const k = String(e).toLowerCase();
    if (!emails.has(k) && !seen.has(k)) { seen.add(k); n++; }
  }
  return n;
}

/**
 * Why the owner may not add `email` (null = allowed). Someone already counted
 * (a member of another owned brand, or already invited elsewhere) uses no new seat.
 */
function seatError(planKey, usage, email, cfg = pricing()) {
  const plan = cfg.plans[planKey] || cfg.plans.solo;
  if (!plan.collaboration) return 'plan_required';
  const k = String(email || '').toLowerCase();
  const alreadyCounted = usage.members.some((m) => String(m.email || '').toLowerCase() === k) || usage.pendingEmails.some((e) => String(e).toLowerCase() === k);
  if (alreadyCounted) return null;
  return seatCount(usage) + 1 > plan.maxMembers ? 'seat_limit' : null;
}

function addMonths(iso, n) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0); // 31 Jan + 1 month → 28/29 Feb
  return d.toISOString();
}

/**
 * When a newly paid month of `planKey` runs. MVP policy (no proration):
 *  - same plan as the current one → extends from its end (renewal)
 *  - higher plan → starts now (upgrade takes effect immediately)
 *  - lower plan while a higher one runs → starts when that ends (downgrade at period end)
 */
function nextPeriod(planKey, subscriptions, now = new Date().toISOString()) {
  const current = activePlan(subscriptions, now);
  let start = now;
  if (current.planKey === planKey && current.periodEnd) start = current.periodEnd;
  else if (current.periodEnd && rank(current.planKey) > rank(planKey)) start = current.periodEnd;
  // Queued months of the same plan (paid in advance) push the start further.
  for (const s of subscriptions || []) if (s.status === 'active' && s.planKey === planKey && s.periodEnd > start && s.periodStart <= start) start = s.periodEnd;
  return { periodStart: start, periodEnd: addMonths(start, 1) };
}

// ---- Per-brand coverage --------------------------------------------------------
// Every account's 2 oldest brands are free forever. Each brand after that needs
// cover: the Studio plan (while it runs) or its own monthly brand slot, which has
// an expiry date and is renewed from that date. Uncovered brands are locked
// (read-only) — never deleted — until renewed.

const FREE_BRANDS = 2;
const covering = (r, now) => r && r.status === 'active' && r.periodStart <= now && now < r.periodEnd;

/** End of continuous cover from `now` (back-to-back renewals chained), or null when nothing covers now. */
function coveredUntil(rows, now) {
  let end = null;
  for (const r of rows || []) if (covering(r, now) && (!end || r.periodEnd > end)) end = r.periodEnd;
  if (!end) return null;
  for (let moved = true; moved;) {
    moved = false;
    for (const r of rows) if (r.status === 'active' && r.periodStart <= end && r.periodEnd > end) { end = r.periodEnd; moved = true; }
  }
  return end;
}

const byAge = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id));

/**
 * Cover of each owned brand.
 * kind: included (free) · plan (Studio) · slot (own paid month) · none (locked)
 * `paidUntil` is the brand's own slot cover, which keeps counting after Studio ends.
 */
function brandCoverage({ brands, planKey, planEnd, slots, now = new Date().toISOString() }) {
  const studio = planKey === 'studio';
  const list = [...(brands || [])].sort(byAge).map((b, i) => {
    if (i < FREE_BRANDS) return { id: b.id, kind: 'included', until: null, paidUntil: null, locked: false };
    const paidUntil = coveredUntil((slots || []).filter((s) => s.brandId === b.id), now);
    if (studio) return { id: b.id, kind: 'plan', until: paidUntil && paidUntil > planEnd ? paidUntil : planEnd, paidUntil, locked: false };
    if (paidUntil) return { id: b.id, kind: 'slot', until: paidUntil, paidUntil, locked: false };
    return { id: b.id, kind: 'none', until: null, paidUntil: null, locked: true };
  });
  const freeSlots = (slots || []).filter((s) => !s.brandId && covering(s, now)).reduce((n, s) => n + Number(s.quantity || 1), 0);
  return { brands: list, freeSlots };
}

/** Unused paid slots go to locked brands, oldest brand first, longest-lasting slot first. */
function slotAssignments(coverage, slots, now = new Date().toISOString()) {
  const free = (slots || []).filter((s) => !s.brandId && covering(s, now)).sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)))
    .flatMap((s) => Array(Number(s.quantity || 1)).fill(s.id));
  return coverage.brands.filter((b) => b.locked).slice(0, free.length).map((b, i) => ({ slotId: free[i], brandId: b.id }));
}

/** Why another brand can't be created now (null = allowed): Studio, under 2 brands, or a free slot. */
function brandCreateErrorFor(coverage, planKey) {
  if (planKey === 'studio') return null;
  if (coverage.brands.length < FREE_BRANDS) return null;
  return coverage.freeSlots > 0 ? null : 'brand_limit';
}

/** A renewed month starts where the current cover ends (or now, if it already lapsed). */
const renewalStart = (until, now) => (until && until > now ? until : now);

/** Order amount from server config — never from the client. */
function orderAmount(input, cfg = pricing()) {
  if (input.kind === 'plan') return PAID_PLANS.includes(input.planKey) ? cfg.plans[input.planKey].monthlySatang : null;
  if (input.kind === 'brand_addon') return Number.isInteger(input.quantity) && input.quantity >= 1 && input.quantity <= 20 ? cfg.additionalBrandMonthlySatang * input.quantity : null;
  if (input.kind === 'renewal') {
    // One payment for everything: an optional plan month + one month for each listed brand.
    const ids = Array.isArray(input.brandIds) ? input.brandIds : [];
    if (input.planKey && !PAID_PLANS.includes(input.planKey)) return null;
    if (input.planKey === 'studio' && ids.length) return null; // Studio already covers every brand
    if (!input.planKey && !ids.length) return null;
    if (ids.length > 200 || new Set(ids).size !== ids.length) return null;
    return (input.planKey ? cfg.plans[input.planKey].monthlySatang : 0) + ids.length * cfg.additionalBrandMonthlySatang;
  }
  if (input.kind === 'credits') return Number.isInteger(input.credits) && input.credits >= 1 && input.credits <= 500 ? cfg.aiContentCreditSatang * input.credits : null;
  return null;
}

module.exports = {
  pricing, PLAN_KEYS, PAID_PLANS, featureFlags, activePlan, activeAddonUnits, brandCapacity, brandLimitError,
  seatCount, seatError, addMonths, nextPeriod, orderAmount,
  FREE_BRANDS, coveredUntil, brandCoverage, slotAssignments, brandCreateErrorFor, renewalStart,
};
