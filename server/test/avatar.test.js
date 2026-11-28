'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const avatar = require('../src/services/avatar');

test('Gravatar URL: SHA-256 of the trimmed, lower-cased email; no image when none is set', () => {
  const hash = crypto.createHash('sha256').update('kim@example.com').digest('hex');
  assert.equal(avatar.gravatarUrl('  Kim@Example.com '), `https://gravatar.com/avatar/${hash}?s=400&d=404`);
});

function fakeStrapi(user) {
  const updates = [];
  return {
    updates,
    log: { warn() {} },
    db: { query: () => ({
      findOne: async ({ where }) => (user && where.email === user.email ? { ...user } : null),
      update: async ({ data }) => { updates.push(data); return { ...user, ...data }; },
    }) },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 30));

test('Google photo: used while the person has no photo, only remembered when they chose one', async () => {
  const fresh = fakeStrapi({ id: 1, email: 'kim@example.com', avatarSource: null });
  avatar.rememberGooglePhoto(fresh, 'Kim@Example.com', 'https://lh3.googleusercontent.com/a/abc=s96-c');
  await settle();
  assert.deepEqual(fresh.updates[0], { googleAvatarUrl: 'https://lh3.googleusercontent.com/a/abc=s400-c', avatarSource: 'google', avatarUrl: 'https://lh3.googleusercontent.com/a/abc=s400-c' });

  const chosen = fakeStrapi({ id: 2, email: 'kim@example.com', avatarSource: 'upload' });
  avatar.rememberGooglePhoto(chosen, 'kim@example.com', 'https://lh3.googleusercontent.com/a/xyz=s96-c');
  await settle();
  assert.deepEqual(chosen.updates[0], { googleAvatarUrl: 'https://lh3.googleusercontent.com/a/xyz=s400-c' });

  const ignored = fakeStrapi({ id: 3, email: 'kim@example.com' });
  avatar.rememberGooglePhoto(ignored, 'kim@example.com', 'http://insecure.example/p.jpg');
  await settle();
  assert.equal(ignored.updates.length, 0);
});
