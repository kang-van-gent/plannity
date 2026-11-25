'use strict';

const { requireBrand } = require('../../../utils/brand-access');

const TYPES = ['brand', 'content', 'member'];

module.exports = {
  /** GET /brands/:brandId/activity?entityType=content&entityId=…&page=1&pageSize=30 — any member may read. */
  async list(ctx) {
    const ok = await requireBrand(ctx, ctx.params.brandId, 'brand.read');
    if (!ok) return;
    const q = ctx.query || {};
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(q.pageSize) || 30));
    const filters = { brand: { documentId: ok.brand.documentId } };
    if (TYPES.includes(q.entityType)) filters.entityType = q.entityType;
    if (q.entityId) filters.entityId = String(q.entityId);
    const docs = strapi.documents('api::activity-log.activity-log');
    const [rows, total] = await Promise.all([
      docs.findMany({ filters, sort: 'createdAt:desc', start: (page - 1) * pageSize, limit: pageSize, populate: { actor: { fields: ['id'] } } }),
      docs.count({ filters }),
    ]);
    ctx.body = {
      data: rows.map((r) => ({
        id: r.documentId, brandId: ok.brand.documentId, actorId: r.actor ? String(r.actor.id) : null, actorName: r.actorName,
        action: r.action, entityType: r.entityType, entityId: r.entityId, entityTitle: r.entityTitle, changes: r.changes ?? [], createdAt: r.createdAt,
      })),
      meta: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    };
  },
};
