'use strict';

/**
 * TikTok adapter: Login Kit (OAuth v2) + Content Posting API.
 * Docs (read Nov 2026): developers.tiktok.com/docs/en/login-kit-web,
 * /docs/en/oauth-get-a-user-access-token, /docs/en/content-posting-api-reference-query-creator-info
 *
 * Env: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET,
 *      TIKTOK_AUDITED=true once TikTok approved Direct Post (until then posts can only be private).
 * Access tokens are short-lived and every refresh returns a NEW refresh token:
 * always store what comes back.
 */
const { request, SocialError, fakeMode } = require('./http');

const API = 'https://open.tiktokapis.com';
const SCOPES = ['user.info.basic', 'video.publish'];
const NEEDED = ['video.publish'];

const configured = () => fakeMode() || !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
const audited = () => process.env.TIKTOK_AUDITED === 'true';

/** OAuth errors ({ error, error_description }) and API errors ({ error: { code, message } }). */
function classify(status, body) {
  if (body && typeof body.error === 'string' && body.error) {
    const id = `tiktok_${body.error}`;
    if (['invalid_grant', 'access_denied', 'invalid_token'].includes(body.error)) return new SocialError('auth', id, body.error_description);
    return new SocialError('invalid', id, body.error_description);
  }
  const e = body?.error;
  if (e && typeof e === 'object' && e.code && e.code !== 'ok') {
    const id = `tiktok_${e.code}`;
    // Scope errors first: TikTok sends them as 401 too, and they aren't an expired login.
    if (e.code === 'scope_not_authorized' || e.code === 'scope_permission_missed') return new SocialError('permission', id, e.message);
    if (['access_token_invalid', 'token_not_authorized_for_specified_open_id'].includes(e.code) || status === 401) return new SocialError('auth', id, e.message);
    if (e.code === 'rate_limit_exceeded' || status === 429) return new SocialError('rate_limited', id, e.message);
    if (status >= 500) return new SocialError('unavailable', id, e.message);
    return new SocialError('invalid', id, e.message);
  }
  return null;
}

