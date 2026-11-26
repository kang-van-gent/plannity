'use strict';

/**
 * Account-level entitlements (pricing.md §6, §9). Authorization (brand role)
 * and commercial entitlement are separate checks; protected mutations need both.
 *
 * The paying account of a brand is `brand.owner` (its creator). Plans and
 * brand slots belong to that account; seats are one pool across all of its
 * brands. Never trust plan labels or seat counts sent by the client.
 *
 * Brand cover: the 2 oldest owned brands are free forever; every other brand
 * is covered by Studio (while it runs) or by its own monthly brand slot.
 * Uncovered brands are locked — read-only for everyone — until renewed.
 */
const P = require('../utils/pricing');

const SUB = 'api::subscription.subscription';
const ADDON = 'api::subscription-add-on.subscription-add-on';
const BRAND = 'api::brand.brand';
const MEMBERSHIP = 'api::brand-membership.brand-membership';
const INVITATION = 'api::brand-invitation.brand-invitation';

// Brand → owner and owner → plan are read on most requests; keep them for a moment.
const TTL = 3000;
const cache = new Map();
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = fn();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}
/** Call after anything that changes plans, slots, brands or seats. */
function invalidate(ownerId) {
  if (ownerId === undefined) cache.clear();
  else for (const k of cache.keys()) if (k.endsWith(`:${ownerId}`)) cache.delete(k);
}

const iso = (v) => (v ? new Date(v).toISOString() : v);

async function readAccount(strapi, ownerId) {
  const [subs, slotRows, brandRows] = await Promise.all([
    strapi.documents(SUB).findMany({ filters: { owner: { id: ownerId } }, fields: ['planKey', 'status', 'periodStart', 'periodEnd'], limit: 1000 }),
    strapi.documents(ADDON).findMany({ filters: { owner: { id: ownerId }, status: 'active' }, fields: ['quantity', 'status', 'periodStart', 'periodEnd'], populate: { brand: { fields: ['documentId'] } }, limit: 5000 }),
    strapi.documents(BRAND).findMany({ filters: { owner: { id: ownerId } }, fields: ['documentId', 'name', 'color', 'archivedAt', 'createdAt'], limit: 10000 }),
  ]);
  const subscriptions = subs.map((s) => ({ ...s, periodStart: iso(s.periodStart), periodEnd: iso(s.periodEnd) }));
  const slots = slotRows.map((r) => ({ id: r.documentId, brandId: r.brand?.documentId ?? null, quantity: r.quantity, status: r.status, periodStart: iso(r.periodStart), periodEnd: iso(r.periodEnd) }));
  const brands = brandRows.map((b) => ({ id: b.documentId, name: b.name, color: b.color, archivedAt: b.archivedAt, createdAt: iso(b.createdAt) }));
  return { subscriptions, slots, brands };
}

/** Gives unused paid slots to locked brands (oldest brand first). Idempotent. */
async function assignFreeSlots(strapi, ownerId, acc, planKey, planEnd, now) {
  const cov = P.brandCoverage({ brands: acc.brands, planKey, planEnd, slots: acc.slots, now });
  const moves = P.slotAssignments(cov, acc.slots, now);
  for (const { slotId, brandId } of moves) {
    const row = acc.slots.find((s) => s.id === slotId);
    if (!row) continue;
    if (Number(row.quantity) > 1) {
      // Split one unit off a multi-slot purchase.
      await strapi.documents(ADDON).update({ documentId: slotId, data: { quantity: Number(row.quantity) - 1 } });
      row.quantity = Number(row.quantity) - 1;
      const created = await strapi.documents(ADDON).create({ data: { owner: ownerId, type: 'brand', brand: brandId, quantity: 1, status: 'active', periodStart: row.periodStart, periodEnd: row.periodEnd } });
      acc.slots.push({ id: created.documentId, brandId, quantity: 1, status: 'active', periodStart: row.periodStart, periodEnd: row.periodEnd });
    } else {
      await strapi.documents(ADDON).update({ documentId: slotId, data: { brand: brandId } });
      row.brandId = brandId;
    }
  }
  return moves.length;
}

async function planOf(strapi, ownerId) {
  return cached(`plan:${ownerId}`, async () => {
    const now = new Date().toISOString();
    const acc = await readAccount(strapi, ownerId);
    const active = P.activePlan(acc.subscriptions, now);
    if (active.planKey !== 'studio') await assignFreeSlots(strapi, ownerId, acc, active.planKey, active.periodEnd, now);
    const coverage = P.brandCoverage({ brands: acc.brands, planKey: active.planKey, planEnd: active.periodEnd, slots: acc.slots, now });
    // Last paid plan (to offer "renew" after it lapsed).
    const last = [...acc.subscriptions].filter((s) => s.status === 'active')
      .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)) || P.PLAN_KEYS.indexOf(b.planKey) - P.PLAN_KEYS.indexOf(a.planKey))[0];
    return {
      planKey: active.planKey, periodEnd: active.periodEnd, lastPlanKey: last?.planKey ?? null, lastPlanEnd: last?.periodEnd ?? null,
      subscriptions: acc.subscriptions, slots: acc.slots, brands: acc.brands, coverage,
      addonUnits: coverage.brands.filter((b) => b.kind === 'slot').length + coverage.freeSlots,
    };
  });
}

