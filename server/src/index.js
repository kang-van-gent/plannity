'use strict';

const holidays = require('./seed/holidays.json');
const { configureBuiltInProviders, registerAppleProvider } = require('./auth/social-providers');
const { fulfillOrder } = require('./services/billing');
const { invalidate } = require('./services/entitlements');
const createPayments = require('./services/payments');
const destinations = require('./services/destinations');
const appSettings = require('./services/app-settings');
const { resetWarning: resetSlip2goWarning } = require('./services/slip2go');

/**
 * Actions the signed-in ("authenticated") role may call.
 * Brand/content/revision access is brand-scoped by membership role
 * (src/utils/brand-access.js); the rest is owner-scoped (src/utils/owner-scoped.js).
 * Team and image endpoints check the member's role per brand themselves. Credit, payment and
 * generation tables are deliberately absent: they are written only by
 * server-side services.
 */
const AUTHENTICATED_ACTIONS = {
  'api::brand.brand': ['find', 'findOne', 'create', 'update'],
  'api::content.content': ['find', 'findOne', 'create', 'update'],
  'api::content-revision.content-revision': ['find', 'findOne'],
  'api::holiday.holiday': ['find', 'findOne', 'create', 'delete'],
  'api::promotion-inquiry.promotion-inquiry': ['find', 'findOne', 'create'],
  'api::feedback.feedback': ['create'],
  'api::team.team': ['get', 'invite', 'resend', 'cancel', 'updateRole', 'removeMember', 'leave', 'mine', 'acceptMine', 'declineMine', 'accept', 'decline'],
  'api::content-image.content-image': ['upload', 'reorder', 'replace', 'remove', 'download'],
  'api::publish-destination.publish-destination': ['list', 'replace', 'markPublished'],
  'api::social-connection.social-connection': ['list', 'connect', 'request', 'choose', 'test', 'disconnect'],
  'api::activity-log.activity-log': ['list'],
  'api::payment-order.payment-order': ['myOrders', 'createMine', 'findMine', 'uploadSlip', 'createHandoff'],
  'api::credit-wallet.credit-wallet': ['balance', 'ledger'],
  'api::subscription.subscription': ['me'],
  'api::account.account': ['dashboard', 'verify', 'updateMe', 'exportCsv'],
  'api::task.task': ['forContent', 'create', 'mine', 'forBrand', 'updateAssignment', 'transition'],
};

/** Actions anyone may call without signing in (the public blog). */
const PUBLIC_ACTIONS = {
  'api::blog-post.blog-post': ['find', 'findOne'],
  // SEO & analytics settings read by the public website.
  'api::site-setting.site-setting': ['find'],
};

async function grantPermissions(strapi, roleType, map) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: roleType } });
  if (!role) return;
  const permissions = strapi.db.query('plugin::users-permissions.permission');
  for (const [uid, actions] of Object.entries(map)) {
    for (const action of actions) {
      const name = `${uid}.${action}`;
      const exists = await permissions.findOne({ where: { action: name, role: role.id } });
      if (!exists) await permissions.create({ data: { action: name, role: role.id } });
    }
  }
}

/** Curated Thai key dates (owner = null → shared, read-only). Runs once. */
async function seedHolidays(strapi) {
  const docs = strapi.documents('api::holiday.holiday');
  const count = await docs.count({ filters: { owner: { id: { $null: true } } } });
  if (count > 0) return;
  for (const h of holidays) await docs.create({ data: h });
  strapi.log.info(`[plannity] seeded ${holidays.length} curated key dates`);
}

/**
 * Team Workspace migration: brands created before memberships existed get an
 * Owner membership for their creator, so nobody loses access. Idempotent.
 */
async function backfillOwnerMemberships(strapi) {
  const brands = await strapi.documents('api::brand.brand').findMany({
    filters: { memberships: { id: { $null: true } } },
    populate: { owner: { fields: ['id'] } },
    limit: 10000,
  });
  for (const b of brands) {
    if (!b.owner) continue;
    await strapi.documents('api::brand-membership.brand-membership').create({
      data: { brand: b.documentId, user: b.owner.id, role: 'owner', status: 'active', joinedAt: b.createdAt, memberKey: `${b.documentId}:${b.owner.id}` },
    });
  }
  if (brands.length) strapi.log.info(`[plannity] created owner memberships for ${brands.length} existing brands`);
}

