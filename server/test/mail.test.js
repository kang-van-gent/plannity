'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const templates = require('../src/services/mail/templates');
const mail = require('../src/services/mail');

const silent = { info() {}, warn() {}, error() {} };
const fakeStrapi = (user = null) => ({ log: silent, db: { query: () => ({ findOne: async () => user }) } });

function withEnv(env, fn) {
  const keys = ['MAIL_ENABLED', 'INVITE_EMAIL_ENABLED', 'BREVO_API_KEY', 'MAIL_FROM_EMAIL', 'MAIL_FROM_NAME', 'MAIL_REPLY_TO', 'FRONTEND_URL'];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  return Promise.resolve(fn()).finally(() => {
    for (const k of keys) { if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k]; }
  });
}

test('templates escape every value and localize', () => {
  const th = templates.invitation({ locale: 'th', siteUrl: 'https://plannity.space', inviterName: '<b>Eve</b>', brandName: 'Café "A"', role: 'editor', link: 'https://plannity.space/invite/x', expiresAt: '2026-12-05T10:00:00Z' });
  assert.ok(!th.html.includes('<b>Eve</b>'));
  assert.ok(th.html.includes('&lt;b&gt;Eve&lt;/b&gt;'));
  assert.ok(th.html.includes('ผู้แก้ไข'));
  assert.match(th.subject, /ชวนคุณร่วมทีม/);
  assert.ok(th.html.includes('https://plannity.space/brand/logo-lockup.png'));
  const en = templates.invitation({ locale: 'en', siteUrl: 'https://plannity.space', inviterName: 'Eve', brandName: 'Café', role: 'admin', link: 'https://x.test/i', expiresAt: '2026-12-05T10:00:00Z' });
  assert.match(en.subject, /Eve invited you to Café/);
  assert.ok(en.text.includes('Accept invitation: https://x.test/i'));
});

test('recipients accept names, lists and drop junk', () => {
  assert.deepEqual(mail.recipients('Kim <kim@a.co>, bob@b.co, nope'), [{ email: 'kim@a.co', name: 'Kim' }, { email: 'bob@b.co' }]);
  assert.deepEqual(mail.recipients([{ email: 'x@y.zz', name: 'X' }]), [{ email: 'x@y.zz', name: 'X' }]);
});

test('ready only when switched on with a key and a sender; old INVITE_EMAIL_ENABLED still works', () => withEnv({}, () => {
  assert.equal(mail.ready(), false);
  process.env.MAIL_ENABLED = 'true';
  assert.equal(mail.ready(), false);
  process.env.BREVO_API_KEY = 'k'; process.env.MAIL_FROM_EMAIL = 'no-reply@plannity.space';
  assert.equal(mail.ready(), true);
  delete process.env.MAIL_ENABLED; process.env.INVITE_EMAIL_ENABLED = 'true';
  assert.equal(mail.ready(), true);
}));

test('Strapi reset/confirm markers become the designed email in the user\'s language', () => withEnv({ FRONTEND_URL: 'https://plannity.space/' }, async () => {
  const filled = (tpl, vars) => tpl.replace(/<%= (\w+) %>/g, (_, k) => vars[k]);
  const reset = filled(mail.AUTH_TEMPLATES.reset_password.message, { URL: 'null', TOKEN: 'abc123' });
  const out = await mail.fromMarker(fakeStrapi({ locale: 'en', name: 'Kim' }), reset, 'kim@a.co');
  assert.equal(out.subject, 'Reset your password — Plannity');
  assert.ok(out.html.includes('https://plannity.space/reset-password?code=abc123'), 'empty page setting falls back to the app page');
  assert.ok(out.html.includes('Hi Kim,'));

  const confirm = filled(mail.AUTH_TEMPLATES.email_confirmation.message, { URL: 'https://api.plannity.space/api/auth/email-confirmation', CODE: 'c0de' });
  const th = await mail.fromMarker(fakeStrapi(null), confirm, 'new@a.co');
  assert.match(th.subject, /ยืนยันอีเมล/);
  assert.ok(th.html.includes('https://api.plannity.space/api/auth/email-confirmation?confirmation=c0de'));

  assert.equal(await mail.fromMarker(fakeStrapi(), '<p>hello</p>', 'a@b.co'), null);
}));

test('sends through the Brevo API with the configured sender', () => withEnv({ MAIL_ENABLED: 'true', BREVO_API_KEY: 'xkeysib-test', MAIL_FROM_EMAIL: 'no-reply@plannity.space', MAIL_FROM_NAME: 'Plannity', MAIL_REPLY_TO: 'help@plannity.space' }, async () => {
  const realFetch = global.fetch;
  let call;
  global.fetch = async (url, init) => { call = { url, init }; return { ok: true, json: async () => ({ messageId: '<m1>' }) }; };
  try {
    const r = await mail.provider(fakeStrapi())
      .send({ to: 'kim@a.co', from: 'ignored@strapi.io', subject: 'Test', text: 'hi', html: '<p>hi</p>' });
    assert.deepEqual(r, { sent: true, messageId: '<m1>' });
    assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(call.init.headers['api-key'], 'xkeysib-test');
    const body = JSON.parse(call.init.body);
    assert.deepEqual(body.sender, { email: 'no-reply@plannity.space', name: 'Plannity' });
    assert.deepEqual(body.to, [{ email: 'kim@a.co' }]);
    assert.deepEqual(body.replyTo, { email: 'help@plannity.space' });

    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'unauthorized', message: 'Key not found' }) });
    await assert.rejects(() => mail.deliver(fakeStrapi(), { to: 'kim@a.co', subject: 's', html: 'h' }), /Brevo 401 unauthorized/);
    assert.equal(await mail.sendTemplate(fakeStrapi(), 'resetPassword', 'kim@a.co', { link: 'https://x' }), false, 'sendTemplate never throws');
  } finally {
    global.fetch = realFetch;
  }
}));

test('nothing is sent while mail is off', () => withEnv({}, async () => {
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('must not call Brevo'); };
  try {
    assert.deepEqual(await mail.deliver(fakeStrapi(), { to: 'a@b.co', subject: 's', html: 'h' }), { sent: false });
  } finally {
    global.fetch = realFetch;
  }
}));
