'use strict';

/**
 * Account-level endpoints the app needs besides the collections:
 *   GET  /dashboard?brandId   home summary for the brands the user belongs to
 *   POST /auth/verify          trial credits once the account's email is confirmed (idempotent)
 *   GET  /me                   the signed-in user (app shape)
 *   PUT  /me                   name / locale
 *   POST /me/avatar            upload a profile photo (multipart "file")
 *   PUT  /me/avatar            { source: 'gravatar' | 'google' | 'none' }
 *   GET  /contents/export      CSV of the user's content (same filters as the library)
 * Everything is scoped to the signed-in user's active memberships.
 */
const fs = require('node:fs');
const { walletFor, grantTrial } = require('../../../services/credits');
const avatar = require('../../../services/avatar');
const { sniffImageType } = require('../../../utils/image-type');
const { MEMBERSHIP } = require('../../../utils/brand-access');

const CONTENT = 'api::content.content';
const STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published'];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Asia/Bangkok
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function appUser(u) {
  return {
    id: String(u.documentId ?? u.id), email: u.email, name: u.name || u.username || '', verifiedAt: u.confirmed ? u.updatedAt ?? u.createdAt : null,
    locale: u.locale === 'en' ? 'en' : 'th', timezone: 'Asia/Bangkok', createdAt: u.createdAt,
    avatarUrl: u.avatarUrl || null, avatarSource: u.avatarSource || null, hasGooglePhoto: !!u.googleAvatarUrl,
    // Password sign-in only exists for email accounts; Google/Apple accounts sign in with their provider.
    signInMethod: u.provider || 'local',
  };
}

const USER = 'plugin::users-permissions.user';
const bad = (ctx, status, code, message, fieldErrors = {}) => {
  ctx.status = status;
  ctx.body = { data: null, error: { status, code, message, fieldErrors } };
};

/** documentIds of active brands the user is a member of. */
async function myBrandIds(strapi, userId, includeArchived = false) {
  const rows = await strapi.documents(MEMBERSHIP).findMany({
    filters: { user: { id: userId }, status: 'active' }, fields: ['role'], populate: { brand: { fields: ['documentId', 'archivedAt'] } }, limit: 1000,
  });
  return rows.filter((r) => r.brand && (includeArchived || !r.brand.archivedAt)).map((r) => r.brand.documentId);
}

function contentView(c) {
  const { postedAt, brand, images, ...rest } = c;
  return { ...rest, id: c.documentId, brandId: brand?.documentId ?? null, publishedAt: postedAt ?? null, imageCount: Array.isArray(images) ? images.length : 0 };
}

const safeCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

