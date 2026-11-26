'use strict';

// Core routes stay ungranted; the app reads its own wallet/ledger through these actions.
const { factories } = require('@strapi/strapi');
const { walletFor, LEDGER } = require('../../../services/credits');

module.exports = factories.createCoreController('api::credit-wallet.credit-wallet', ({ strapi }) => ({
  async balance(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const w = await walletFor(strapi, ctx.state.user.id);
    ctx.body = { data: { available: Number(w.available), reserved: Number(w.reserved), creditPriceSatang: Number(process.env.CREDIT_PRICE_SATANG || 1000) } };
  },
  async ledger(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const rows = await strapi.documents(LEDGER).findMany({ filters: { wallet: { user: { id: ctx.state.user.id } } }, sort: 'createdAt:desc', limit: 200 });
    ctx.body = {
      data: rows.map((l) => ({
        id: l.documentId, type: l.type, deltaAvailable: l.deltaAvailable, deltaReserved: l.deltaReserved, availableAfter: l.availableAfter,
        refType: l.refType ?? null, refId: l.refId ?? null, createdAt: l.createdAt,
      })),
    };
  },
}));
