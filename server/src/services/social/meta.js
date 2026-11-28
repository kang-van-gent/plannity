'use strict';

/**
 * Meta adapter: Facebook Pages + the Instagram professional account linked to
 * each Page, through one "Facebook Login" consent (Graph API).
 * Docs (read Nov 2026): developers.facebook.com/docs/pages-api,
 * /docs/instagram-platform/content-publishing, /docs/facebook-login/guides/access-tokens/get-long-lived
 *
 * Env: META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION (default v27.0),
 *      META_LOGIN_CONFIG_ID (optional: Facebook Login for Business configuration;
 *      when set it replaces the scope list), META_SCOPES (optional override).
 */
const { request, SocialError, fakeMode } = require('./http');

const DEFAULT_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];
/** What each platform needs to publish (checked by "Test connection"). */
const NEEDED = { facebook: ['pages_manage_posts'], instagram: ['instagram_basic', 'instagram_content_publish'] };

const version = () => process.env.META_GRAPH_VERSION || 'v27.0';
const graph = (path) => `https://graph.facebook.com/${version()}${path}`;
const scopes = () => (process.env.META_SCOPES ? process.env.META_SCOPES.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_SCOPES);
const configured = () => fakeMode() || !!(process.env.META_APP_ID && process.env.META_APP_SECRET);

/** Graph API errors → one of SocialError's kinds (developers.facebook.com/docs/graph-api/guides/error-handling). */
function classify(status, body) {
  const e = body?.error;
  if (!e) return null;
  const code = Number(e.code);
  const sub = e.error_subcode ? `.${e.error_subcode}` : '';
  const id = `meta_${code}${sub}`;
  if (code === 190 || code === 102 || (e.type === 'OAuthException' && status === 401)) return new SocialError('auth', id, e.message);
  if (code === 10 || (code >= 200 && code <= 299)) return new SocialError('permission', id, e.message);
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80014)) return new SocialError('rate_limited', id, e.message);
  if (code === 1 || code === 2 || status >= 500) return new SocialError('unavailable', id, e.message);
  return new SocialError('invalid', id, e.message);
}

const get = (path, params) => request(`${graph(path)}?${new URLSearchParams(params)}`, { classify });

function authorizeUrl({ state, redirectUri }) {
  const q = { client_id: process.env.META_APP_ID || 'fake-app', redirect_uri: redirectUri, state, response_type: 'code' };
  if (process.env.META_LOGIN_CONFIG_ID) q.config_id = process.env.META_LOGIN_CONFIG_ID;
  else q.scope = scopes().join(',');
  return `https://www.facebook.com/${version()}/dialog/oauth?${new URLSearchParams(q)}`;
}

/**
 * Code → long-lived user token → the Pages this person can publish to, each
 * with its own Page token (long-lived Page tokens have no expiry date) and the
 * Instagram professional account linked to it, if any.
 */
async function exchange({ code, redirectUri }) {
  const app = { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET };
  const short = await get('/oauth/access_token', { ...app, redirect_uri: redirectUri, code });
  const long = await get('/oauth/access_token', { ...app, grant_type: 'fb_exchange_token', fb_exchange_token: short.access_token });
  const userToken = long.access_token;
  const granted = await get('/me/permissions', { access_token: userToken });
  const grantedScopes = (granted.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
  const pages = [];
  let after = null;
  for (let i = 0; i < 5; i++) { // at most 500 Pages
    const r = await get('/me/accounts', {
      access_token: userToken, limit: '100', ...(after ? { after } : {}),
      fields: 'id,name,access_token,tasks,picture{url},instagram_business_account{id,username,name,profile_picture_url}',
    });
    pages.push(...(r.data || []));
    after = r.paging?.next ? r.paging?.cursors?.after : null;
    if (!after) break;
  }
  return {
    scopes: grantedScopes,
    pages: pages.map((p) => ({
      id: String(p.id),
      name: p.name,
      pictureUrl: p.picture?.data?.url ?? null,
      canPost: !Array.isArray(p.tasks) || p.tasks.includes('CREATE_CONTENT'),
      token: p.access_token,
      instagram: p.instagram_business_account
        ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username ?? null, name: p.instagram_business_account.name ?? null, pictureUrl: p.instagram_business_account.profile_picture_url ?? null }
        : null,
    })),
  };
}

/**
 * Connection test — reads only, never posts.
 * Returns { checks: [{ key, ok, ... }], profile?: { displayName, username, avatarUrl } }.
 */
