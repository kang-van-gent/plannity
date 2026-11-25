'use strict';

/**
 * Writes one activity entry. Called by controllers/services after a change
 * succeeds (inside their transaction when there is one). Logging must never
 * break the user's action, so failures are reported to the server log only.
 */
async function record(strapi, { brandId, actor, action, entityType, entityId, entityTitle, changes = [] }) {
  if (!brandId || !action) return;
  try {
    await strapi.documents('api::activity-log.activity-log').create({
      data: {
        brand: brandId,
        actor: actor?.id ?? null,
        actorName: String(actor?.name || actor?.username || actor?.email || 'System').slice(0, 120),
        action,
        entityType,
        entityId: String(entityId),
        entityTitle: entityTitle ? String(entityTitle).slice(0, 200) : null,
        changes,
      },
    });
  } catch (e) {
    strapi.log.error(`[activity] could not record ${action} on ${entityType}:${entityId}: ${e.message}`);
  }
}

module.exports = { record };
