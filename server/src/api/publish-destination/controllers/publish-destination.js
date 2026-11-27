'use strict';

/**
 * Multi-platform content (plannity-context-social-publishing.md §3–4, §9).
 *   GET   /contents/:id/destinations                 content.read
 *   PATCH /contents/:id/destinations                 content.update — replaces the platform list
 *   POST  /destinations/:id/mark-published           content.update — manual only; { published?, publishedAt?, postUrl? }
 * Brand access is checked on the content's brand (404 outside it). Automatic
 * publishing, connections and quotas are later phases: `mode` must be "manual".
 */
const { requireContent, fail } = require('../../../utils/brand-access');
const { validateSet } = require('../../../utils/destinations');
const svc = require('../../../services/destinations');

const errorBody = (ctx, fieldErrors) => fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);

module.exports = {
  async list(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'content.read');
    if (!ok) return;
    const rows = await svc.ensureFor(strapi, ok.content.documentId);
    const imageIds = await svc.orderedImageIds(strapi, ok.content.documentId);
    ctx.body = { data: rows.map((d) => svc.view(d, ok.content.documentId, imageIds)) };
  },

  async replace(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'content.update');
    if (!ok) return;
    if (ok.content.archivedAt) return fail(ctx, 409, 'CONFLICT', 'This post is archived');
    const imageIds = await svc.orderedImageIds(strapi, ok.content.documentId);
    const { errors, list } = validateSet(ctx.request.body?.data?.destinations, { imageIds });
    if (Object.keys(errors).length) return errorBody(ctx, errors);
    const out = await svc.applySet(strapi, ok.content, list, ctx.state.user);
    if (out.error) return fail(ctx, 409, 'CONFLICT', 'A platform that is already published can’t be removed. Undo “published” first.', out.error);
    ctx.body = { data: out.destinations, meta: { content: out.content } };
  },

  async markPublished(ctx) {
    const user = ctx.state.user;
    if (!user) return fail(ctx, 401, 'UNAUTHENTICATED', 'Please sign in');
    const dest = await strapi.documents(svc.DEST).findOne({ documentId: ctx.params.id, populate: { content: { fields: ['documentId'] } } });
    if (!dest?.content) return fail(ctx, 404, 'NOT_FOUND', 'Not found');
    const ok = await requireContent(ctx, dest.content.documentId, 'content.update');
    if (!ok) return;
    if (ok.content.archivedAt) return fail(ctx, 409, 'CONFLICT', 'This post is archived');
    const out = await svc.markPublished(strapi, ok.content, dest, ctx.request.body?.data ?? {}, user);
    if (out.error) return errorBody(ctx, out.error);
    ctx.body = { data: out.destination, meta: { content: out.content } };
  },
};