module.exports = ({ strapi }) => ({
  async dashboard(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const all = await myBrandIds(strapi, user.id);
    const scope = ctx.query.brandId ? all.filter((id) => id === ctx.query.brandId) : all;
    const t = today();
    const rows = scope.length ? await strapi.documents(CONTENT).findMany({
      filters: { brand: { documentId: { $in: scope } }, archivedAt: { $null: true } },
      populate: { brand: { fields: ['documentId'] }, images: { fields: ['id'] } }, limit: 5000,
    }) : [];
    const contents = rows.map(contentView);
    const byDate = (a, b) => String(a.scheduledDate ?? '').localeCompare(String(b.scheduledDate ?? '')) || String(a.scheduledTime ?? '').localeCompare(String(b.scheduledTime ?? ''));
    const w = await walletFor(strapi, user.id);
    ctx.body = {
      data: {
        wallet: { available: Number(w.available), reserved: Number(w.reserved), creditPriceSatang: Number(process.env.CREDIT_PRICE_SATANG || 1000) },
        brandCount: all.length,
        monthCount: contents.filter((c) => String(c.scheduledDate ?? '').slice(0, 7) === t.slice(0, 7)).length,
        statusCounts: Object.fromEntries(STATUSES.map((s) => [s, contents.filter((c) => c.status === s).length])),
        upcoming: contents.filter((c) => c.scheduledDate && c.scheduledDate >= t && c.scheduledDate <= addDays(t, 6)).sort(byDate).slice(0, 8),
        backlog: contents.filter((c) => c.status !== 'published' && c.scheduledDate && (c.scheduledDate < t
          || (['draft', 'in_review'].includes(c.status) && c.scheduledDate <= addDays(t, 7)))).sort(byDate).slice(0, 6),
        recentJobs: [], // AI generation is not open yet
      },
    };
  },

  async verify(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    // With email confirmation off, accounts are confirmed at sign-up; with it on, only after the link.
    if (!user.confirmed) {
      ctx.status = 409;
      ctx.body = { data: null, error: { status: 409, code: 'CONFLICT', message: 'Confirm your email first — check your inbox for the link.' } };
      return;
    }
    const granted = await grantTrial(strapi, user.id);
    ctx.body = { granted, user: appUser(user) };
  },

  async me(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    ctx.body = appUser(await strapi.db.query(USER).findOne({ where: { id: user.id } }));
  },

  async avatarUpload(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const f = ctx.request.files?.file;
    const file = Array.isArray(f) ? f[0] : f;
    if (!file) return bad(ctx, 400, 'INVALID_INPUT', 'No image received', { file: 'required' });
    const head = Buffer.alloc(16);
    const fd = fs.openSync(file.filepath, 'r');
    try { fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
    if (!sniffImageType(head)) return bad(ctx, 400, 'FILE_TYPE', 'Use a JPG, PNG, WEBP or GIF image', { file: 'file_type' });
    if (file.size > avatar.MAX_BYTES) return bad(ctx, 400, 'FILE_TOO_LARGE', 'The photo must be 5 MB or smaller', { file: 'too_large' });
    try {
      ctx.body = appUser(await avatar.saveUpload(strapi, user, file));
    } catch (e) {
      strapi.log.error(`[avatar] upload failed for user ${user.id}: ${e.message}`);
      return bad(ctx, 400, 'FILE_TYPE', 'This image could not be read', { file: 'unreadable' });
    }
  },

  async avatarSet(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const source = (ctx.request.body?.data ?? ctx.request.body ?? {}).source;
    const out = await avatar.useSource(strapi, user, source);
    if (out.error) {
      const msg = { no_gravatar: 'There is no Gravatar photo for this email', gravatar_unreachable: 'Gravatar can’t be reached right now', no_google_photo: 'Sign in with Google once to use your Google photo', invalid: 'Unknown photo source' }[out.error];
      return bad(ctx, out.error === 'gravatar_unreachable' ? 503 : 400, out.error === 'gravatar_unreachable' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_INPUT', msg, { avatar: out.error });
    }
    ctx.body = appUser(out.user);
  },

  async updateMe(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 80) {
        ctx.status = 400;
        ctx.body = { data: null, error: { status: 400, code: 'INVALID_INPUT', message: 'Invalid name', fieldErrors: { name: name ? 'too_long' : 'required' } } };
        return;
      }
      data.name = name;
    }
    if (body.locale !== undefined) data.locale = body.locale === 'en' ? 'en' : 'th';
    const updated = await strapi.db.query('plugin::users-permissions.user').update({ where: { id: user.id }, data });
    ctx.body = appUser(updated);
  },

  async exportCsv(ctx) {
    const user = ctx.state.user;
    if (!user) return ctx.unauthorized();
    const ids = await myBrandIds(strapi, user.id, ctx.query['filters[archivedAt][$null]'] === undefined);
    const q = ctx.query.filters ?? {};
    const brandFilter = q.brand?.documentId?.$eq;
    const scope = brandFilter ? ids.filter((id) => id === brandFilter) : ids;
    const { brand: _b, ...rest } = q;
    // ?platform= matches any of a post's platforms (same as the library list).
    const platform = typeof ctx.query.platform === 'string' ? { destinations: { platform: ctx.query.platform } } : null;
    const rows = scope.length ? await strapi.documents(CONTENT).findMany({
      filters: { $and: [rest, { brand: { documentId: { $in: scope } } }, ...(platform ? [platform] : [])] },
      populate: { brand: { fields: ['documentId', 'name'] }, destinations: { fields: ['platform'], sort: 'id:asc' } }, sort: 'scheduledDate:asc', limit: 10000,
    }) : [];
    const head = ['date', 'brand', 'platform', 'format', 'pillar', 'title', 'hook', 'caption', 'CTA', 'brief', 'status', 'post URL'];
    const lines = [head.map(safeCell).join(',')];
    for (const c of rows) {
      lines.push([c.scheduledDate ?? c.suggestedDate ?? '', c.brand?.name ?? '', (c.destinations?.length ? c.destinations.map((d) => d.platform) : [c.platform]).join(' + '), c.format, c.pillar, c.title, c.hook, c.caption, c.cta, c.visualBrief, c.status, c.postUrl ?? '']
        .map(safeCell).join(','));
    }
    ctx.set('Content-Type', 'text/csv; charset=utf-8');
    ctx.set('Content-Disposition', 'attachment; filename="plannity-content.csv"');
    ctx.body = `﻿${lines.join('\r\n')}`; // BOM so Excel opens Thai correctly
  },
});
