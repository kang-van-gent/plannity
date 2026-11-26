'use strict';

/**
 * Account-level endpoints the app needs besides the collections:
 *   GET  /dashboard?brandId   home summary for the brands the user belongs to
 *   POST /auth/verify          trial credits once the account's email is confirmed (idempotent)
 *   PUT  /me                   name / locale
 *   GET  /contents/export      CSV of the user's content (same filters as the library)
 * Everything is scoped to the signed-in user's active memberships.
 */
const { walletFor, grantTrial } = require('../../../services/credits');
const { MEMBERSHIP } = require('../../../utils/brand-access');

const CONTENT = 'api::content.content';
const STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published'];
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Asia/Bangkok
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function appUser(u) {
  return {
    id: String(u.documentId ?? u.id), email: u.email, name: u.name || u.username || '', verifiedAt: u.confirmed ? u.updatedAt ?? u.createdAt : null,
    locale: u.locale === 'en' ? 'en' : 'th', timezone: 'Asia/Bangkok', createdAt: u.createdAt,
  };
}

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
    const rows = scope.length ? await strapi.documents(CONTENT).findMany({
      filters: { $and: [rest, { brand: { documentId: { $in: scope } } }] },
      populate: { brand: { fields: ['documentId', 'name'] } }, sort: 'scheduledDate:asc', limit: 10000,
    }) : [];
    const head = ['date', 'brand', 'platform', 'format', 'pillar', 'title', 'hook', 'caption', 'CTA', 'brief', 'status', 'post URL'];
    const lines = [head.map(safeCell).join(',')];
    for (const c of rows) {
      lines.push([c.scheduledDate ?? c.suggestedDate ?? '', c.brand?.name ?? '', c.platform, c.format, c.pillar, c.title, c.hook, c.caption, c.cta, c.visualBrief, c.status, c.postUrl ?? '']
        .map(safeCell).join(','));
    }
    ctx.set('Content-Type', 'text/csv; charset=utf-8');
    ctx.set('Content-Disposition', 'attachment; filename="plannity-content.csv"');
    ctx.body = `﻿${lines.join('\r\n')}`; // BOM so Excel opens Thai correctly
  },
});
