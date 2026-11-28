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
    if (['access_token_invalid', 'token_not_authorized_for_specified_open_id'].includes(e.code) || status === 401) return new SocialError('auth', id, e.message);
    if (e.code === 'scope_not_authorized' || e.code === 'scope_permission_missed') return new SocialError('permission', id, e.message);
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

async function userInfo(accessToken) {
  const r = await request(`${API}/v2/user/info/?fields=open_id,avatar_url,display_name,username`, { headers: { authorization: `Bearer ${accessToken}` }, classify });
  const u = r?.data?.user || {};
  return { openId: u.open_id, displayName: u.display_name ?? null, username: u.username ?? null, avatarUrl: u.avatar_url ?? null };
}

/** Code → tokens + the account they belong to. */
async function exchange({ code, redirectUri }) {
  const t = tokens(await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri }));
  const user = await userInfo(t.accessToken);
  return { ...t, user: { ...user, openId: user.openId || t.openId } };
}

const refresh = async (refreshToken) => tokens(await tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken }));

/** Connection test — reads only, never posts. `creator_info` is what TikTok requires before every post. */
async function test(conn, accessToken) {
  const checks = [{ key: 'token', ok: true }];
  const missing = NEEDED.filter((s) => !(conn.scopes || []).includes(s));
  checks.push({ key: 'permissions', ok: !missing.length, missing });
  const r = await request(`${API}/v2/post/publish/creator_info/query/`, { method: 'POST', json: {}, headers: { authorization: `Bearer ${accessToken}` }, classify });
  const d = r?.data || {};
  checks.push({ key: 'account', ok: true, name: d.creator_username ? `@${d.creator_username}` : d.creator_nickname });
  const options = Array.isArray(d.privacy_level_options) ? d.privacy_level_options : [];
  checks.push({ key: 'canPost', ok: options.length > 0, privacyOptions: options, privateOnly: !audited() });
  return { checks, profile: { displayName: d.creator_nickname ?? null, username: d.creator_username ?? null, avatarUrl: d.creator_avatar_url ?? null } };
}

/** Best effort: tells TikTok to forget the authorization. */
async function revoke(accessToken) {
  await request(`${API}/v2/oauth/revoke/`, { method: 'POST', classify, form: { client_key: process.env.TIKTOK_CLIENT_KEY || 'fake-key', client_secret: process.env.TIKTOK_CLIENT_SECRET || 'fake-secret', token: accessToken } });
}

module.exports = { authorizeUrl, exchange, refresh, test, revoke, configured, audited, classify, SCOPES, NEEDED };
