'use strict';

/**
 * Credit wallet + append-only ledger. Purchases are granted exactly once per
 * order (ledger operationKey `purchase:<orderId>`), so re-saving a paid order
 * in the admin, or a verifier retrying, can never double-credit.
 */
const WALLET = 'api::credit-wallet.credit-wallet';
const LEDGER = 'api::credit-ledger.credit-ledger';
const ORDER = 'api::payment-order.payment-order';

async function walletFor(strapi, userId) {
  const w = await strapi.documents(WALLET).findFirst({ filters: { user: { id: userId } } });
  return w ?? strapi.documents(WALLET).create({ data: { user: userId, available: 0, reserved: 0, version: 1 } });
}

async function grantPurchase(strapi, orderDocumentId) {
  return strapi.db.transaction(async () => {
    const order = await strapi.documents(ORDER).findOne({ documentId: orderDocumentId, populate: { user: { fields: ['id'] } } });
    if (!order || order.status !== 'paid' || !order.user) return false;
    const opKey = `purchase:${order.documentId}`;
    if (await strapi.documents(LEDGER).findFirst({ filters: { operationKey: opKey } })) return false; // already granted
    const wallet = await walletFor(strapi, order.user.id);
    const available = Number(wallet.available) + Number(order.credits);
    await strapi.documents(WALLET).update({ documentId: wallet.documentId, data: { available, version: Number(wallet.version || 1) + 1 } });
    await strapi.documents(LEDGER).create({
      data: { wallet: wallet.documentId, operationKey: opKey, type: 'purchase', deltaAvailable: Number(order.credits), deltaReserved: 0, availableAfter: available, refType: 'payment', refId: order.documentId },
    });
    if (!order.paidAt) await strapi.documents(ORDER).update({ documentId: order.documentId, data: { paidAt: new Date().toISOString() } });
    strapi.log.info(`[credits] +${order.credits} credits for user ${order.user.id} (order ${order.reference || order.documentId})`);
    return true;
  });
}

module.exports = { walletFor, grantPurchase, WALLET, LEDGER, ORDER };
