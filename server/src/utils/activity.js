'use strict';

/**
 * Activity log rules (who did what, when). Mirrored by app/app/utils/activity.ts
 * for the in-browser demo backend. Entries are append-only and written only by
 * the server; there is no API to edit or delete them.
 */

const CONTENT_FIELDS = [
  'title', 'concept', 'pillar', 'objective', 'platform', 'format', 'hook', 'caption', 'cta', 'hashtags',
  'visualBrief', 'videoScript', 'status', 'scheduledDate', 'scheduledTime', 'postedAt', 'postUrl', 'archivedAt',
];
const BRAND_FIELDS = ['name', 'color', 'archivedAt'];
const PROFILE_FIELDS = [
  'industry', 'description', 'products', 'usp', 'audience', 'painPoints', 'tone', 'language', 'platforms',
  'guidelines', 'forbiddenWords', 'competitors', 'pillars', 'ctaPreferences', 'goals',
];
const SCHEDULE_FIELDS = ['scheduledDate', 'scheduledTime'];
const MAX = 300; // long text is kept readable, not stored in full

function short(v) {
  if (v === undefined || v === '') return null;
  if (Array.isArray(v)) return v.map((x) => short(x));
  if (typeof v === 'string' && v.length > MAX) return `${v.slice(0, MAX)}…`;
  return v;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Field-level changes between two records, limited to `fields`. Profile fields become `profile.<key>`. */
function diff(before, after, fields) {
  const out = [];
  for (const f of fields) {
    if (!(f in (after || {}))) continue;
    if (!same(before?.[f], after[f])) out.push({ field: f, from: short(before?.[f]), to: short(after[f]) });
  }
  return out;
}

function diffBrand(before, after) {
  const changes = diff(before, after, BRAND_FIELDS);
  if (after && after.profile) {
    for (const c of diff(before?.profile || {}, after.profile, PROFILE_FIELDS)) changes.push({ ...c, field: `profile.${c.field}` });
  }
  return changes;
}

/** One action per edit, from what changed. */
function classifyContent(changes) {
  const fields = changes.map((c) => c.field);
  const arch = changes.find((c) => c.field === 'archivedAt');
  if (arch) return arch.to ? 'content.archived' : 'content.restored';
  if (!fields.length) return null;
  // Publishing also stamps postedAt — still a status change.
  if (fields.includes('status') && fields.every((f) => f === 'status' || f === 'postedAt')) return 'content.status_changed';
  if (fields.every((f) => SCHEDULE_FIELDS.includes(f))) {
    const d = changes.find((c) => c.field === 'scheduledDate');
    if (d && !d.to) return 'content.unscheduled';
    if (d && !d.from) return 'content.scheduled';
    return 'content.rescheduled';
  }
  return 'content.updated';
}

function classifyBrand(changes) {
  const arch = changes.find((c) => c.field === 'archivedAt');
  if (arch) return arch.to ? 'brand.archived' : 'brand.restored';
  return changes.length ? 'brand.updated' : null;
}

module.exports = { CONTENT_FIELDS, BRAND_FIELDS, PROFILE_FIELDS, diff, diffBrand, classifyContent, classifyBrand, short };
