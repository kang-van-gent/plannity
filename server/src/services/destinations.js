'use strict';

/**
 * Publish destinations: one row per platform a content item goes to
 * (plannity-context-social-publishing.md §3). Rules live in utils/destinations.js;
 * this file reads and writes them. Nothing here contacts a social network:
 * automatic posting (Post now / Schedule / the worker) is services/publisher.js.
 */
const { randomUUID } = require('node:crypto');
const { record } = require('./activity');
const { PLATFORMS, DEFAULT_TIMEZONE, destinationKey, isMaterialChange, rollup, effective, isHttpUrl, isIsoDateTime } = require('../utils/destinations');
const { orderImages } = require('../utils/image-order');

const DEST = 'api::publish-destination.publish-destination';
const CONTENT = 'api::content.content';

/** Response shape for the app. Overrides pointing at removed images are dropped. */
function view(d, contentDocumentId, imageIds) {
  const own = imageIds ? new Set(imageIds.map(String)) : null;
  const media = Array.isArray(d.mediaOverrideIds) ? d.mediaOverrideIds.map(String).filter((id) => !own || own.has(id)) : null;
  return {
    id: d.documentId,
    contentId: contentDocumentId,
    platform: d.platform,
    captionOverride: d.captionOverride ?? null,
    mediaOverrideIds: media,
    scheduledAt: d.scheduledAt ?? null,
    timezone: d.timezone || DEFAULT_TIMEZONE,
    mode: d.mode,
    status: d.status,
    revision: d.revision,
    externalPostUrl: d.externalPostUrl ?? null,
    publishedAt: d.postedAt ?? null,
    lastErrorCode: d.lastErrorCode ?? null,
    lastErrorMessage: d.lastErrorMessage ?? null,
    /** When an automatic post will go out (scheduled), UTC. */
    dueAt: d.status === 'scheduled' ? d.nextAttemptAt ?? null : null,
    options: d.options ?? null,
    updatedAt: d.updatedAt,
  };
}

/** Content fields the app needs after a destination change moved the content's own state. */
const contentPatchView = (c) => ({ status: c.status, version: c.version, publishedAt: c.postedAt ?? null, postUrl: c.postUrl ?? null, platform: c.platform });

async function listFor(strapi, contentDocumentId) {
  return strapi.documents(DEST).findMany({ filters: { content: { documentId: contentDocumentId } }, sort: 'id:asc', limit: PLATFORMS.length * 2 });
}

/** Destinations for many content items at once (lists, calendar). */
async function listForMany(strapi, contentDocumentIds) {
  const out = new Map(contentDocumentIds.map((id) => [id, []]));
  if (!contentDocumentIds.length) return out;
  const rows = await strapi.documents(DEST).findMany({
    filters: { content: { documentId: { $in: contentDocumentIds } } }, populate: { content: { fields: ['documentId'] } }, sort: 'id:asc', limit: contentDocumentIds.length * PLATFORMS.length,
  });
  for (const r of rows) out.get(r.content?.documentId)?.push(r);
  return out;
}

async function orderedImageIds(strapi, contentDocumentId) {
  const c = await strapi.db.query(CONTENT).findOne({ where: { documentId: contentDocumentId }, select: ['id', 'imageOrder'], populate: { images: { select: ['id'] } } });
  return orderImages(c?.images ?? [], c?.imageOrder).map((i) => String(i.id));
}

function createRow(strapi, content, brandDocumentId, platform, extra = {}, userId = null) {
  return strapi.documents(DEST).create({
    data: {
      content: content.documentId, brand: brandDocumentId, platform, destinationKey: destinationKey(content.documentId, platform),
      timezone: DEFAULT_TIMEZONE, mode: 'manual', status: 'draft', revision: 1, attemptCount: 0, idempotencyKey: randomUUID(),
      ...(userId ? { addedBy: userId } : {}), ...extra,
    },
  });
}

/**
 * Every content item has at least one destination: its own `platform`. Content
 * already marked published keeps that state (date and link). Idempotent; never
 * queues anything for posting.
 */
async function ensureFor(strapi, contentDocumentId) {
  const existing = await listFor(strapi, contentDocumentId);
  if (existing.length) return existing;
  const c = await strapi.documents(CONTENT).findOne({ documentId: contentDocumentId, populate: { brand: { fields: ['documentId'] }, owner: { fields: ['id'] } } });
  if (!c || !PLATFORMS.includes(c.platform)) return [];
  const published = c.status === 'published';
  try {
    await createRow(strapi, c, c.brand?.documentId ?? null, c.platform, published ? { status: 'published', postedAt: c.postedAt ?? c.updatedAt, externalPostUrl: c.postUrl ?? null } : {}, c.owner?.id ?? null);
  } catch (e) {
    // Created concurrently (unique destinationKey) — fine, read it back.
    if (!/unique/i.test(String(e?.message))) throw e;
  }
  return listFor(strapi, contentDocumentId);
}

