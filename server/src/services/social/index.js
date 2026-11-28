'use strict';

/**
 * Brand social connections (plannity-context-social-publishing.md §3, §4, §8).
 *
 * Connect:  owner/admin → startConnect → Meta/TikTok consent screen →
 *           GET /api/social/callback/:provider (state checked, single-use) →
 *           TikTok: connected · Meta: the person picks one Page (its linked
 *           Instagram account comes with it) → choose().
 * Test:     reads from the platform with the stored token (never posts) and
 *           records the outcome. A revoked/expired token → "reconnect_required".
 * Tokens:   encrypted at rest (utils/secret-box), never sent to the browser or logged.
 */
const crypto = require('node:crypto');
const { seal, open, configured: keyConfigured } = require('../../utils/secret-box');
const { record } = require('../activity');
const { SocialError, fakeMode } = require('./http');
const meta = require('./meta');
const tiktok = require('./tiktok');

const CONN = 'api::social-connection.social-connection';
const REQ = 'api::social-connection.social-auth-request';
const PLATFORMS = ['facebook', 'instagram', 'tiktok'];
const PROVIDER_OF = { facebook: 'meta', instagram: 'meta', tiktok: 'tiktok' };
const ADAPTERS = { meta, tiktok };
const REQUEST_TTL_MS = 15 * 60_000;
const LABEL = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };

const trim = (s) => String(s).replace(/\/$/, '');
const apiUrl = () => trim(process.env.PUBLIC_URL || 'http://localhost:1337');
const appUrl = () => trim(process.env.FRONTEND_URL || 'http://localhost:3000');
const redirectUri = (provider) => `${apiUrl()}/api/social/callback/${provider}`;
const hash = (state) => crypto.createHash('sha256').update(String(state)).digest('hex');

function settings() {
  // Without SOCIAL_TOKEN_KEY (production) tokens can't be stored safely, so nothing is offered.
  const key = keyConfigured();
  return { meta: key && meta.configured(), tiktok: key && tiktok.configured(), fake: fakeMode(), tiktokPrivateOnly: !tiktok.audited() };
}

function view(c) {
  return {
    id: c.documentId, platform: c.platform, provider: c.provider,
    externalAccountId: c.externalAccountId, displayName: c.displayName ?? null, username: c.username ?? null, avatarUrl: c.avatarUrl ?? null,
    status: c.status, connectedAt: c.connectedAt ?? c.createdAt ?? null,
    connectedBy: c.connectedBy ? { id: String(c.connectedBy.id), name: c.connectedBy.name || c.connectedBy.username || c.connectedBy.email || null } : null,
    lastCheckedAt: c.lastCheckedAt ?? null, lastCheckOk: c.lastCheckOk ?? null, lastCheckError: c.lastCheckError ?? null, lastCheck: Array.isArray(c.lastCheck) ? c.lastCheck : null,
  };
}

const populate = { connectedBy: { fields: ['id', 'username', 'email', 'name'] } };

async function list(strapi, brandDocumentId) {
  const rows = await strapi.documents(CONN).findMany({ filters: { brand: { documentId: brandDocumentId } }, populate, limit: 10 });
  return PLATFORMS.map((p) => rows.find((r) => r.platform === p)).filter(Boolean).map(view);
}

async function findConnection(strapi, documentId) {
  return strapi.documents(CONN).findOne({ documentId, populate: { ...populate, brand: { fields: ['documentId', 'name'] } } });
}

