'use strict';

/**
 * Automatic publishing to connected accounts (Facebook Page, Instagram, TikTok).
 *
 *  Post now   publishNow()  → posts immediately (TikTok finishes asynchronously).
 *  Schedule   schedule()    → status "scheduled"; the worker posts it when due.
 *  Cancel     unschedule()  → back to a manual draft.
 *  Worker     runDue()      → every minute: posts what is due, follows TikTok
 *                             posts until they're live, retries brief outages.
 *
 * Safety:
 *  - a destination is claimed atomically (→ "publishing") before any network
 *    call, so two workers or a double click can never post twice;
 *  - a post whose outcome is unknown (server stopped mid-call) is marked failed
 *    with "unknown_outcome" and never retried automatically — the person checks
 *    the platform first;
 *  - only rate limits and outages are retried (3 attempts, backing off).
 *
 * Other platforms (YouTube, LINE, X, LinkedIn) stay manual: copy, post, mark posted.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const meta = require('./social/meta');
const tiktok = require('./social/tiktok');
const social = require('./social');
const { SocialError } = require('./social/http');
const { brandFeatures } = require('./entitlements');
const { record } = require('./activity');
const destinations = require('./destinations');
const { orderImages } = require('../utils/image-order');

const DEST = destinations.DEST;
const CONTENT = 'api::content.content';
const CONN = social.CONN;

/** Platforms Plannity can post to by itself, once the brand has connected them. */
const AUTO_PLATFORMS = ['facebook', 'instagram', 'tiktok'];
const MAX_ATTEMPTS = 3;
const TIKTOK_POLL_MS = 15_000;
const TIKTOK_GIVE_UP_MS = 30 * 60_000;
const STUCK_MS = 15 * 60_000;
const LABEL = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };

const apiUrl = () => String(process.env.PUBLIC_URL || 'http://localhost:1337').replace(/\/$/, '');

class PublishError extends Error {
  constructor(code, message, status = 409) { super(message || code); this.code = code; this.status = status; }
}

/* ---- What gets posted ----------------------------------------------------- */

/** The caption plus any of the post's hashtags it doesn't already contain (an own caption is used as written). */
function postText(content, dest) {
  if (dest.captionOverride !== null && dest.captionOverride !== undefined) return String(dest.captionOverride);
  const caption = String(content.caption || '').trim();
  const tags = (Array.isArray(content.hashtags) ? content.hashtags : []).map(String).filter((h) => h && !caption.includes(h));
  return [caption, tags.join(' ')].filter(Boolean).join('\n\n');
}