/** Writes the content-level consequence of a destination change (status/date/link), bumping its version. */
async function applyRollup(strapi, contentDocumentId, extra = {}) {
  const c = await strapi.documents(CONTENT).findOne({ documentId: contentDocumentId });
  const dests = await listFor(strapi, contentDocumentId);
  const patch = { ...(rollup(c, dests) ?? {}), ...extra };
  for (const [k, v] of Object.entries(extra)) if (c[k] === v) delete patch[k];
  if (!Object.keys(patch).length) return { content: c, changed: false };
  const updated = await strapi.documents(CONTENT).update({ documentId: contentDocumentId, data: { ...patch, version: Number(c.version || 1) + 1 } });
  return { content: updated, changed: true, patch };
}

/**
 * Replaces a content item's platform list (validated by utils/destinations.validateSet).
 * Kept platforms keep their id and history; a published destination can't be
 * removed (undo "published" first) so the record of what went live stays.
 * @returns {{ error?: object, destinations?: object[], content?: object }}
 */
async function applySet(strapi, content, list, user) {
  const before = await ensureFor(strapi, content.documentId);
  const wanted = new Map(list.map((d) => [d.platform, d]));
  const removed = before.filter((d) => !wanted.has(d.platform));
  if (removed.some((d) => d.status === 'published' || d.status === 'publishing')) return { error: { destinations: 'published_cannot_remove' } };

  const brandDocumentId = content.brand?.documentId ?? null;
  const result = await strapi.db.transaction(async () => {
    for (const d of removed) await strapi.documents(DEST).delete({ documentId: d.documentId });
    for (const item of list) {
      const cur = before.find((d) => d.platform === item.platform);
      const fields = { captionOverride: item.captionOverride, mediaOverrideIds: item.mediaOverrideIds, scheduledAt: item.scheduledAt, timezone: item.timezone };
      if (!cur) await createRow(strapi, content, brandDocumentId, item.platform, fields, user.id);
      else if (isMaterialChange(cur, fields)) {
        await strapi.documents(DEST).update({ documentId: cur.documentId, data: { ...fields, revision: Number(cur.revision || 1) + 1, approvedRevision: null } });
      }
    }
    // The content's own `platform` stays one of its destinations (used by AI, CSV and older views).
    const keepPrimary = wanted.has(content.platform) ? {} : { platform: list[0].platform };
    return applyRollup(strapi, content.documentId, keepPrimary);
  });

  const from = before.map((d) => d.platform);
  const to = list.map((d) => d.platform);
  if (JSON.stringify(from) !== JSON.stringify(to)) {
    await record(strapi, {
      brandId: brandDocumentId, actor: user, action: 'content.platforms_changed', entityType: 'content',
      entityId: content.documentId, entityTitle: content.title, changes: [{ field: 'platform', from, to }],
    });
  }
  const imageIds = await orderedImageIds(strapi, content.documentId);
  const destinations = (await listFor(strapi, content.documentId)).map((d) => view(d, content.documentId, imageIds));
  return { destinations, content: result.changed ? contentPatchView(result.content) : null };
}

/**
 * Manual publishing: a member confirms this platform's post is live (or undoes it).
 * The content counts as published only once every platform is.
 */
async function markPublished(strapi, content, dest, input, user) {
  if (dest.mode !== 'manual') return { error: { mode: 'not_manual' } };
  const published = input?.published !== false;
  const errors = {};
  const url = typeof input?.postUrl === 'string' ? input.postUrl.trim() : input?.postUrl;
  if (url && !isHttpUrl(url)) errors.postUrl = 'invalid_url';
  let at = new Date().toISOString();
  if (published && input?.publishedAt) {
    if (!isIsoDateTime(input.publishedAt)) errors.publishedAt = 'invalid_date';
    else if (Date.parse(input.publishedAt) > Date.now() + 5 * 60_000) errors.publishedAt = 'in_future';
    else at = new Date(input.publishedAt).toISOString();
  }
  if (Object.keys(errors).length) return { error: errors };

  const data = published
    ? { status: 'published', postedAt: at, ...(url !== undefined ? { externalPostUrl: url || null } : {}) }
    : { status: 'draft', postedAt: null };
  const result = await strapi.db.transaction(async () => {
    await strapi.documents(DEST).update({ documentId: dest.documentId, data });
    return applyRollup(strapi, content.documentId);
  });
  await record(strapi, {
    brandId: content.brand?.documentId, actor: user, action: published ? 'content.platform_published' : 'content.platform_unpublished', entityType: 'content',
    entityId: content.documentId, entityTitle: content.title, changes: [{ field: 'platform', from: null, to: dest.platform }],
  });
  const fresh = await strapi.documents(DEST).findOne({ documentId: dest.documentId });
  const imageIds = await orderedImageIds(strapi, content.documentId);
  return { destination: view(fresh, content.documentId, imageIds), content: result.changed ? contentPatchView(result.content) : null };
}