/** Starts an OAuth attempt for one brand; returns the URL to send the browser to. */
async function startConnect(strapi, { brand, user, provider }) {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new SocialError('invalid', 'unknown_provider');
  if (!adapter.configured() || !keyConfigured()) throw new SocialError('invalid', 'not_configured');
  // Old attempts are useless after 15 minutes; tidy them up here.
  const stale = await strapi.documents(REQ).findMany({ filters: { expiresAt: { $lt: new Date(Date.now() - 86400_000).toISOString() } }, fields: ['documentId'], limit: 100 });
  for (const r of stale) await strapi.documents(REQ).delete({ documentId: r.documentId });

  const state = crypto.randomBytes(32).toString('base64url');
  await strapi.documents(REQ).create({
    data: { stateHash: hash(state), brand: brand.documentId, user: user.id, provider, status: 'pending', expiresAt: new Date(Date.now() + REQUEST_TTL_MS).toISOString() },
  });
  if (fakeMode()) return `${apiUrl()}/api/social/fake/authorize?${new URLSearchParams({ provider, state })}`;
  return adapter.authorizeUrl({ state, redirectUri: redirectUri(provider) });
}

const back = (brandId, params) => `${appUrl()}/app/brands/${brandId}/channels?${new URLSearchParams(params)}`;

/**
 * The browser comes back from Meta/TikTok. Always answers with a redirect into
 * the app (the user sees the result on the brand's Social channels tab).
 */
async function handleCallback(strapi, provider, query) {
  const req = query.state
    ? await strapi.documents(REQ).findFirst({ filters: { stateHash: hash(query.state) }, populate: { brand: { fields: ['documentId', 'name'] }, user: { fields: ['id', 'username', 'email', 'name'] } } })
    : null;
  if (!req || !req.brand || req.provider !== provider) return `${appUrl()}/app/brands?social=error&reason=expired`;
  const brandId = req.brand.documentId;
  const failWith = async (reason) => {
    await strapi.documents(REQ).update({ documentId: req.documentId, data: { status: 'failed', errorCode: reason, choicesEnc: null } });
    return back(brandId, { social: 'error', reason });
  };
  // A used state (page refresh, back button, replay) changes nothing.
  if (req.status !== 'pending') return back(brandId, { social: 'error', reason: 'expired' });
  if (Date.parse(req.expiresAt) < Date.now()) return failWith('expired');
  // Claim the attempt atomically so two simultaneous callbacks can't both use it.
  const claimed = await strapi.db.query(REQ).updateMany({ where: { id: req.id, status: 'pending' }, data: { status: 'exchanging' } });
  if (!claimed?.count) return back(brandId, { social: 'error', reason: 'expired' });
  if (query.error || !query.code) return failWith(query.error ? 'denied' : 'failed');

  try {
    if (provider === 'meta') {
      const out = await meta.exchange({ code: query.code, redirectUri: redirectUri('meta') });
      const usable = out.pages.filter((p) => p.canPost);
      if (!usable.length) return failWith('no_pages');
      await strapi.documents(REQ).update({ documentId: req.documentId, data: { status: 'choosing', choicesEnc: seal(JSON.stringify({ scopes: out.scopes, pages: usable })) } });
      return back(brandId, { social: 'choose', request: req.documentId });
    }
    const out = await tiktok.exchange({ code: query.code, redirectUri: redirectUri('tiktok') });
    if (!out.user.openId) return failWith('failed');
    await upsert(strapi, req.brand, req.user, 'tiktok', {
      externalAccountId: out.user.openId, displayName: out.user.displayName, username: out.user.username, avatarUrl: out.user.avatarUrl, scopes: out.scopes,
      accessTokenEnc: seal(out.accessToken), refreshTokenEnc: seal(out.refreshToken), tokenExpiresAt: out.tokenExpiresAt, refreshExpiresAt: out.refreshExpiresAt,
    });
    await strapi.documents(REQ).update({ documentId: req.documentId, data: { status: 'completed' } });
    return back(brandId, { social: 'connected', platform: 'tiktok' });
  } catch (e) {
    strapi.log.warn(`[social] ${provider} callback failed for brand ${brandId}: ${e.code || e.message}`);
    return failWith(e instanceof SocialError && e.kind === 'permission' ? 'permission' : 'failed');
  }
}