async function test(conn, token) {
  const checks = [];
  const appToken = `${process.env.META_APP_ID || 'fake-app'}|${process.env.META_APP_SECRET || 'fake-secret'}`;
  const dbg = (await get('/debug_token', { input_token: token, access_token: appToken })).data || {};
  checks.push({ key: 'token', ok: !!dbg.is_valid });
  if (!dbg.is_valid) throw new SocialError('auth', 'token_invalid', 'Meta no longer accepts this connection', { checks });
  const have = Array.isArray(dbg.scopes) ? dbg.scopes : conn.scopes || [];
  const missing = NEEDED[conn.platform].filter((s) => !have.includes(s));
  checks.push({ key: 'permissions', ok: !missing.length, missing });

  let profile;
  if (conn.platform === 'facebook') {
    const p = await get(`/${conn.externalAccountId}`, { access_token: token, fields: 'id,name,picture{url}' });
    profile = { displayName: p.name, username: null, avatarUrl: p.picture?.data?.url ?? null };
    checks.push({ key: 'account', ok: true, name: p.name });
  } else {
    const p = await get(`/${conn.externalAccountId}`, { access_token: token, fields: 'id,username,name,profile_picture_url' });
    profile = { displayName: p.name || p.username, username: p.username ?? null, avatarUrl: p.profile_picture_url ?? null };
    checks.push({ key: 'account', ok: true, name: p.username ? `@${p.username}` : p.name });
    const q = await get(`/${conn.externalAccountId}/content_publishing_limit`, { access_token: token, fields: 'quota_usage,config' });
    const row = (q.data || [])[0] || {};
    const used = Number(row.quota_usage ?? 0);
    const total = Number(row.config?.quota_total ?? 50);
    checks.push({ key: 'quota', ok: used < total, used, total });
  }
  return { checks, profile };
}

/* ---- Publishing -------------------------------------------------------- */

const post = (path, form) => request(graph(path), { method: 'POST', form, classify });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Facebook Page post (developers.facebook.com/docs/pages-api/posts).
 * No image → text post on the feed; one → a photo post; several → unpublished
 * photos attached to one feed post. Returns { postId, url }.
 * @param {{ text: string, imageUrls: string[] }} p  imageUrls must be public https URLs
 */
async function publishFacebook(conn, token, { text, imageUrls }) {
  const page = conn.externalAccountId;
  let postId;
  if (!imageUrls.length) {
    if (!text.trim()) throw new SocialError('invalid', 'empty_post', 'Nothing to post: add a caption or an image');
    postId = (await post(`/${page}/feed`, { access_token: token, message: text })).id;
  } else if (imageUrls.length === 1) {
    const r = await post(`/${page}/photos`, { access_token: token, url: imageUrls[0], ...(text ? { message: text } : {}), published: 'true' });
    postId = r.post_id || r.id;
  } else {
    const ids = [];
    for (const url of imageUrls) ids.push((await post(`/${page}/photos`, { access_token: token, url, published: 'false' })).id);
    const form = { access_token: token, ...(text ? { message: text } : {}) };
    ids.forEach((id, i) => { form[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    postId = (await post(`/${page}/feed`, form)).id;
  }
  return { postId: String(postId), url: `https://www.facebook.com/${postId}` };
}

/** Waits for an Instagram media container to be ready (images are usually ready within seconds). */
async function igReady(id, token) {
  for (let i = 0; i < 20; i++) {
    const r = await get(`/${id}`, { access_token: token, fields: 'status_code,status' });
    if (r.status_code === 'FINISHED') return;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new SocialError('invalid', `ig_container_${String(r.status_code).toLowerCase()}`, r.status || 'Instagram could not process the image');
    await wait(1500);
  }
  throw new SocialError('unavailable', 'ig_container_timeout', 'Instagram is still processing the image');
}

/**
 * Instagram feed post (developers.facebook.com/docs/instagram-platform/content-publishing):
 * one image, or a carousel of 2–10. JPEG only (the publisher converts other types).
 * Returns { postId, url }.
 */
async function publishInstagram(conn, token, { text, imageUrls }) {
  const ig = conn.externalAccountId;
  if (!imageUrls.length) throw new SocialError('invalid', 'ig_needs_image', 'Instagram posts need at least one image');
  if (imageUrls.length > 10) throw new SocialError('invalid', 'ig_too_many_images', 'Instagram carousels take up to 10 images');
  let container;
  if (imageUrls.length === 1) {
    container = (await post(`/${ig}/media`, { access_token: token, image_url: imageUrls[0], ...(text ? { caption: text } : {}) })).id;
  } else {
    const children = [];
    for (const url of imageUrls) {
      const id = (await post(`/${ig}/media`, { access_token: token, image_url: url, is_carousel_item: 'true' })).id;
      children.push(id);
    }
    for (const id of children) await igReady(id, token);
    container = (await post(`/${ig}/media`, { access_token: token, media_type: 'CAROUSEL', children: children.join(','), ...(text ? { caption: text } : {}) })).id;
  }
  await igReady(container, token);
  const mediaId = (await post(`/${ig}/media_publish`, { access_token: token, creation_id: container })).id;
  let url = null;
  try { url = (await get(`/${mediaId}`, { access_token: token, fields: 'permalink' })).permalink ?? null; } catch { /* the post is live; the link is a nicety */ }
  return { postId: String(mediaId), url };
}

module.exports = { authorizeUrl, exchange, test, configured, classify, publishFacebook, publishInstagram, NEEDED, DEFAULT_SCOPES };
