'use strict';

const holidays = require('./seed/holidays.json');
const { configureBuiltInProviders, registerAppleProvider } = require('./auth/social-providers');

/**
 * Actions the signed-in ("authenticated") role may call on core routes.
 * Every one of these controllers is owner-scoped (src/utils/owner-scoped.js),
 * so a user can only ever touch their own rows. Credit, payment and
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

module.exports = {
  register({ strapi }) {
    registerAppleProvider(strapi);
  },

  async bootstrap({ strapi }) {
    await grantAuthenticatedPermissions(strapi);
    await seedHolidays(strapi);
    await configureBuiltInProviders(strapi);
  },
};