/** A Meta attempt waiting for the person to pick a Page. Only the person who started it may continue it. */
async function pendingRequest(strapi, requestId, brandDocumentId, user) {
  const req = await strapi.documents(REQ).findOne({ documentId: requestId, populate: { brand: { fields: ['documentId', 'name'] }, user: { fields: ['id', 'username', 'email', 'name'] } } });
  if (!req || req.brand?.documentId !== brandDocumentId || req.user?.id !== user.id) return { error: 'not_found' };
  if (req.status !== 'choosing' || Date.parse(req.expiresAt) < Date.now()) return { error: 'expired' };
  const data = JSON.parse(open(req.choicesEnc) || 'null');
  if (!data) return { error: 'expired' };
  return { req, data };
}

const choiceView = (p) => ({ id: p.id, name: p.name, pictureUrl: p.pictureUrl, instagram: p.instagram ? { id: p.instagram.id, username: p.instagram.username, name: p.instagram.name, pictureUrl: p.instagram.pictureUrl } : null });

async function choices(strapi, requestId, brandDocumentId, user) {
  const r = await pendingRequest(strapi, requestId, brandDocumentId, user);
  return r.error ? r : { pages: r.data.pages.map(choiceView) };
}

/** Connects the chosen Facebook Page, plus its Instagram account when one is linked. */
async function choose(strapi, requestId, brandDocumentId, user, pageId) {
  const r = await pendingRequest(strapi, requestId, brandDocumentId, user);
  if (r.error) return r;
  const page = r.data.pages.find((p) => p.id === String(pageId));
  if (!page) return { error: 'not_found' };
  const token = seal(page.token);
  const base = { scopes: r.data.scopes, accessTokenEnc: token, refreshTokenEnc: null, tokenExpiresAt: null, refreshExpiresAt: null };
  await upsert(strapi, r.req.brand, user, 'facebook', { ...base, externalAccountId: page.id, displayName: page.name, username: null, avatarUrl: page.pictureUrl, parentAccountId: null });
  if (page.instagram) {
    await upsert(strapi, r.req.brand, user, 'instagram', {
      ...base, externalAccountId: page.instagram.id, parentAccountId: page.id,
      displayName: page.instagram.name || page.instagram.username, username: page.instagram.username, avatarUrl: page.instagram.pictureUrl,
    });
  }
  await strapi.documents(REQ).update({ documentId: r.req.documentId, data: { status: 'completed', choicesEnc: null } });
  return { connected: page.instagram ? ['facebook', 'instagram'] : ['facebook'] };
}

async function upsert(strapi, brand, user, platform, data) {
  const key = `${brand.documentId}:${platform}`;
  const existing = await strapi.documents(CONN).findFirst({ filters: { connectionKey: key } });
  const row = {
    ...data, brand: brand.documentId, platform, provider: PROVIDER_OF[platform], connectionKey: key, status: 'connected',
    connectedBy: user.id, connectedAt: new Date().toISOString(), lastCheckedAt: null, lastCheckOk: null, lastCheckError: null, lastCheck: null,
  };
  if (existing) await strapi.documents(CONN).update({ documentId: existing.documentId, data: row });
  else await strapi.documents(CONN).create({ data: row });
  await record(strapi, {
    brandId: brand.documentId, actor: user, action: 'social.connected', entityType: 'brand', entityId: brand.documentId,
    entityTitle: `${LABEL[platform]} · ${data.username ? `@${data.username}` : data.displayName || data.externalAccountId}`,
  });
}

