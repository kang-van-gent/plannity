'use strict';

const { brandScopedController } = require('../../../utils/brand-access');
const { CONTENT_FIELDS, diff, classifyContent } = require('../../../utils/activity');
const { PLATFORMS } = require('../../../utils/destinations');
const destinations = require('../../../services/destinations');

// Status rules from plannity-spec §10. Publishing is always a user confirmation;
// nothing here posts to social networks.
// `next` = stored record merged with the incoming change; `data` = the payload that will be written.
function validate(next, _existing, data) {
  const errors = {};
  if (next.status === 'scheduled' && !next.scheduledDate) errors.scheduledDate = 'needs_date';
  if (next.postUrl && !/^https?:\/\//i.test(next.postUrl)) errors.postUrl = 'invalid_url';
  if (next.status === 'published' && !next.postedAt) data.postedAt = new Date().toISOString();
  if (next.status && next.status !== 'published' && next.postedAt) data.postedAt = null;
  return errors;
}

const REVISION_FIELDS = ['title', 'concept', 'hook', 'caption', 'cta', 'visualBrief', 'videoScript', 'hashtags'];
const SNAPSHOT_FIELDS = ['title', 'concept', 'pillar', 'objective', 'platform', 'format', 'hook', 'caption', 'cta', 'hashtags', 'visualBrief', 'videoScript', 'suggestedDate', 'rationale'];
async function revision(c, reason, user) {
  const snapshot = Object.fromEntries(SNAPSHOT_FIELDS.map((k) => [k, c[k] ?? null]));
  await strapi.documents('api::content-revision.content-revision').create({
    data: { content: c.documentId, version: Number(c.version || 1), reason, snapshot, owner: user.id },
  });
}

// Access follows the member's role in the content's brand (Team Workspace).
module.exports = brandScopedController('api::content.content', {
  brandPath: 'brand',
  perms: { read: 'content.read', create: 'content.create', update: 'content.update', delete: 'content.delete' },
  // Images change only through /contents/:id/images (validation, ordering, file cleanup);
  // platforms only through /contents/:id/destinations.
  protectedFields: ['images', 'destinations'],
  versioned: true,
  validate,
  audit: { entityType: 'content', title: (c) => c.title, diff: (before, data) => diff(before, data, CONTENT_FIELDS), classify: classifyContent },
  // Version history: a snapshot at creation and before every edit of the post's text.
  async onCreate(created, user) {
    await revision(created, 'create', user);
  },
  async onUpdate(existing, data, user) {
    if (REVISION_FIELDS.some((k) => k in data && JSON.stringify(data[k]) !== JSON.stringify(existing[k]))) await revision(existing, 'edit', user);
    await destinations.syncFromContent(strapi, existing, data);
  },
  // A post going to several platforms is marked published per platform, never all at once.
  precheck: (existing, data) => destinations.contentPrecheck(strapi, existing, data),
  // ?platform=instagram matches any of the post's destinations, not just its first platform.
  extraFilters(ctx) {
    const p = ctx.query.platform;
    delete ctx.query.platform;
    if (p === undefined) return null;
    return { destinations: { platform: PLATFORMS.includes(p) ? p : '__none__' } };
  },
  // Every post carries its destinations (platform, own caption/images/date, manual publish state).
  async decorateRows(rows) {
    const byContent = await destinations.listForMany(strapi, rows.map((r) => r.documentId));
    for (const r of rows) r.destinations = (byContent.get(r.documentId) ?? []).map((d) => destinations.view(d, r.documentId, null));
  },
});
