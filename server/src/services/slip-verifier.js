'use strict';

/**
 * Slip verification seam. Today every slip goes to staff review: an admin
 * opens the order in the Strapi admin and sets status to "paid" (credits are
 * then granted automatically) or "rejected" with a reviewNote.
 *
 * Slip2Go: implement `verifyWithSlip2Go` once its API is confirmed, and set
 * SLIP2GO_API_KEY. Expected contract for this function:
 *   in:  { order, file }  (file = uploaded slip, order has amountSatang + payee)
 *   out: { verdict: 'paid' | 'rejected' | 'review', note?, raw? }
 * 'paid' must only be returned when amount, receiver (PromptPay ID/name) and
 * slip uniqueness all match; anything uncertain → 'review'.
 */
async function verifySlip(strapi, { order, file }) {
  if (!process.env.SLIP2GO_API_KEY) return { verdict: 'review' };
  try {
    return await verifyWithSlip2Go(strapi, { order, file });
  } catch (e) {
    strapi.log.warn(`[slip] automatic check failed for ${order.reference}: ${e.message} — falling back to staff review`);
    return { verdict: 'review' };
  }
}

// eslint-disable-next-line no-unused-vars
async function verifyWithSlip2Go(strapi, { order, file }) {
  // Not implemented yet — waiting for the Slip2Go API research.
  return { verdict: 'review' };
}

module.exports = { verifySlip };