function authorizeUrl({ state, redirectUri }) {
  const q = { client_key: process.env.TIKTOK_CLIENT_KEY || 'fake-key', response_type: 'code', scope: SCOPES.join(','), redirect_uri: redirectUri, state };
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams(q)}`;
}

const tokenCall = (form) => request(`${API}/v2/oauth/token/`, {
  method: 'POST', classify,
  form: { client_key: process.env.TIKTOK_CLIENT_KEY || 'fake-key', client_secret: process.env.TIKTOK_CLIENT_SECRET || 'fake-secret', ...form },
});

const later = (seconds, now = Date.now()) => (seconds ? new Date(now + Number(seconds) * 1000).toISOString() : null);
const tokens = (r) => ({
  accessToken: r.access_token, refreshToken: r.refresh_token,
  tokenExpiresAt: later(r.expires_in), refreshExpiresAt: later(r.refresh_expires_in),
  scopes: String(r.scope || '').split(',').map((s) => s.trim()).filter(Boolean), openId: r.open_id,
});

// Only user.info.basic fields: `username` needs user.info.profile, which we don't request.
async function userInfo(accessToken) {
  const r = await request(`${API}/v2/user/info/?fields=open_id,avatar_url,display_name`, { headers: { authorization: `Bearer ${accessToken}` }, classify });
  const u = r?.data?.user || {};
  return { openId: u.open_id, displayName: u.display_name ?? null, username: null, avatarUrl: u.avatar_url ?? null };
}

const creatorInfoRaw = async (accessToken) => (await request(`${API}/v2/post/publish/creator_info/query/`, { method: 'POST', json: {}, headers: { authorization: `Bearer ${accessToken}` }, classify }))?.data || {};

/** Code → tokens + the account they belong to. */
async function exchange({ code, redirectUri }) {
  const t = tokens(await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }));
  const user = await userInfo(t.accessToken);
  // Best effort: the @username comes from creator_info (video.publish), not user.info.basic.
  try { user.username = (await creatorInfoRaw(t.accessToken)).creator_username ?? null; } catch { /* shown after "Test connection" */ }
  return { ...t, user: { ...user, openId: user.openId || t.openId } };
}

const refresh = async (refreshToken) => tokens(await tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken }));

/** Connection test — reads only, never posts. `creator_info` is what TikTok requires before every post. */
async function test(conn, accessToken) {
  const checks = [{ key: 'token', ok: true }];
  const missing = NEEDED.filter((s) => !(conn.scopes || []).includes(s));
  checks.push({ key: 'permissions', ok: !missing.length, missing });
  const d = await creatorInfoRaw(accessToken);
  checks.push({ key: 'account', ok: true, name: d.creator_username ? `@${d.creator_username}` : d.creator_nickname });
  const options = Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [];
  checks.push({ key: 'canPost', ok: options.length > 0, privacyOptions: options, privateOnly: !audited() });
  return { checks, profile: { displayName: d.creator_nickname ?? null, username: d.creator_username ?? null, avatarUrl: d.creator_avatar_url ?? null } };
}

/** Best effort: tells TikTok to forget the authorization. */
async function revoke(accessToken) {
  await request(`${API}/v2/oauth/revoke/`, { method: 'POST', classify, form: { client_key: process.env.TIKTOK_CLIENT_KEY || 'fake-key', client_secret: process.env.TIKTOK_CLIENT_SECRET || 'fake-secret', token: accessToken } });
}

/* ---- Publishing (photo posts: Plannity posts carry images, not video) ---- */

const PRIVACY = ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'];

/** What the posting screen must show before every TikTok post (TikTok's Direct Post rules). */
async function creatorInfo(accessToken) {
  const d = await creatorInfoRaw(accessToken);
  return {
    nickname: d.creator_nickname ?? null, username: d.creator_username ?? null, avatarUrl: d.creator_avatar_url ?? null,
    privacyOptions: Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [],
    commentDisabled: !!d.comment_disabled, privateOnly: !audited(),
  };
}

/**
 * Starts a Direct Post photo post (developers.tiktok.com/doc/content-posting-api-reference-photo-post).
 * TikTok downloads the images itself (PULL_FROM_URL: the image domain must be
 * verified in the TikTok app). Publishing finishes asynchronously → { jobId }.
 * @param {{ text: string, imageUrls: string[], options: { privacyLevel, allowComments, brandOrganic, brandedContent } }} p
 */
async function publishPhotos(conn, accessToken, { text, imageUrls, options = {} }) {
  if (!imageUrls.length) throw new SocialError('invalid', 'tiktok_needs_image', 'TikTok photo posts need at least one image');
  if (imageUrls.length > 35) throw new SocialError('invalid', 'tiktok_too_many_images', 'TikTok photo posts take up to 35 images');
  const info = await creatorInfo(accessToken);
  // Until TikTok audits the app, every post must be private (TikTok rejects anything else).
  const privacy = info.privateOnly ? 'SELF_ONLY' : options.privacyLevel;
  if (!PRIVACY.includes(privacy) || (info.privacyOptions.length && !info.privacyOptions.includes(privacy))) {
    throw new SocialError('invalid', 'tiktok_privacy_required', 'Choose who can see this TikTok post');
  }
  const clean = String(text || '').trim();
  const title = (clean.split('\n')[0] || '').slice(0, 90);
  const r = await request(`${API}/v2/post/publish/content/init/`, {
    method: 'POST', classify, headers: { authorization: `Bearer ${accessToken}` },
    json: {
      post_info: {
        title, description: clean.slice(0, 4000), privacy_level: privacy,
        disable_comment: info.commentDisabled || options.allowComments === false,
        auto_add_music: true,
        brand_content_toggle: !!options.brandedContent, brand_organic_toggle: !!options.brandOrganic,
      },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: imageUrls },
      post_mode: 'DIRECT_POST',
      media_type: 'PHOTO',
    },
  });
  const jobId = r?.data?.publish_id;
  if (!jobId) throw new SocialError('unavailable', 'tiktok_no_publish_id', 'TikTok did not start the post');
  return { jobId: String(jobId) };
}

/** Where an asynchronous TikTok post is: { state: 'processing'|'done'|'failed', postId?, url?, reason? }. */
async function publishStatus(conn, accessToken, jobId) {
  const r = await request(`${API}/v2/post/publish/status/fetch/`, { method: 'POST', classify, headers: { authorization: `Bearer ${accessToken}` }, json: { publish_id: jobId } });
  const d = r?.data || {};
  if (d.status === 'PUBLISH_COMPLETE') {
    const id = Array.isArray(d.publicaly_available_post_id) ? d.publicaly_available_post_id[0] : null;
    const user = conn.username ? `@${conn.username}` : null;
    return { state: 'done', postId: id ? String(id) : null, url: id && user ? `https://www.tiktok.com/${user}/photo/${id}` : null };
  }
  if (d.status === 'FAILED') return { state: 'failed', reason: String(d.fail_reason || 'failed').slice(0, 60) };
  return { state: 'processing' };
}

module.exports = { authorizeUrl, exchange, refresh, test, revoke, configured, audited, classify, creatorInfo, publishPhotos, publishStatus, SCOPES, NEEDED, PRIVACY };
