'use strict';

/**
 * Multi-platform content rules (plannity-context-social-publishing.md §3–4).
 * Pure functions, no database: the service (services/destinations.js) and the
 * tests use them. Mirrored for the in-browser demo by app/app/utils/destinations.ts.
 *
 * One content → one destination per platform. A destination inherits the
 * content's caption, images and date unless it overrides them; `null` means
 * "inherit" and is kept apart from a deliberate empty value.
 *
 * A destination is `draft` until it goes live: by hand (a member marks it
 * posted) or automatically (services/publisher.js: scheduled → publishing → published/failed).
 */

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'line', 'x', 'linkedin'];
const MAX_CAPTION = 5000;
const MAX_URL = 500;
const DEFAULT_TIMEZONE = 'Asia/Bangkok';

const destinationKey = (contentDocumentId, platform) => `${contentDocumentId}:${platform}`;

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const isIsoDateTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v));
const isHttpUrl = (v) => typeof v === 'string' && v.length <= MAX_URL && /^https?:\/\/[^\s]+$/i.test(v);

/**
 * Checks the full destination list sent for a content item.
 * @param {unknown} items  [{ platform, captionOverride?, mediaOverrideIds?, scheduledAt?, timezone? }]
 * @param {{ imageIds: string[] }} ctx  the content's own image ids (overrides may only use these)
 * @returns {{ errors: Record<string,string>, list: object[] }}
 *   Field errors are keyed `destinations` or `destinations.<i>.<field>`.
 */
function validateSet(items, { imageIds }) {
  const errors = {};
  const list = [];
  if (!Array.isArray(items) || items.length === 0) return { errors: { destinations: 'required' }, list };
  if (items.length > PLATFORMS.length) return { errors: { destinations: 'too_many' }, list };
  const own = new Set((imageIds || []).map(String));
  const seen = new Set();
  items.forEach((raw, i) => {
    const at = (f) => `destinations.${i}.${f}`;
    const it = raw && typeof raw === 'object' ? raw : {};
    if (!PLATFORMS.includes(it.platform)) { errors[at('platform')] = 'invalid'; return; }
    if (seen.has(it.platform)) { errors[at('platform')] = 'duplicate'; return; }
    seen.add(it.platform);
    const out = { platform: it.platform };

    // Caption: undefined/null = inherit; a string (even '') = this platform's own caption.
    if (it.captionOverride === undefined || it.captionOverride === null) out.captionOverride = null;
    else if (typeof it.captionOverride !== 'string') errors[at('captionOverride')] = 'invalid';
    else if (it.captionOverride.length > MAX_CAPTION) errors[at('captionOverride')] = 'too_long';
    else out.captionOverride = it.captionOverride;

    // Images: null = all of the content's images; otherwise a subset of them, in order.
    if (it.mediaOverrideIds === undefined || it.mediaOverrideIds === null) out.mediaOverrideIds = null;
    else if (!Array.isArray(it.mediaOverrideIds)) errors[at('mediaOverrideIds')] = 'invalid';
    else {
      const ids = it.mediaOverrideIds.map(String);
      if (new Set(ids).size !== ids.length) errors[at('mediaOverrideIds')] = 'duplicate';
      else if (ids.some((id) => !own.has(id))) errors[at('mediaOverrideIds')] = 'not_this_content';
      else out.mediaOverrideIds = ids;
    }

    if (it.scheduledAt === undefined || it.scheduledAt === null || it.scheduledAt === '') out.scheduledAt = null;
    else if (!isIsoDateTime(it.scheduledAt)) errors[at('scheduledAt')] = 'invalid_date';
    else out.scheduledAt = new Date(it.scheduledAt).toISOString();

    if (it.timezone === undefined || it.timezone === null || it.timezone === '') out.timezone = DEFAULT_TIMEZONE;
    else if (!isValidTimezone(it.timezone)) errors[at('timezone')] = 'invalid';
    else out.timezone = it.timezone;

    // Automatic posting is switched on per platform with Post now / Schedule (services/publisher.js), never through this list.
    if (it.mode !== undefined && it.mode !== 'manual') errors[at('mode')] = 'auto_unavailable';

    list.push(out);
  });
  return { errors, list };
}

/** Did a change alter what would be posted? (Invalidates approval once auto publishing exists.) */
function isMaterialChange(before, after) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const time = (v) => (v ? new Date(v).toISOString() : null);
  return !same(before.captionOverride, after.captionOverride)
    || !same(before.mediaOverrideIds, after.mediaOverrideIds)
    || time(before.scheduledAt) !== time(after.scheduledAt)
    || !same(before.timezone, after.timezone);
}

/**
 * The content-level state implied by its destinations. A content item is
 * "published" only when every destination is — partial success never counts
 * as fully published.
 * @returns {object|null} fields to write on the content, or null if nothing changes
 */
function rollup(content, destinations) {
  const list = destinations || [];
  if (!list.length) return null;
  const all = list.every((d) => d.status === 'published');
  if (all && content.status !== 'published') {
    const times = list.map((d) => d.postedAt).filter(Boolean).sort();
    const urls = list.map((d) => d.externalPostUrl).filter(Boolean);
    return {
      status: 'published',
      postedAt: times[times.length - 1] ?? new Date().toISOString(),
      postUrl: list.length === 1 ? (urls[0] ?? content.postUrl ?? null) : (content.postUrl || urls[0] || null),
    };
  }
  if (!all && content.status === 'published') {
    return { status: content.scheduledDate ? 'scheduled' : 'approved', postedAt: null };
  }
  return null;
}

/** Effective values a member posts manually (override or inherited). */
function effective(content, d, orderedImageIds) {
  const ids = (orderedImageIds || []).map(String);
  const own = new Set(ids);
  return {
    caption: d.captionOverride ?? content.caption ?? '',
    imageIds: d.mediaOverrideIds ? d.mediaOverrideIds.map(String).filter((id) => own.has(id)) : ids,
    scheduledAt: d.scheduledAt ?? null,
  };
}

module.exports = { PLATFORMS, MAX_CAPTION, DEFAULT_TIMEZONE, destinationKey, isValidTimezone, isHttpUrl, isIsoDateTime, validateSet, isMaterialChange, rollup, effective };