/** When this destination should go live (UTC ISO), or null when the post has no date and time. */
function dueAt(content, dest) {
  if (dest.scheduledAt) return new Date(dest.scheduledAt).toISOString();
  if (!content.scheduledDate || !/^\d{2}:\d{2}$/.test(content.scheduledTime || '')) return null;
  const d = new Date(`${content.scheduledDate}T${content.scheduledTime}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function imagesFor(strapi, content, dest) {
  const c = await strapi.db.query(CONTENT).findOne({
    where: { documentId: content.documentId }, select: ['id', 'imageOrder'],
    populate: { images: { select: ['id', 'url', 'mime', 'hash', 'ext', 'name'] } },
  });
  const ordered = orderImages(c?.images ?? [], c?.imageOrder);
  if (!Array.isArray(dest.mediaOverrideIds)) return ordered;
  const byId = new Map(ordered.map((f) => [String(f.id), f]));
  return dest.mediaOverrideIds.map((id) => byId.get(String(id))).filter(Boolean);
}

const publicUrl = (file) => (/^https?:\/\//.test(file.url) ? file.url : `${apiUrl()}${file.url}`);

/**
 * Instagram takes JPEG only and TikTok JPEG/WEBP: other images are converted
 * once into /uploads/social/<hash>.jpg (served publicly like every upload).
 */
async function jpegUrl(strapi, file) {
  if (/jpe?g/i.test(file.mime || '')) return publicUrl(file);
  const outDir = path.join(strapi.dirs.static.public, 'uploads', 'social');
  const name = `${crypto.createHash('sha1').update(`${file.hash || file.id}:${file.url}`).digest('hex').slice(0, 24)}.jpg`;
  const out = path.join(outDir, name);
  if (!fs.existsSync(out)) {
    let input;
    if (/^https?:\/\//.test(file.url)) {
      const res = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new PublishError('image_unreadable', 'An image could not be read from storage');
      input = Buffer.from(await res.arrayBuffer());
    } else {
      const root = path.resolve(strapi.dirs.static.public);
      input = path.resolve(root, `.${file.url}`);
      if (!input.startsWith(root + path.sep) || !fs.existsSync(input)) throw new PublishError('image_missing', 'An image of this post is missing');
    }
    fs.mkdirSync(outDir, { recursive: true });
    const sharp = require('sharp');
    await sharp(input, { animated: false }).flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toFile(out);
  }
  return `${apiUrl()}/uploads/social/${name}`;
}

/* ---- Checks ------------------------------------------------------------------ */

async function connectionFor(strapi, brandDocumentId, platform) {
  if (!brandDocumentId) return null;
  return strapi.documents(CONN).findFirst({ filters: { connectionKey: `${brandDocumentId}:${platform}` } });
}

/**
 * Everything that must hold before posting automatically. Throws PublishError
 * with a code the app explains (plan_required, not_connected, reconnect_required…).
 */
async function preflight(strapi, content, dest, { images } = {}) {
  if (!AUTO_PLATFORMS.includes(dest.platform)) throw new PublishError('manual_only', 'This platform is posted by hand');
  if (content.archivedAt) throw new PublishError('archived', 'This post is archived');
  const brandId = content.brand?.documentId;
  const f = await brandFeatures(strapi, brandId);
  if (f.locked) throw new PublishError('brand_locked', 'This brand is locked until its plan is renewed', 403);
  if (!f.features.socialConnections) throw new PublishError('plan_required', 'Automatic posting is part of Team and Studio', 403);
  const conn = await connectionFor(strapi, brandId, dest.platform);
  if (!conn) throw new PublishError('not_connected', `Connect ${LABEL[dest.platform]} in Social channels first`);
  if (conn.status !== 'connected') throw new PublishError('reconnect_required', `${LABEL[dest.platform]} needs to be connected again`);
  const list = images ?? (await imagesFor(strapi, content, dest));
  const text = postText(content, dest);
  if (dest.platform === 'instagram') {
    if (!list.length) throw new PublishError('ig_needs_image', 'Instagram posts need at least one image');
    if (list.length > 10) throw new PublishError('ig_too_many_images', 'Instagram carousels take up to 10 images');
    if (text.length > 2200) throw new PublishError('caption_too_long', 'Instagram captions are limited to 2,200 characters');
  }
  if (dest.platform === 'tiktok') {
    if (!list.length) throw new PublishError('tiktok_needs_image', 'TikTok photo posts need at least one image');
    if (list.length > 35) throw new PublishError('tiktok_too_many_images', 'TikTok photo posts take up to 35 images');
  }
  if (dest.platform === 'facebook' && !list.length && !text.trim()) throw new PublishError('empty_post', 'Add a caption or an image first');
  return { conn, images: list, text };
}

/** TikTok's posting choices, checked: privacy must be picked by the person (no default). */
function tiktokOptions(input, privateOnly) {
  const o = input && typeof input === 'object' ? input : {};
  const privacyLevel = privateOnly ? 'SELF_ONLY' : o.privacyLevel;
  if (!tiktok.PRIVACY.includes(privacyLevel)) throw new PublishError('tiktok_privacy_required', 'Choose who can see this TikTok post', 400);
  if (o.brandedContent && privacyLevel === 'SELF_ONLY' && !privateOnly) throw new PublishError('tiktok_branded_private', 'Branded content can’t be private', 400);
  return { privacyLevel, allowComments: o.allowComments !== false, brandOrganic: !!o.brandOrganic, brandedContent: !!o.brandedContent };
}

/* ---- State changes ------------------------------------------------------- */

async function load(strapi, destDocumentId) {
  const dest = await strapi.documents(DEST).findOne({ documentId: destDocumentId, populate: { content: { fields: ['documentId'] } } });
  if (!dest?.content) throw new PublishError('not_found', 'Not found', 404);
  const content = await strapi.documents(CONTENT).findOne({ documentId: dest.content.documentId, populate: { brand: { fields: ['documentId', 'name'] } } });
  if (!content) throw new PublishError('not_found', 'Not found', 404);
  return { dest, content };
}

/** Atomically moves a destination into "publishing". False if someone else got there first. */
async function claim(strapi, dest, from, extra = {}) {
  const r = await strapi.db.query(DEST).updateMany({
    where: { id: dest.id, status: { $in: from } },
    data: { status: 'publishing', mode: 'auto', lastErrorCode: null, lastErrorMessage: null, attemptCount: Number(dest.attemptCount || 0) + 1, externalJobId: null, publishStartedAt: new Date(), updatedAt: new Date(), ...extra },
  });
  return !!r?.count;
}

async function finish(strapi, content, dest, data, activity) {
  const result = await strapi.db.transaction(async () => {
    await strapi.documents(DEST).update({ documentId: dest.documentId, data });
    return destinations.applyRollup(strapi, content.documentId);
  });
  if (activity) {
    await record(strapi, {
      brandId: content.brand?.documentId, actor: activity.user ?? null, action: activity.action, entityType: 'content',
      entityId: content.documentId, entityTitle: content.title, changes: [{ field: 'platform', from: null, to: dest.platform }],
    }).catch(() => {});
  }
  return result;
}

/** Marks the connection as needing a new sign-in when the platform refused the token. */
async function flagConnection(strapi, conn, err) {
  if (!conn || !(err instanceof SocialError) || (err.kind !== 'auth' && err.kind !== 'permission')) return;
  await strapi.documents(CONN).update({ documentId: conn.documentId, data: { status: 'reconnect_required', lastCheckOk: false, lastCheckError: err.kind, lastCheckedAt: new Date().toISOString() } }).catch(() => {});
}

const errorCode = (e) => String(e?.code || e?.kind || 'unexpected').slice(0, 80);
const errorMessage = (e) => String(e?.message || '').slice(0, 300) || null;
const transient = (e) => e instanceof SocialError && (e.kind === 'rate_limited' || e.kind === 'unavailable');

/**
 * Posts one destination now. Used by "Post now" and by the worker for due posts.
 * @returns {Promise<{ state: 'published'|'publishing'|'failed'|'retrying', code?: string, message?: string }>}
 */
async function publish(strapi, destDocumentId, { user = null, options, scheduled = false } = {}) {
  const { dest, content } = await load(strapi, destDocumentId);
  if (dest.status === 'published') throw new PublishError('already_published', 'Already posted on this platform');
  if (dest.status === 'publishing') throw new PublishError('in_progress', 'Already posting');

  let prepared;
  try {
    prepared = await preflight(strapi, content, dest);
  } catch (e) {
    if (!scheduled) throw e;
    // Due but impossible (disconnected, plan ended, image removed…): fail visibly instead of retrying forever.
    await finish(strapi, content, dest, { status: 'failed', lastErrorCode: errorCode(e), lastErrorMessage: errorMessage(e), nextAttemptAt: null }, { action: 'content.autopost_failed' });
    return { state: 'failed', code: errorCode(e), message: e.message };
  }
  const { conn, images, text } = prepared;

  let opts = dest.options ?? null;
  if (dest.platform === 'tiktok') {
    const chosen = options !== undefined ? options : dest.options;
    opts = tiktokOptions(chosen, !tiktok.audited());
  }

  const from = scheduled ? ['scheduled'] : ['draft', 'scheduled', 'failed', 'paused'];
  if (!(await claim(strapi, dest, from, { options: opts, nextAttemptAt: null, ...(user ? { scheduledBy: user.id } : {}) }))) {
    throw new PublishError('in_progress', 'Already posting');
  }
  const attempt = Number(dest.attemptCount || 0) + 1;

  try {
    const token = await social.accessTokenFor(strapi, conn);
    const needJpeg = dest.platform !== 'facebook';
    const imageUrls = [];
    for (const f of images) imageUrls.push(needJpeg ? await jpegUrl(strapi, f) : publicUrl(f));

    if (dest.platform === 'tiktok') {
      const { jobId } = await tiktok.publishPhotos(conn, token, { text, imageUrls, options: opts });
      await strapi.documents(DEST).update({ documentId: dest.documentId, data: { externalJobId: jobId, nextAttemptAt: new Date(Date.now() + TIKTOK_POLL_MS).toISOString() } });
      return { state: 'publishing' };
    }
    const out = dest.platform === 'facebook'
      ? await meta.publishFacebook(conn, token, { text, imageUrls })
      : await meta.publishInstagram(conn, token, { text, imageUrls });
    await finish(strapi, content, dest, {
      status: 'published', postedAt: new Date().toISOString(), externalPostId: out.postId, externalPostUrl: out.url ?? null, nextAttemptAt: null,
    }, { user, action: 'content.autoposted' });
    return { state: 'published' };
  } catch (e) {
    if (!(e instanceof SocialError) && !(e instanceof PublishError)) strapi.log.error(`[publish] ${dest.platform} ${dest.documentId}: ${e.stack || e.message}`);
    await flagConnection(strapi, conn, e);
    if (scheduled && transient(e) && attempt < MAX_ATTEMPTS) {
      const next = new Date(Date.now() + 2 ** attempt * 60_000).toISOString(); // 2, 4 minutes
      await strapi.documents(DEST).update({ documentId: dest.documentId, data: { status: 'scheduled', nextAttemptAt: next, lastErrorCode: errorCode(e), lastErrorMessage: errorMessage(e) } });
      return { state: 'retrying', code: errorCode(e), message: e.message };
    }
    await finish(strapi, content, dest, { status: 'failed', lastErrorCode: errorCode(e), lastErrorMessage: errorMessage(e), nextAttemptAt: null }, { user, action: 'content.autopost_failed' });
    return { state: 'failed', code: errorCode(e), message: e.message };
  }
}

/** Schedules automatic posting at the post's (or this platform's own) date and time. */
async function schedule(strapi, destDocumentId, { user, options }) {
  const { dest, content } = await load(strapi, destDocumentId);
  if (dest.status === 'published' || dest.status === 'publishing') throw new PublishError('already_published', 'Already posted on this platform');
  const due = dueAt(content, dest);
  if (!due) throw new PublishError('needs_time', 'Set a date and time first', 400);
  if (Date.parse(due) <= Date.now() + 60_000) throw new PublishError('time_passed', 'That time has passed — post now instead', 400);
  await preflight(strapi, content, dest);
  const opts = dest.platform === 'tiktok' ? tiktokOptions(options !== undefined ? options : dest.options, !tiktok.audited()) : dest.options ?? null;
  await strapi.documents(DEST).update({
    documentId: dest.documentId,
    data: { mode: 'auto', status: 'scheduled', nextAttemptAt: due, options: opts, approvedRevision: dest.revision, attemptCount: 0, lastErrorCode: null, lastErrorMessage: null, scheduledBy: user.id },
  });
  await record(strapi, {
    brandId: content.brand?.documentId, actor: user, action: 'content.autopost_scheduled', entityType: 'content',
    entityId: content.documentId, entityTitle: content.title, changes: [{ field: 'platform', from: null, to: dest.platform }],
  }).catch(() => {});
  return { dueAt: due };
}

/** Cancels a scheduled (or failed) automatic post: back to a manual draft. */
async function unschedule(strapi, destDocumentId, { user }) {
  const { dest, content } = await load(strapi, destDocumentId);
  if (!['scheduled', 'failed', 'paused'].includes(dest.status)) throw new PublishError('not_scheduled', 'This platform isn’t scheduled');
  const r = await strapi.db.query(DEST).updateMany({
    where: { id: dest.id, status: { $in: ['scheduled', 'failed', 'paused'] } },
    data: { mode: 'manual', status: 'draft', nextAttemptAt: null, lastErrorCode: null, lastErrorMessage: null },
  });
  if (!r?.count) throw new PublishError('in_progress', 'Already posting');
  await record(strapi, {
    brandId: content.brand?.documentId, actor: user, action: 'content.autopost_cancelled', entityType: 'content',
    entityId: content.documentId, entityTitle: content.title, changes: [{ field: 'platform', from: dest.platform, to: null }],
  }).catch(() => {});
}

/**
 * Keeps scheduled posts in step with the post's date and time (called after
 * every content edit). Platforms with their own time aren't affected; a post
 * whose date or time was removed goes back to draft.
 */
async function followContent(strapi, contentDocumentId) {
  const content = await strapi.documents(CONTENT).findOne({ documentId: contentDocumentId });
  if (!content) return;
  const rows = await strapi.documents(DEST).findMany({ filters: { content: { documentId: contentDocumentId }, status: 'scheduled', scheduledAt: { $null: true } } });
  for (const d of rows) {
    const due = dueAt(content, d);
    if (!due) {
      await strapi.documents(DEST).update({ documentId: d.documentId, data: { status: 'draft', mode: 'manual', nextAttemptAt: null, lastErrorCode: 'date_removed', lastErrorMessage: null } });
    } else if (due !== (d.nextAttemptAt ? new Date(d.nextAttemptAt).toISOString() : null)) {
      await strapi.documents(DEST).update({ documentId: d.documentId, data: { nextAttemptAt: due } });
    }
  }
}

/** A platform's own time changed (Customize): move its schedule along. */
async function followDestination(strapi, destDocumentId) {
  const { dest, content } = await load(strapi, destDocumentId);
  if (dest.status !== 'scheduled') return;
  const due = dueAt(content, dest);
  if (!due) await strapi.documents(DEST).update({ documentId: dest.documentId, data: { status: 'draft', mode: 'manual', nextAttemptAt: null, lastErrorCode: 'date_removed' } });
  else await strapi.documents(DEST).update({ documentId: dest.documentId, data: { nextAttemptAt: due } });
}

/* ---- Worker -------------------------------------------------------------- */

let running = false;

async function pollTikTok(strapi, d) {
  const { content } = await load(strapi, d.documentId);
  const conn = await connectionFor(strapi, content.brand?.documentId, 'tiktok');
  const started = Date.parse(d.publishStartedAt || d.updatedAt || 0);
  try {
    if (!conn) throw new PublishError('not_connected', 'TikTok was disconnected while posting');
    const token = await social.accessTokenFor(strapi, conn);
    const s = await tiktok.publishStatus(conn, token, d.externalJobId);
    if (s.state === 'done') {
      await finish(strapi, content, d, { status: 'published', postedAt: new Date().toISOString(), externalPostId: s.postId, externalPostUrl: s.url, nextAttemptAt: null }, { action: 'content.autoposted' });
    } else if (s.state === 'failed') {
      await finish(strapi, content, d, { status: 'failed', lastErrorCode: `tiktok_${s.reason}`.slice(0, 80), lastErrorMessage: null, nextAttemptAt: null }, { action: 'content.autopost_failed' });
    } else if (Date.now() - started > TIKTOK_GIVE_UP_MS) {
      await finish(strapi, content, d, { status: 'failed', lastErrorCode: 'unknown_outcome', lastErrorMessage: 'TikTok took too long — check the TikTok app before trying again', nextAttemptAt: null }, { action: 'content.autopost_failed' });
    } else {
      await strapi.db.query(DEST).update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() + TIKTOK_POLL_MS).toISOString() } });
    }
  } catch (e) {
    if (transient(e)) {
      await strapi.db.query(DEST).update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() + TIKTOK_POLL_MS * 2).toISOString() } });
      return;
    }
    await flagConnection(strapi, conn, e);
    await finish(strapi, content, d, { status: 'failed', lastErrorCode: errorCode(e), lastErrorMessage: errorMessage(e), nextAttemptAt: null }, { action: 'content.autopost_failed' });
  }
}

/** One pass of the worker. Safe to run on several servers: every post is claimed before it's sent. */
async function runDue(strapi) {
  if (running) return;
  running = true;
  try {
    const now = new Date().toISOString();
    const due = await strapi.documents(DEST).findMany({ filters: { status: 'scheduled', mode: 'auto', nextAttemptAt: { $lte: now } }, sort: 'nextAttemptAt:asc', limit: 20 });
    for (const d of due) {
      try {
        const r = await publish(strapi, d.documentId, { scheduled: true });
        strapi.log.info(`[publish] scheduled ${d.platform} ${d.documentId}: ${r.state}${r.code ? ` (${r.code})` : ''}`);
      } catch (e) {
        if (!(e instanceof PublishError && e.code === 'in_progress')) strapi.log.error(`[publish] scheduled ${d.documentId}: ${e.message}`);
      }
    }
    const polling = await strapi.documents(DEST).findMany({ filters: { status: 'publishing', externalJobId: { $notNull: true }, nextAttemptAt: { $lte: now } }, limit: 20 });
    for (const d of polling) await pollTikTok(strapi, d).catch((e) => strapi.log.error(`[publish] TikTok status ${d.documentId}: ${e.message}`));

    // Stopped mid-post (restart/crash): we can't know whether it went out — never re-post blindly.
    const stuck = await strapi.documents(DEST).findMany({ filters: { status: 'publishing', externalJobId: { $null: true }, publishStartedAt: { $lt: new Date(Date.now() - STUCK_MS).toISOString() } }, limit: 20 });
    for (const d of stuck) {
      const { content } = await load(strapi, d.documentId);
      await finish(strapi, content, d, { status: 'failed', lastErrorCode: 'unknown_outcome', lastErrorMessage: 'Posting was interrupted — check the platform before trying again', nextAttemptAt: null }, { action: 'content.autopost_failed' });
    }
  } finally {
    running = false;
  }
}

/** TikTok's creator details for the posting screen (required before every TikTok post). */
async function tiktokCreator(strapi, brandDocumentId) {
  const conn = await connectionFor(strapi, brandDocumentId, 'tiktok');
  if (!conn) throw new PublishError('not_connected', 'Connect TikTok in Social channels first');
  try {
    const token = await social.accessTokenFor(strapi, conn);
    return await tiktok.creatorInfo(token);
  } catch (e) {
    await flagConnection(strapi, conn, e);
    throw e;
  }
}

/** Connected accounts that can post for a brand: { facebook: {...}, instagram: {...}, tiktok: {...} }. */
async function autoAccounts(strapi, brandDocumentId) {
  const rows = await strapi.documents(CONN).findMany({ filters: { brand: { documentId: brandDocumentId } }, limit: 10 });
  const out = {};
  for (const r of rows) {
    if (!AUTO_PLATFORMS.includes(r.platform)) continue;
    out[r.platform] = { id: r.documentId, status: r.status, displayName: r.displayName ?? null, username: r.username ?? null, avatarUrl: r.avatarUrl ?? null };
  }
  return out;
}

module.exports = {
  AUTO_PLATFORMS, PublishError, postText, dueAt, preflight, publish, schedule, unschedule, followContent, followDestination,
  runDue, tiktokCreator, autoAccounts, tiktokOptions,
};
