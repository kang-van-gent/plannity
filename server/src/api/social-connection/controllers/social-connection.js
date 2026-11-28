'use strict';

/**
 * Brand → Social channels (plannity-context-social-publishing.md §4, §9).
 *   GET    /brands/:id/social-connections                         brand.read
 *   POST   /brands/:id/social-connections/connect  { provider }   brand.update + paid plan → { url }
 *   GET    /brands/:id/social-connections/requests/:requestId     Meta Pages to choose from (the person who started only)
 *   POST   /brands/:id/social-connections/requests/:requestId/choose { pageId }
 *   POST   /social-connections/:id/test                           brand.update + paid plan — never posts
 *   DELETE /social-connections/:id                                brand.update
 *   GET    /social/callback/:provider                             public; redirects back into the app
 */
const { requireBrand, fail } = require('../../../utils/brand-access');
const { brandFeatures } = require('../../../services/entitlements');
const social = require('../../../services/social');
const { fakeMode } = require('../../../services/social/http');

const MESSAGES = {
  not_configured: 'This platform isn’t set up on this Plannity server yet',
  plan_required: 'Connecting accounts is part of Team and Studio',
  locked: 'This brand is locked until its plan is renewed',
};

/** Paid plan with social connections, and the brand not locked. Answers the request and returns false otherwise. */
async function requirePlan(ctx, brandDocumentId) {
  const f = await brandFeatures(strapi, brandDocumentId);
  if (f.locked) return !!fail(ctx, 403, 'FORBIDDEN', MESSAGES.locked, { brand: 'locked' });
  if (!f.features.socialConnections) return !!fail(ctx, 403, 'PLAN_REQUIRED', MESSAGES.plan_required, { plan: 'plan_required' });
  return true;
}

async function connectionAccess(ctx) {
  const conn = await social.findConnection(strapi, ctx.params.id);
  if (!conn?.brand) return fail(ctx, 404, 'NOT_FOUND', 'Connection not found');
  const ok = await requireBrand(ctx, conn.brand.documentId, 'brand.update');
  return ok ? { conn, ...ok } : null;
}

const html = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

module.exports = {
  async list(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.read');
    if (!ok) return;
    ctx.body = { data: await social.list(strapi, ok.brand.documentId), meta: social.settings() };
  },

  async connect(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.update');
    if (!ok || !(await requirePlan(ctx, ok.brand.documentId))) return;
    const provider = ctx.request.body?.data?.provider;
    if (!['meta', 'tiktok'].includes(provider)) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', { provider: 'invalid' });
    try {
      const url = await social.startConnect(strapi, { brand: ok.brand, user: ctx.state.user, provider });
      ctx.body = { data: { url } };
    } catch (e) {
      if (e.code === 'not_configured') return fail(ctx, 503, 'PROVIDER_UNAVAILABLE', MESSAGES.not_configured, { provider: 'not_configured' });
      throw e;
    }
  },

  async request(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.update');
    if (!ok) return;
    const out = await social.choices(strapi, ctx.params.requestId, ok.brand.documentId, ctx.state.user);
    if (out.error === 'not_found') return fail(ctx, 404, 'NOT_FOUND', 'Not found');
    if (out.error) return fail(ctx, 409, 'CONFLICT', 'This connection attempt has expired. Please connect again.', { request: out.error });
    ctx.body = { data: out };
  },

  async choose(ctx) {
    const ok = await requireBrand(ctx, ctx.params.id, 'brand.update');
    if (!ok || !(await requirePlan(ctx, ok.brand.documentId))) return;
    const pageId = ctx.request.body?.data?.pageId;
    if (!pageId) return fail(ctx, 400, 'INVALID_INPUT', 'Invalid input', { pageId: 'required' });
    const out = await social.choose(strapi, ctx.params.requestId, ok.brand.documentId, ctx.state.user, pageId);
    if (out.error === 'not_found') return fail(ctx, 404, 'NOT_FOUND', 'Not found');
    if (out.error) return fail(ctx, 409, 'CONFLICT', 'This connection attempt has expired. Please connect again.', { request: out.error });
    ctx.body = { data: await social.list(strapi, ok.brand.documentId), meta: { connected: out.connected } };
  },

  async test(ctx) {
    const ok = await connectionAccess(ctx);
    if (!ok || !(await requirePlan(ctx, ok.brand.documentId))) return;
    ctx.body = { data: await social.test(strapi, ok.conn) };
  },

  async disconnect(ctx) {
    const ok = await connectionAccess(ctx);
    if (!ok) return;
    await social.disconnect(strapi, ok.conn, ctx.state.user);
    ctx.body = { data: await social.list(strapi, ok.brand.documentId) };
  },

  async callback(ctx) {
    const provider = ctx.params.provider;
    if (!['meta', 'tiktok'].includes(provider)) return ctx.notFound();
    const q = ctx.query || {};
    ctx.redirect(await social.handleCallback(strapi, provider, {
      code: typeof q.code === 'string' ? q.code : null, state: typeof q.state === 'string' ? q.state : null,
      error: typeof q.error === 'string' ? q.error : null,
    }));
  },

  /** Stand-in consent screen for local testing (SOCIAL_FAKE=true). */
  async fakeAuthorize(ctx) {
    if (!fakeMode()) return ctx.notFound();
    const { provider, state } = ctx.query || {};
    if (!['meta', 'tiktok'].includes(provider) || typeof state !== 'string') return ctx.notFound();
    const base = `/api/social/callback/${provider}?state=${encodeURIComponent(state)}`;
    const name = provider === 'meta' ? 'Facebook (fake)' : 'TikTok (fake)';
    ctx.type = 'html';
    ctx.body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${html(name)}</title>
<body style="font:16px system-ui;max-width:420px;margin:12vh auto;padding:0 20px;color:#1f1b2e">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b45309">Local test · SOCIAL_FAKE=true</p>
<h1 style="font-size:22px">${html(name)} wants to connect to Plannity</h1>
<p style="color:#6b6480">Nothing is sent to ${provider === 'meta' ? 'Meta' : 'TikTok'}. This screen stands in for the real consent page.</p>
<p><a href="${html(base)}&code=fake-code" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#6c4cf5;color:#fff;text-decoration:none">Allow</a>
&nbsp;<a href="${html(base)}&error=access_denied" style="color:#6b6480">Cancel</a></p></body>`;
  },
};
