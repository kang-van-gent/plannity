'use strict';

const { factories } = require('@strapi/strapi');
const { entitlementsFor } = require('../../../services/entitlements');
const P = require('../../../utils/pricing');

// Core routes stay ungranted: plans are created by paid orders or by staff in the admin.
module.exports = factories.createCoreController('api::subscription.subscription', ({ strapi }) => ({
  /** GET /billing/me — the signed-in account's plan, limits, usage and the price list. */
  async me(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    ctx.body = { data: { ...(await entitlementsFor(strapi, ctx.state.user.id)), pricing: P.pricing() } };
  },
}));
