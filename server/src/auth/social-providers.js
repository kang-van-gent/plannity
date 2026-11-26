'use strict';

/**
 * Social sign-in (Google, Facebook, Apple) on top of users-permissions.
 *
 * Flow (all redirects, no tokens in browser JS):
 *   app  /auth/connect/:provider            (Nuxt server route)
 *   →    STRAPI /api/connect/:provider       (grant → provider consent screen)
 *   →    STRAPI /api/connect/:provider/callback
 *   →    app  /auth/callback/:provider   (the "redirect URL" below; Strapi keeps the
 *                                           provider tokens in its plannity.sess cookie)
 *   →    STRAPI /api/auth/:provider/callback  (server-to-server with that cookie forwarded;
 *                                           returns { jwt, user }). In production the
 *                                           cookie is set on SESSION_COOKIE_DOMAIN so the app sees it.
 *   →    app sets the HttpOnly JWT cookie and redirects into /app.
 *
 * Google and Facebook are built into users-permissions; we only switch them on
 * from env so no one has to click through the admin panel. Apple is not built
 * in, so it is registered as a custom provider here.
 *
 * Env (a provider stays disabled until its keys are present):
 *   PUBLIC_URL               public URL of this Strapi (used for provider redirect URIs)
 *   FRONTEND_URL             public URL of the Nuxt app
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   FACEBOOK_APP_ID / FACEBOOK_APP_SECRET
 *   APPLE_SERVICE_ID / APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY (contents of the .p8, \n allowed)
 */

const crypto = require('node:crypto');

const frontendCallback = (provider) =>
  `${String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '')}/auth/callback/${provider}`;

// ---------------------------------------------------------------------------
// Google + Facebook: built-in providers, configured from env at boot.
// ---------------------------------------------------------------------------
async function configureBuiltInProviders(strapi) {
  const store = strapi.store({ type: 'plugin', name: 'users-permissions', key: 'grant' });
  const grant = (await store.get()) || {};
  const env = process.env;

  const wanted = {
    google: { key: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET, scope: ['email', 'profile'] },
    facebook: { key: env.FACEBOOK_APP_ID, secret: env.FACEBOOK_APP_SECRET, scope: ['email'] },
  };

  let changed = false;
  for (const [name, cfg] of Object.entries(wanted)) {
    if (!cfg.key || !cfg.secret) continue; // leave whatever the admin configured
    grant[name] = {
      ...(grant[name] || {}),
      enabled: true,
      key: cfg.key,
      secret: cfg.secret,
      callback: frontendCallback(name),
      scope: cfg.scope,
    };
    changed = true;
  }
  if (changed) {
    await store.set({ value: grant });
    strapi.log.info('[plannity] social providers configured from env');
  }
}

// ---------------------------------------------------------------------------
// Apple: custom provider.
// ---------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Apple's client secret is an ES256 JWT signed with the .p8 key (valid ≤ 6 months). */
function appleClientSecret() {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SERVICE_ID, APPLE_PRIVATE_KEY } = process.env;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID }));
  const payload = b64url(JSON.stringify({
    iss: APPLE_TEAM_ID,
    iat: now,
    exp: now + 60 * 60 * 24 * 150, // 150 days; regenerated on every boot
    aud: 'https://appleid.apple.com',
    sub: APPLE_SERVICE_ID,
  }));
  const key = crypto.createPrivateKey(String(APPLE_PRIVATE_KEY).replace(/\\n/g, '\n'));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${header}.${payload}.${b64url(sig)}`;
}

let jwksCache = { at: 0, keys: [] };
async function appleKeys() {
  if (Date.now() - jwksCache.at < 60 * 60 * 1000 && jwksCache.keys.length) return jwksCache.keys;
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error('Could not load Apple signing keys');
  jwksCache = { at: Date.now(), keys: (await res.json()).keys || [] };
  return jwksCache.keys;
}

/** Verifies Apple's id_token (RS256, issuer, audience, expiry) and returns its claims. */
async function verifyAppleIdToken(idToken) {
  const [h, p, s] = String(idToken || '').split('.');
  if (!h || !p || !s) throw new Error('Missing Apple id_token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const jwk = (await appleKeys()).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('Unknown Apple signing key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('Invalid Apple id_token signature');
  if (claims.iss !== 'https://appleid.apple.com') throw new Error('Invalid Apple issuer');
  if (claims.aud !== process.env.APPLE_SERVICE_ID) throw new Error('Invalid Apple audience');
  if (claims.exp * 1000 < Date.now()) throw new Error('Apple id_token expired');
  return claims;
}

function appleEnabled() {
  const e = process.env;
  return Boolean(e.APPLE_SERVICE_ID && e.APPLE_TEAM_ID && e.APPLE_KEY_ID && e.APPLE_PRIVATE_KEY);
}

/** Must run in register(): the providers registry is read when grant is set up. */
function registerAppleProvider(strapi) {
  const enabled = appleEnabled();
  let secret = '';
  if (enabled) {
    try { secret = appleClientSecret(); } catch (e) { strapi.log.error(`[plannity] Apple sign-in disabled: ${e.message}`); }
  }
  strapi.plugin('users-permissions').service('providers-registry').add('apple', {
    icon: 'apple',
    enabled: enabled && Boolean(secret),
    grantConfig: {
      key: process.env.APPLE_SERVICE_ID || '',
      secret,
      callback: frontendCallback('apple'),
      scope: ['name', 'email'],
      authorize_url: 'https://appleid.apple.com/auth/authorize',
      access_url: 'https://appleid.apple.com/auth/token',
      oauth: 2,
      // Apple only returns email/name with form_post, i.e. it POSTs back to
      // /api/connect/apple/callback (see the users-permissions extension).
      custom_params: { response_mode: 'form_post' },
    },
    // `query` is the grant response Strapi kept in its session cookie (forwarded by the app).
    async authCallback({ query }) {
      const claims = await verifyAppleIdToken(query.id_token || (query.raw && query.raw.id_token));
      if (!claims.email) throw new Error('Apple did not share an email address');
      return { username: claims.email, email: claims.email };
    },
  });
}

module.exports = { configureBuiltInProviders, registerAppleProvider };