async function ownerOfBrand(strapi, brandDocumentId) {
  return cached(`owner:${brandDocumentId}`, async () => {
    const b = await strapi.documents(BRAND).findOne({ documentId: brandDocumentId, fields: ['documentId'], populate: { owner: { fields: ['id'] } } });
    return b?.owner?.id ?? null;
  });
}

/** What the paying account's plan allows in this brand, and whether the brand is locked. */
async function brandFeatures(strapi, brandDocumentId) {
  const ownerId = await ownerOfBrand(strapi, brandDocumentId);
  if (!ownerId) return { ownerId: null, planKey: 'solo', features: P.featureFlags('solo'), locked: false, cover: null };
  const plan = await planOf(strapi, ownerId);
  const cover = plan.coverage.brands.find((b) => b.id === brandDocumentId) ?? null;
  return { ownerId, planKey: plan.planKey, features: P.featureFlags(plan.planKey), locked: !!cover?.locked, cover };
}

/** People counted against the owner's seat pool. */
async function seatUsage(strapi, ownerId) {
  const brands = await strapi.documents(BRAND).findMany({ filters: { owner: { id: ownerId } }, fields: ['documentId'], limit: 10000 });
  const ids = brands.map((b) => b.documentId);
  if (!ids.length) return { members: [{ userId: ownerId, email: null }], pendingEmails: [] };
  const [members, invites] = await Promise.all([
    strapi.documents(MEMBERSHIP).findMany({ filters: { brand: { documentId: { $in: ids } }, status: 'active' }, fields: ['role'], populate: { user: { fields: ['id', 'email'] } }, limit: 10000 }),
    strapi.documents(INVITATION).findMany({ filters: { brand: { documentId: { $in: ids } }, status: 'pending', expiresAt: { $gt: new Date().toISOString() } }, fields: ['email'], limit: 10000 }),
  ]);
  const list = members.filter((m) => m.user).map((m) => ({ userId: m.user.id, email: m.user.email }));
  if (!list.some((m) => m.userId === ownerId)) list.push({ userId: ownerId, email: null }); // the owner always holds a seat
  return { members: list, pendingEmails: invites.map((i) => i.email) };
}

async function ownedBrandCount(strapi, ownerId) {
  return strapi.documents(BRAND).count({ filters: { owner: { id: ownerId } } });
}

/** Everything the plan page shows for the signed-in account. */
async function entitlementsFor(strapi, ownerId) {
  const cfg = P.pricing();
  const plan = await planOf(strapi, ownerId);
  const usage = await seatUsage(strapi, ownerId);
  const p = cfg.plans[plan.planKey];
  const now = new Date().toISOString();
  return {
    planKey: plan.planKey,
    periodEnd: plan.periodEnd,
    lastPlanKey: plan.lastPlanKey,
    lastPlanEnd: plan.lastPlanEnd,
    brandAddons: plan.planKey === 'studio' ? 0 : plan.addonUnits,
    freeSlots: plan.coverage.freeSlots,
    // 2 free brands + every extra brand with paid cover + unused paid slots.
    brandLimit: plan.planKey === 'studio' ? null : P.FREE_BRANDS + plan.coverage.brands.filter((b) => b.kind === 'slot').length + plan.coverage.freeSlots,
    brandsOwned: plan.brands.length,
    brands: plan.coverage.brands.map((c) => {
      const b = plan.brands.find((x) => x.id === c.id);
      return { ...c, name: b?.name ?? '—', color: b?.color ?? '#6C4CF5', archivedAt: b?.archivedAt ?? null, createdAt: b?.createdAt ?? null };
    }),
    seatLimit: p.maxMembers,
    seatsUsed: P.seatCount(usage),
    features: P.featureFlags(plan.planKey),
    upcoming: plan.subscriptions.filter((s) => s.status === 'active' && s.periodStart > now).map((s) => ({ planKey: s.planKey, periodStart: s.periodStart, periodEnd: s.periodEnd })),
  };
}

/** Serializes seat/brand-count changes per paying account (PostgreSQL advisory lock). */
async function lockAccount(strapi, trx, ownerId, scope) {
  if (strapi.db.config.connection.client === 'postgres' && trx) {
    let h = 0x811c9dc5;
    for (const ch of `${scope}:${ownerId}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
    await trx.raw('select pg_advisory_xact_lock(?)', [h | 0]);
  }
}

/** Why `ownerId` can't create another brand right now (null = allowed). */
async function brandCreateError(strapi, ownerId) {
  const plan = await planOf(strapi, ownerId);
  return P.brandCreateErrorFor(plan.coverage, plan.planKey);
}

module.exports = { planOf, ownerOfBrand, brandFeatures, seatUsage, ownedBrandCount, entitlementsFor, lockAccount, brandCreateError, assignFreeSlots, invalidate, SUB, ADDON };
