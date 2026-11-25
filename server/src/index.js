'use strict';

const holidays = require('./seed/holidays.json');
const { configureBuiltInProviders, registerAppleProvider } = require('./auth/social-providers');

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
  'api::activity-log.activity-log': ['list'],
};

async function grantAuthenticatedPermissions(strapi) {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });
  if (!role) return;
  const permissions = strapi.db.query('plugin::users-permissions.permission');
  for (const [uid, actions] of Object.entries(AUTHENTICATED_ACTIONS)) {
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
    await grantAuthenticatedPermissions(strapi);
    await seedHolidays(strapi);
    await configureBuiltInProviders(strapi);
    await backfillOwnerMemberships(strapi);
  },
};
