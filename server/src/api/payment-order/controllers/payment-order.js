'use strict';

// Core routes stay ungranted (internal collection). The app uses the custom
// /payments/orders endpoints below, always scoped to the signed-in user.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { factories } = require('@strapi/strapi');
const { fail } = require('../../../utils/brand-access');
const { sniffImageType } = require('../../../utils/image-type');
const createPayments = require('../../../services/payments');
const P = require('../../../utils/pricing');
const { planOf } = require('../../../services/entitlements');

const UID = 'api::payment-order.payment-order';
/** Payment window (minutes). Short on purpose: only transfers made inside it are approved automatically. */
const ttlMs = () => (process.env.PAYMENT_ORDER_TTL_MINUTES
  ? Number(process.env.PAYMENT_ORDER_TTL_MINUTES) * 60_000
  : Number(process.env.PAYMENT_ORDER_TTL_HOURS || 0.5) * 3600_000);
const slipMaxBytes = () => Number(process.env.PAYMENT_SLIP_MAX_BYTES || 0) || Number(process.env.SLIP_MAX_MB || 5) * 1024 * 1024;
const payee = () => ({
  promptpayId: process.env.PROMPTPAY_CODE || process.env.PROMPTPAY_ID || '0968870831',
  name: process.env.PROMPTPAY_NAME || 'Supachai Van Gent',
});
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I

function view(o) {
  return {
    id: o.documentId, kind: o.kind || 'credits', credits: o.credits ?? 0, planKey: o.planKey ?? null, quantity: o.quantity ?? null,
    brandIds: Array.isArray(o.brandIds) ? o.brandIds : [], amountSatang: Number(o.amountSatang), currency: o.currency || 'THB', status: o.status,
    provider: o.provider, providerRef: o.providerRef, reference: o.reference, payee: o.provider === 'promptpay' ? payee() : null,
    slipUploadedAt: o.slipUploadedAt ?? null, reviewNote: o.reviewNote ?? null, expiresAt: o.expiresAt ?? null,
    createdAt: o.createdAt, paidAt: o.paidAt ?? null,
    // Last slip-check result for the customer (never the raw provider response), and whether delivery finished.
    resultCode: o.resultCode ?? null, fulfilled: !!o.fulfilledAt,
  };
}

