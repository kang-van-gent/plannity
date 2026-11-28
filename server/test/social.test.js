'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seal, open } = require('../src/utils/secret-box');
const meta = require('../src/services/social/meta');
const tiktok = require('../src/services/social/tiktok');
const { SocialError } = require('../src/services/social/http');

test('secret box: round trip, fresh IV, tamper and wrong key rejected', () => {
  const a = seal('EAAB-page-token');
  const b = seal('EAAB-page-token');
  assert.notEqual(a, b);
  assert.ok(!a.includes('EAAB'));
  assert.equal(open(a), 'EAAB-page-token');
  const parts = a.split('.');
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'BB' : 'AA');
  assert.equal(open(parts.join('.')), null);
  assert.equal(open('garbage'), null);
  assert.equal(seal(null), null);
  const prev = process.env.SOCIAL_TOKEN_KEY;
  process.env.SOCIAL_TOKEN_KEY = 'another-key';
  assert.equal(open(a), null);
  if (prev === undefined) delete process.env.SOCIAL_TOKEN_KEY; else process.env.SOCIAL_TOKEN_KEY = prev;
});

test('meta: Graph errors map to actionable kinds', () => {
  const k = (status, error) => meta.classify(status, { error })?.kind;
  assert.equal(k(400, { code: 190, error_subcode: 460, type: 'OAuthException' }), 'auth');
  assert.equal(k(403, { code: 200 }), 'permission');
  assert.equal(k(403, { code: 10 }), 'permission');
  assert.equal(k(400, { code: 4 }), 'rate_limited');
  assert.equal(k(400, { code: 80001 }), 'rate_limited');
  assert.equal(k(500, { code: 2 }), 'unavailable');
  assert.equal(k(400, { code: 100 }), 'invalid');
  assert.equal(meta.classify(200, { data: [] }), null);
  assert.equal(meta.classify(400, { error: { code: 190, error_subcode: 463 } }).code, 'meta_190.463');
});

test('meta: authorize URL asks for publishing permissions, or uses a Login for Business configuration', () => {
  process.env.META_APP_ID = '123';
  let url = new URL(meta.authorizeUrl({ state: 's1', redirectUri: 'https://api.example.com/api/social/callback/meta' }));
  assert.equal(url.hostname, 'www.facebook.com');
  assert.equal(url.searchParams.get('state'), 's1');
  assert.equal(url.searchParams.get('client_id'), '123');
  for (const s of ['pages_manage_posts', 'instagram_content_publish', 'pages_show_list']) assert.ok(url.searchParams.get('scope').split(',').includes(s));
  process.env.META_LOGIN_CONFIG_ID = 'cfg9';
  url = new URL(meta.authorizeUrl({ state: 's1', redirectUri: 'x' }));
  assert.equal(url.searchParams.get('config_id'), 'cfg9');
  assert.equal(url.searchParams.get('scope'), null);
  delete process.env.META_LOGIN_CONFIG_ID; delete process.env.META_APP_ID;
});

test('tiktok: OAuth and API errors map to actionable kinds', () => {
  assert.equal(tiktok.classify(400, { error: 'invalid_grant', error_description: 'x' }).kind, 'auth');
  assert.equal(tiktok.classify(401, { error: { code: 'access_token_invalid' } }).kind, 'auth');
  assert.equal(tiktok.classify(403, { error: { code: 'scope_not_authorized' } }).kind, 'permission');
  assert.equal(tiktok.classify(429, { error: { code: 'rate_limit_exceeded' } }).kind, 'rate_limited');
  assert.equal(tiktok.classify(200, { data: {}, error: { code: 'ok' } }), null);
});

test('tiktok: authorize URL has comma-separated scopes and the state', () => {
  const url = new URL(tiktok.authorizeUrl({ state: 'st', redirectUri: 'https://api.example.com/api/social/callback/tiktok' }));
  assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.publish');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'st');
});

test('fake provider: refused in production, and a revoked Page fails the Meta test as "auth"', async () => {
  const http = require('../src/services/social/http');
  process.env.SOCIAL_FAKE = 'true';
  process.env.NODE_ENV = 'production';
  assert.equal(http.fakeMode(), false);
  process.env.NODE_ENV = 'test';
  assert.equal(http.fakeMode(), true);
  const ok = await meta.test({ platform: 'instagram', externalAccountId: '1784000111', scopes: [] }, 'fake-page-token-1110001');
  assert.ok(ok.checks.every((c) => c.ok));
  assert.deepEqual(ok.checks.map((c) => c.key), ['token', 'permissions', 'account', 'quota']);
  await assert.rejects(meta.test({ platform: 'facebook', externalAccountId: '1110003' }, 'fake-revoked-1110003'), (e) => e instanceof SocialError && e.kind === 'auth');
  const tt = await tiktok.test({ scopes: ['user.info.basic'] }, 'fake-tt-access-1');
  assert.equal(tt.checks.find((c) => c.key === 'permissions').ok, false);
  delete process.env.SOCIAL_FAKE;
});