module.exports = {
  register({ strapi }) {
    registerAppleProvider(strapi);
  },

  async bootstrap({ strapi }) {
    // Admin-managed settings (Content Manager → App settings) override .env; applied before anything reads them.
    const fromAdmin = await appSettings.apply(strapi);
    if (fromAdmin.length) strapi.log.info(`[settings] from App settings: ${fromAdmin.join(', ')}`);
    const payments = createPayments({ strapi });
    strapi.db.lifecycles.subscribe({
      models: [appSettings.UID],
      beforeCreate(event) { appSettings.sealSecrets(event.params.data); },
      beforeUpdate(event) { appSettings.sealSecrets(event.params.data); },
      async afterCreate() { await reapply(); },
      async afterUpdate() { await reapply(); },
    });
    async function reapply() {
      const keys = await appSettings.apply(strapi);
      strapi.log.info(`[settings] App settings saved and applied${keys.length ? `: ${keys.join(', ')}` : ' (all from .env)'}`);
      resetSlip2goWarning();
      payments.healthCheck().catch((e) => strapi.log.error(`[slip2go] health check error: ${e.message}`));
    }
    await grantPermissions(strapi, 'authenticated', AUTHENTICATED_ACTIONS);
    await grantPermissions(strapi, 'public', PUBLIC_ACTIONS);
    await seedHolidays(strapi);
    await configureBuiltInProviders(strapi);
    await backfillOwnerMemberships(strapi);
    // Multi-platform content: every existing post gets its platform as a manual destination (never auto-posted).
    await destinations.backfill(strapi);

    // New posts — from the editor, AI generation or "duplicate" — start with their platform as a destination.
    strapi.db.lifecycles.subscribe({
      models: ['api::content.content'],
      async afterCreate(event) {
        const documentId = event.result?.documentId;
        if (!documentId) return;
        try { await destinations.ensureFor(strapi, documentId); } catch (e) { strapi.log.error(`[destinations] could not add the default destination for ${documentId}: ${e.message}`); }
      },
    });

    // An order becomes "paid" — by staff in the admin today, by the slip
    // verifier later — and what it bought is delivered: credits, a plan month
    // or brand add-ons. Idempotent per order.
    strapi.db.lifecycles.subscribe({
      models: ['api::payment-order.payment-order'],
      async afterUpdate(event) {
        const r = event.result;
        if (r && r.status === 'paid' && r.documentId && !r.fulfilledAt) {
          try {
            // Staff approvals with Slip2Go facts obey the same one-transfer-one-order rule.
            const order = await strapi.documents('api::payment-order.payment-order').findOne({ documentId: r.documentId });
            if (await payments.claimForStaffApproval(order)) await fulfillOrder(strapi, r.documentId);
          } catch (e) { strapi.log.error(`[billing] fulfilment failed for ${r.documentId}: ${e.message}`); }
        }
      },
    });
    // Slip2Go: report connection/quota at startup; every 5 min finish interrupted
    // checks and undelivered payments; daily, delete slips past retention.
    payments.healthCheck().catch((e) => strapi.log.error(`[slip2go] health check error: ${e.message}`));
    const every = (ms, fn) => { const t = setInterval(() => fn().catch((e) => strapi.log.error(`[payments] job failed: ${e.message}`)), ms); t.unref?.(); };
    every(5 * 60_000, () => payments.recover());
    every(24 * 3600_000, () => payments.purgeOldSlips());

    // Staff can also grant, extend or cancel plans/add-ons in the admin; entitlements follow at once.
    strapi.db.lifecycles.subscribe({
      models: ['api::subscription.subscription', 'api::subscription-add-on.subscription-add-on', 'api::brand.brand'],
      afterCreate: () => invalidate(),
      afterUpdate: () => invalidate(),
      afterDelete: () => invalidate(),
    });
  },
};