module.exports = factories.createCoreController(UID, ({ strapi }) => {
  const payments = createPayments({ strapi });
  const docs = () => strapi.documents(UID);

  async function expireStale(userId) {
    const stale = await docs().findMany({ filters: { user: { id: userId }, status: 'pending', expiresAt: { $lt: new Date().toISOString() } }, fields: ['documentId'], limit: 200 });
    for (const o of stale) await docs().update({ documentId: o.documentId, data: { status: 'expired' } });
  }
  async function mine(ctx) {
    const o = await docs().findFirst({ filters: { documentId: ctx.params.id, user: { id: ctx.state.user.id } } });
    if (!o) fail(ctx, 404, 'NOT_FOUND', 'Order not found');
    return o;
  }

  return {
    async myOrders(ctx) {
      if (!ctx.state.user) return ctx.unauthorized();
      await expireStale(ctx.state.user.id);
      const rows = await docs().findMany({ filters: { user: { id: ctx.state.user.id } }, sort: 'createdAt:desc', limit: 50 });
      ctx.body = { data: rows.map(view) };
    },

    async findMine(ctx) {
      if (!ctx.state.user) return ctx.unauthorized();
      await expireStale(ctx.state.user.id);
      const o = await mine(ctx);
      if (o) ctx.body = { data: view(o) };
    },

    async createMine(ctx) {
      if (!ctx.state.user) return ctx.unauthorized();
      // What is being bought: AI credits, one month of a plan, or brand add-ons. Price comes from server config only.
      const body = ctx.request.body?.data ?? ctx.request.body ?? {};
      const kind = body.kind || 'credits';
      const input = { kind, credits: Number(body.credits), planKey: body.planKey || null, quantity: Number(body.quantity), brandIds: body.brandIds };
      if (kind === 'renewal') {
        // Only the caller's own extra brands (not the 2 free ones) can be renewed.
        const plan = await planOf(strapi, ctx.state.user.id);
        const ids = Array.isArray(input.brandIds) ? input.brandIds : [];
        const extra = new Set(plan.coverage.brands.filter((b) => b.kind !== 'included').map((b) => b.id));
        if (ids.some((id) => !extra.has(id))) return fail(ctx, 400, 'INVALID_INPUT', 'Only your own extra brands can be renewed.', { brandIds: 'invalid' });
      }
      const amount = P.orderAmount(input);
      if (amount === null) {
        const field = kind === 'plan' ? 'planKey' : kind === 'brand_addon' ? 'quantity' : kind === 'renewal' ? 'brandIds' : 'credits';
        return fail(ctx, 400, 'INVALID_INPUT', 'Invalid order', { [field]: kind === 'credits' ? 'invalid_credits' : 'invalid' });
      }
      if (kind === 'brand_addon' && (await planOf(strapi, ctx.state.user.id)).planKey === 'studio') {
        return fail(ctx, 409, 'CONFLICT', 'Studio already includes unlimited brands.');
      }
      const code = Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % 32]).join('');
      const o = await docs().create({
        data: {
          user: ctx.state.user.id, kind, credits: kind === 'credits' ? input.credits : 0, planKey: kind === 'plan' || kind === 'renewal' ? input.planKey : null,
          quantity: kind === 'brand_addon' ? input.quantity : kind === 'renewal' && input.brandIds.length ? input.brandIds.length : null, brandIds: kind === 'renewal' ? input.brandIds : null, amountSatang: amount, currency: 'THB', status: 'pending', provider: 'promptpay',
          providerRef: `pp_${code.toLowerCase()}`, reference: `PLN-${code}`, expiresAt: new Date(Date.now() + ttlMs()).toISOString(), receiverSnapshot: createPayments.receiverSnapshot(),
        },
      });
      ctx.body = { data: view(o) };
    },

    /** Multipart field "slip". pending/rejected → awaiting_review; then staff (or Slip2Go) decides. */
    /**
     * Multipart field "slip" (+ Idempotency-Key header). Checked by Slip2Go when
     * configured: paid / rejected (upload a correct slip) / awaiting_review (staff).
     * Expired orders still accept a slip — a transfer made inside the window is
     * honoured; anything later goes to staff rather than being refused outright.
     */
    async uploadSlip(ctx) {
      if (!ctx.state.user) return ctx.unauthorized();
      await expireStale(ctx.state.user.id);
      const o = await mine(ctx);
      if (!o) return;
      if (o.status === 'paid') { ctx.body = { data: view(o) }; return; }
      const f = ctx.request.files?.slip;
      const file = Array.isArray(f) ? f[0] : f;
      if (!file) return fail(ctx, 400, 'INVALID_INPUT', 'No slip received', { slip: 'required' });
      const fd = fs.openSync(file.filepath, 'r');
      const head = Buffer.alloc(16);
      fs.readSync(fd, head, 0, 16, 0);
      fs.closeSync(fd);
      const type = sniffImageType(head);
      // Real image bytes only (no SVG/GIF/other), within the size limit.
      if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) return fail(ctx, 400, 'FILE_TYPE', 'The slip must be a JPG, PNG or WEBP image.');
      if (file.size > slipMaxBytes()) return fail(ctx, 400, 'FILE_TOO_LARGE', `The slip must be under ${Math.round(slipMaxBytes() / 1048576)} MB.`);
      try {
        const updated = await payments.submitSlip(o, ctx.state.user, { filepath: file.filepath, size: file.size, mime: type, name: file.originalFilename || 'slip' }, ctx.get('idempotency-key') || null);
        strapi.log.info(`[payments] slip for ${o.reference}: ${updated.status}${updated.resultCode ? ` (${updated.resultCode})` : ''}`);
        ctx.body = { data: view(updated) };
      } catch (e) {
        if (e instanceof payments.PaymentError) return fail(ctx, e.status, e.code, e.message, e.fieldErrors);
        throw e;
      }
    },

    /** Staff-only slip view through the signed link stored on the order/attempt (no login, no public folder). */
    async slipFile(ctx) {
      const file = await payments.slipFile(ctx.params.attemptId, ctx.query.exp, ctx.query.sig);
      if (!file) { ctx.status = 404; ctx.body = 'Not found'; return; }
      ctx.set('Content-Type', file.mime);
      ctx.set('Cache-Control', 'private, no-store');
      ctx.set('X-Robots-Tag', 'noindex, nofollow');
      ctx.set('Content-Disposition', 'inline; filename="slip"');
      ctx.body = file.buffer;
    },
  };
});
