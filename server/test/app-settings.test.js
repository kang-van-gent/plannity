'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toEnv, sealSecrets, MAP } = require('../src/services/app-settings');
const { open } = require('../src/utils/secret-box');

const boot = { META_APP_ID: '111', SLIP2GO_API_URL: 'https://env.example', SLIP2GO_AUTO_APPROVE: 'false', PROMPTPAY_ID: '0811111111' };

test('admin fields override .env; empty fields fall back to .env', () => {
  const env = toEnv({ metaAppId: '222', slip2goApiUrl: '', slip2goAutoApprove: true, promptpayId: null, slip2goTimeoutMs: 20000 }, boot);
  assert.equal(env.META_APP_ID, '222');
  assert.equal(env.SLIP2GO_API_URL, 'https://env.example');
  assert.equal(env.SLIP2GO_AUTO_APPROVE, 'true');
  assert.equal(env.PROMPTPAY_ID, '0811111111');
  assert.equal(env.SLIP2GO_TIMEOUT_MS, '20000');
  assert.equal(env.TIKTOK_CLIENT_KEY, undefined);
  assert.deepEqual(toEnv(null, boot).META_APP_ID, '111');
});

test('a boolean switched off in the admin overrides true in .env', () => {
  assert.equal(toEnv({ slip2goAutoApprove: false }, { SLIP2GO_AUTO_APPROVE: 'true' }).SLIP2GO_AUTO_APPROVE, 'false');
});

test('secrets are encrypted on save, once, and decrypted for use', () => {
  const data = { metaAppSecret: '  abc123secret ', slip2goSecretKey: '', metaAppId: '222' };
  sealSecrets(data);
  assert.match(data.metaAppSecret, /^v1\./);
  assert.ok(!data.metaAppSecret.includes('abc123'));
  assert.equal(data.slip2goSecretKey, null);
  assert.equal(data.metaAppId, '222');
  const sealed = data.metaAppSecret;
  sealSecrets(data); // saving the form again (other field edited) keeps the same secret
  assert.equal(data.metaAppSecret, sealed);
  assert.equal(open(sealed), 'abc123secret');
  assert.equal(toEnv({ metaAppSecret: sealed }, {}).META_APP_SECRET, 'abc123secret');
  assert.equal(toEnv({ metaAppSecret: 'v1.broken.value.x' }, { META_APP_SECRET: 'from-env' }).META_APP_SECRET, 'from-env');
});

test('every schema field is mapped', () => {
  const schema = require('../src/api/app-setting/content-types/app-setting/schema.json');
  assert.deepEqual(Object.keys(schema.attributes).sort(), Object.keys(MAP).sort());
});