/** A usable access token for the connection (TikTok tokens are refreshed when close to expiry). */
async function accessTokenFor(strapi, conn) {
  const token = open(conn.accessTokenEnc);
  if (!token) throw new SocialError('auth', 'token_unreadable', 'The stored token cannot be read (SOCIAL_TOKEN_KEY changed?)');
  if (conn.provider !== 'tiktok') return token;
  const soon = Date.now() + 10 * 60_000;
  if (conn.tokenExpiresAt && Date.parse(conn.tokenExpiresAt) > soon) return token;
  const rt = open(conn.refreshTokenEnc);
  if (!rt || (conn.refreshExpiresAt && Date.parse(conn.refreshExpiresAt) < Date.now())) throw new SocialError('auth', 'refresh_expired', 'TikTok sign-in expired');
  const t = await tiktok.refresh(rt);
  await strapi.documents(CONN).update({
    documentId: conn.documentId,
    data: { accessTokenEnc: seal(t.accessToken), refreshTokenEnc: seal(t.refreshToken || rt), tokenExpiresAt: t.tokenExpiresAt, refreshExpiresAt: t.refreshExpiresAt || conn.refreshExpiresAt, ...(t.scopes.length ? { scopes: t.scopes } : {}) },
  });
  if (t.scopes.length) conn.scopes = t.scopes;
  return t.accessToken;
}

/**
 * "Test connection": checks the token, permissions and account, and that the
 * account can post right now — without posting anything.
 * → { ok, errorKind, errorCode, checks, connection }
 */
async function test(strapi, conn) {
  let checks = [];
  let errorKind = null;
  let errorCode = null;
  let profile = null;
  try {
    const token = await accessTokenFor(strapi, conn);
    const out = await ADAPTERS[conn.provider].test(conn, token);
    checks = out.checks;
    profile = out.profile;
  } catch (e) {
    if (!(e instanceof SocialError)) { strapi.log.error(`[social] test ${conn.documentId}: ${e.message}`); e = new SocialError('unavailable', 'unexpected'); }
    errorKind = e.kind;
    errorCode = String(e.code || e.kind).slice(0, 80);
    checks = Array.isArray(e.checks) ? e.checks : checks;
    if (!checks.some((c) => !c.ok)) checks.push({ key: e.kind === 'auth' ? 'token' : 'reach', ok: false });
  }
  const ok = !errorKind && checks.every((c) => c.ok);
  if (!errorKind && !ok) errorKind = checks.find((c) => !c.ok)?.key === 'permissions' ? 'permission' : 'limit';
  const data = {
    lastCheckedAt: new Date().toISOString(), lastCheckOk: ok, lastCheckError: ok ? null : errorKind, lastCheck: checks,
    // A revoked token or a missing permission needs the person to connect again; a network blip doesn't.
    status: errorKind === 'auth' || errorKind === 'permission' ? 'reconnect_required' : ok ? 'connected' : conn.status,
    ...(profile ? Object.fromEntries(Object.entries({ displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl }).filter(([, v]) => v !== null && v !== undefined)) : {}),
  };
  await strapi.documents(CONN).update({ documentId: conn.documentId, data });
  const fresh = await findConnection(strapi, conn.documentId);
  return { ok, errorKind, errorCode, checks, connection: view(fresh) };
}

async function disconnect(strapi, conn, user) {
  if (conn.provider === 'tiktok') {
    const others = await strapi.documents(CONN).count({ filters: { platform: 'tiktok', externalAccountId: conn.externalAccountId, documentId: { $ne: conn.documentId } } });
    const token = open(conn.accessTokenEnc);
    if (!others && token) { try { await tiktok.revoke(token); } catch (e) { strapi.log.warn(`[social] TikTok revoke failed: ${e.code || e.message}`); } }
  }
  await strapi.documents(CONN).delete({ documentId: conn.documentId });
  await record(strapi, {
    brandId: conn.brand?.documentId, actor: user, action: 'social.disconnected', entityType: 'brand', entityId: conn.brand?.documentId,
    entityTitle: `${LABEL[conn.platform]} · ${conn.username ? `@${conn.username}` : conn.displayName || conn.externalAccountId}`,
  });
}

module.exports = { settings, list, view, findConnection, startConnect, handleCallback, choices, choose, test, disconnect, accessTokenFor, PLATFORMS, CONN, REQ };