/**
 * Edits made through the content API that destinations must follow
 * (checked before the write — see `contentPrecheck`, applied after it here):
 *  - status to/from "published" on a single-platform post marks that platform too;
 *  - a changed `platform` renames the only, unpublished destination, or adds one.
 */
async function syncFromContent(strapi, existing, data) {
  const dests = await ensureFor(strapi, existing.documentId);
  const c = await strapi.documents(CONTENT).findOne({ documentId: existing.documentId, populate: { brand: { fields: ['documentId'] } } });
  if (!c) return;
  if (data.platform && PLATFORMS.includes(data.platform) && !dests.some((d) => d.platform === data.platform)) {
    if (dests.length === 1 && dests[0].status === 'draft') {
      await strapi.documents(DEST).update({ documentId: dests[0].documentId, data: { platform: data.platform, destinationKey: destinationKey(c.documentId, data.platform), revision: Number(dests[0].revision || 1) + 1, approvedRevision: null } });
    } else {
      await createRow(strapi, c, c.brand?.documentId ?? null, data.platform);
    }
  }
  const now = await listFor(strapi, c.documentId);
  if (now.length !== 1) return;
  const only = now[0];
  if (c.status === 'published' && only.status !== 'published') {
    await strapi.documents(DEST).update({ documentId: only.documentId, data: { status: 'published', postedAt: c.postedAt ?? new Date().toISOString(), externalPostUrl: c.postUrl ?? only.externalPostUrl ?? null } });
  } else if (c.status !== 'published' && only.status === 'published') {
    await strapi.documents(DEST).update({ documentId: only.documentId, data: { status: 'draft', postedAt: null } });
  } else if (c.status === 'published' && 'postUrl' in data && (data.postUrl ?? null) !== (only.externalPostUrl ?? null)) {
    await strapi.documents(DEST).update({ documentId: only.documentId, data: { externalPostUrl: data.postUrl ?? null } });
  }
}

/**
 * Field errors for a content-API edit that would misstate multi-platform
 * publishing: the whole post can't be marked published (or un-published) at
 * once when it goes to several platforms — that is done per platform.
 */
async function contentPrecheck(strapi, existing, data) {
  if (!('status' in data) || data.status === existing.status) return null;
  const dests = await listFor(strapi, existing.documentId);
  if (dests.length <= 1) return null;
  if (data.status === 'published' && !dests.every((d) => d.status === 'published')) return { status: 'publish_each_platform' };
  if (existing.status === 'published' && data.status !== 'published') return { status: 'unpublish_each_platform' };
  return null;
}

/**
 * Migration for content created before destinations existed: one manual
 * destination per item from its `platform`, keeping published state, date and
 * link. Idempotent and safe to re-run; it never schedules or posts anything.
 * Rollback = drop the publish_destinations table (content rows are untouched).
 */
async function backfill(strapi) {
  let created = 0;
  for (let round = 0; round < 10_000; round++) {
    const batch = await strapi.documents(CONTENT).findMany({ filters: { destinations: { id: { $null: true } } }, fields: ['documentId'], limit: 200 });
    if (!batch.length) break;
    let progress = 0;
    for (const c of batch) {
      try {
        const rows = await ensureFor(strapi, c.documentId);
        if (rows.length) { created++; progress++; }
      } catch (e) {
        strapi.log.error(`[destinations] backfill failed for content ${c.documentId}: ${e.message}`);
      }
    }
    if (!progress) break; // only items that can't be migrated are left (e.g. unknown platform) — don't spin
  }
  if (created) strapi.log.info(`[plannity] created publish destinations for ${created} existing content items`);
  return created;
}

module.exports = { DEST, view, contentPatchView, listFor, listForMany, orderedImageIds, ensureFor, applyRollup, applySet, markPublished, syncFromContent, contentPrecheck, backfill, effective };
