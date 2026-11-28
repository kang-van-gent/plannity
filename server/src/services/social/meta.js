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

module.exports = { authorizeUrl, exchange, test, configured, classify, NEEDED, DEFAULT_SCOPES };
