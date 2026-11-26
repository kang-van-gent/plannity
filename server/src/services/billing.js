'use strict';

/**
 * Turns a paid PromptPay order into what was bought — credits, one month of a
 * plan, or brand add-on capacity — exactly once per order (unique orderKey /
 * ledger operationKey), however many times the order is saved or re-verified.
 * Never activates anything from a client-side "success" screen.
 */
const P = require('../utils/pricing');
const { grantPurchase, ORDER } = require('./credits');
const { invalidate, planOf, SUB, ADDON } = require('./entitlements');

async function fulfillOrder(strapi, orderDocumentId) {
  const order = await strapi.documents(ORDER).findOne({ documentId: orderDocumentId, populate: { user: { fields: ['id'] } } });
  if (!order || order.status !== 'paid' || !order.user) return false;
  const kind = order.kind || 'credits';
  if (kind === 'credits') return grantPurchase(strapi, orderDocumentId);

  const orderKey = `order:${order.documentId}`;
  const ownerId = order.user.id;
  // Brand renewals extend each brand from where its current cover ends.
  if (kind === 'renewal') invalidate(ownerId);
  const before = kind === 'renewal' ? await planOf(strapi, ownerId) : null;
  const done = await strapi.db.transaction(async () => {
    const uid = kind === 'plan' ? SUB : ADDON;
    const doneKey = kind === 'renewal' ? `${orderKey}:done` : orderKey;
    if (await strapi.documents(kind === 'renewal' ? ADDON : uid).findFirst({ filters: { orderKey: doneKey } })
      || (kind === 'renewal' && await strapi.documents(SUB).findFirst({ filters: { orderKey } }))) return false; // already fulfilled
    const now = new Date().toISOString();
    if (kind === 'renewal') {
      if (order.planKey) {
        const subs = await strapi.documents(SUB).findMany({ filters: { owner: { id: ownerId }, status: 'active' }, fields: ['planKey', 'status', 'periodStart', 'periodEnd'], limit: 500 });
        const period = P.nextPeriod(order.planKey, subs.map((x) => ({ ...x, periodStart: new Date(x.periodStart).toISOString(), periodEnd: new Date(x.periodEnd).toISOString() })), now);
        await strapi.documents(SUB).create({ data: { owner: ownerId, planKey: order.planKey, status: 'active', ...period, providerReference: order.reference, orderKey } });
      }
      const ids = Array.isArray(order.brandIds) ? order.brandIds : [];
      for (const brandId of ids) {
        const cover = before.coverage.brands.find((b) => b.id === brandId);
        if (!cover || cover.kind === 'included') continue; // not an owned extra brand (anymore)
        const start = P.renewalStart(cover.paidUntil, now);
        await strapi.documents(ADDON).create({ data: { owner: ownerId, type: 'brand', brand: brandId, quantity: 1, status: 'active', periodStart: start, periodEnd: P.addMonths(start, 1), providerReference: order.reference, orderKey: `${orderKey}:${brandId}` } });
      }
      // Marker row so a replayed order is recognised even when it only renewed brands.
      if (!order.planKey || ids.length) await strapi.documents(ADDON).create({ data: { owner: ownerId, type: 'brand', quantity: 1, status: 'cancelled', periodStart: now, periodEnd: now, providerReference: order.reference, orderKey: doneKey } });
      strapi.log.info(`[billing] renewal for user ${ownerId}: plan ${order.planKey || '—'}, ${ids.length} brand(s) (${order.reference})`);
    } else if (kind === 'plan') {
      const subs = await strapi.documents(SUB).findMany({ filters: { owner: { id: ownerId }, status: 'active' }, fields: ['planKey', 'status', 'periodStart', 'periodEnd'], limit: 500 });
      const period = P.nextPeriod(order.planKey, subs.map((s) => ({ ...s, periodStart: new Date(s.periodStart).toISOString(), periodEnd: new Date(s.periodEnd).toISOString() })), now);
      await strapi.documents(SUB).create({ data: { owner: ownerId, planKey: order.planKey, status: 'active', ...period, providerReference: order.reference, orderKey } });
      strapi.log.info(`[billing] ${order.planKey} for user ${ownerId}: ${period.periodStart} → ${period.periodEnd} (${order.reference})`);
    } else if (kind === 'brand_addon') {
      // Unused slots: given to locked brands first, otherwise waiting for a new brand.
      await strapi.documents(ADDON).create({ data: { owner: ownerId, type: 'brand', quantity: order.quantity, status: 'active', periodStart: now, periodEnd: P.addMonths(now, 1), providerReference: order.reference, orderKey } });
      strapi.log.info(`[billing] +${order.quantity} brand add-on(s) for user ${ownerId} (${order.reference})`);
    } else {
      return false;
    }
    if (!order.paidAt) await strapi.documents(ORDER).update({ documentId: order.documentId, data: { paidAt: now } });
    return true;
  });
  invalidate(ownerId);
  return done;
}

module.exports = { fulfillOrder };
