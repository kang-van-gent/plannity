'use strict';

/**
 * Multi-platform content (plannity-context-social-publishing.md §3–4, §9).
 *   GET   /contents/:id/destinations                 content.read
 *   PATCH /contents/:id/destinations                 content.update — replaces the platform list
 *   POST  /destinations/:id/mark-published           content.update — manual only; { published?, publishedAt?, postUrl? }
 * Automatic posting (services/publisher.js), all content.update except autopost:
 *   GET   /contents/:id/autopost                     content.read — which platforms can post by themselves
 *   GET   /contents/:id/tiktok-creator               TikTok's creator details for the posting screen
 *   POST  /destinations/:id/publish    { options? }  Post now
 *   POST  /destinations/:id/schedule   { options? }  post automatically at the post's date and time
 *   POST  /destinations/:id/unschedule               back to manual
 * Brand access is checked on the content's brand (404 outside it).
 */
const { requireContent, fail } = require('../../../utils/brand-access');
const { validateSet } = require('../../../utils/destinations');
const svc = require('../../../services/destinations');
const publisher = require('../../../services/publisher');
const { brandFeatures } = require('../../../services/entitlements');
const { SocialError } = require('../../../services/social/http');
const tiktok = require('../../../services/social/tiktok');

const errorBody = (ctx, fieldErrors) => fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', fieldErrors);

/** The destination and its content, after checking the member may edit it. */
async function access(ctx) {
  const user = ctx.state.user;
  if (!user) return fail(ctx, 401, 'UNAUTHENTICATED', 'Please sign in');
  const dest = await strapi.documents(svc.DEST).findOne({ documentId: ctx.params.id, populate: { content: { fields: ['documentId'] } } });
  if (!dest?.content) return fail(ctx, 404, 'NOT_FOUND', 'Not found');
  const ok = await requireContent(ctx, dest.content.documentId, 'content.update');
  if (!ok) return null;
  if (ok.content.archivedAt) return fail(ctx, 409, 'CONFLICT', 'This post is archived');
  return { ...ok, dest, user };
}

/** The destination after an automatic-posting action, with the post's new state. */
async function answer(ctx, contentDocumentId, destDocumentId, result = null) {
  const fresh = await strapi.documents(svc.DEST).findOne({ documentId: destDocumentId });
  const imageIds = await svc.orderedImageIds(strapi, contentDocumentId);
  const content = await strapi.documents('api::content.content').findOne({ documentId: contentDocumentId });
  ctx.body = { data: svc.view(fresh, contentDocumentId, imageIds), meta: { content: svc.contentPatchView(content), result } };
}

/** PublishError / SocialError → the app's error shape, with a code it can explain. */
function publishFail(ctx, e) {
  if (e instanceof publisher.PublishError) return fail(ctx, e.status, e.status === 403 ? (e.code === 'plan_required' ? 'PLAN_REQUIRED' : 'FORBIDDEN') : e.status === 400 ? 'INVALID_INPUT' : 'CONFLICT', e.message, { publish: e.code });
  if (e instanceof SocialError) return fail(ctx, 502, 'PLATFORM', e.message, { publish: String(e.code || e.kind) });
  throw e;
}

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
    if (out.error) return fail(ctx, 409, 'CONFLICT', 'A platform that is already posted can’t be removed. Undo “posted” first.', out.error);
    // A scheduled platform whose own time changed moves with it.
    let rows = out.destinations;
    if (rows.some((d) => d.status === 'scheduled')) {
      for (const d of rows) if (d.status === 'scheduled') await publisher.followDestination(strapi, d.id);
      const fresh = await svc.listFor(strapi, ok.content.documentId);
      rows = fresh.map((d) => svc.view(d, ok.content.documentId, imageIds));
    }
    ctx.body = { data: rows, meta: { content: out.content } };
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

  async autopost(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'content.read');
    if (!ok) return;
    const brandId = ok.content.brand?.documentId ?? ok.brand?.documentId;
    const f = await brandFeatures(strapi, brandId);
    ctx.body = {
      data: {
        available: !!f.features.socialConnections && !f.locked,
        reason: f.locked ? 'brand_locked' : f.features.socialConnections ? null : 'plan_required',
        platforms: publisher.AUTO_PLATFORMS,
        accounts: await publisher.autoAccounts(strapi, brandId),
        tiktokPrivateOnly: !tiktok.audited(),
      },
    };
  },

  async tiktokCreator(ctx) {
    const ok = await requireContent(ctx, ctx.params.id, 'content.update');
    if (!ok) return;
    try {
      ctx.body = { data: await publisher.tiktokCreator(strapi, ok.content.brand?.documentId ?? ok.brand?.documentId) };
    } catch (e) {
      return publishFail(ctx, e);
    }
  },

  async publish(ctx) {
    const a = await access(ctx);
    if (!a) return;
    try {
      const options = ctx.request.body?.data?.options;
      const result = await publisher.publish(strapi, a.dest.documentId, { user: a.user, options });
      await answer(ctx, a.content.documentId, a.dest.documentId, result);
    } catch (e) {
      return publishFail(ctx, e);
    }
  },

  async schedule(ctx) {
    const a = await access(ctx);
    if (!a) return;
    try {
      const options = ctx.request.body?.data?.options;
      const result = await publisher.schedule(strapi, a.dest.documentId, { user: a.user, options });
      await answer(ctx, a.content.documentId, a.dest.documentId, result);
    } catch (e) {
      return publishFail(ctx, e);
    }
  },

  async unschedule(ctx) {
    const a = await access(ctx);
    if (!a) return;
    try {
      await publisher.unschedule(strapi, a.dest.documentId, { user: a.user });
      await answer(ctx, a.content.documentId, a.dest.documentId);
    } catch (e) {
      return publishFail(ctx, e);
    }
  },
};
