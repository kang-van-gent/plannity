'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SOCIAL_FAKE = 'true'; // adapters talk to services/social/fake.js
const publisher = require('../src/services/publisher');
const meta = require('../src/services/social/meta');
const tiktok = require('../src/services/social/tiktok');

test('posted text: caption plus missing hashtags; an own caption is used as written', () => {
  const content = { caption: 'New menu! #coffee', hashtags: ['#coffee', '#bangkok'] };
  assert.equal(publisher.postText(content, { captionOverride: null }), 'New menu! #coffee\n\n#bangkok');
  assert.equal(publisher.postText({ caption: '', hashtags: ['#a'] }, { captionOverride: null }), '#a');
  assert.equal(publisher.postText(content, { captionOverride: 'Only this' }), 'Only this');
  assert.equal(publisher.postText(content, { captionOverride: '' }), '');
});

test('due time: the platform’s own time, else the post’s Bangkok date + time; none without a time', () => {
  assert.equal(publisher.dueAt({ scheduledDate: '2026-12-07', scheduledTime: '14:30' }, { scheduledAt: null }), '2026-12-07T07:30:00.000Z');
  assert.equal(publisher.dueAt({ scheduledDate: '2026-12-07', scheduledTime: '14:30' }, { scheduledAt: '2026-12-08T01:00:00.000Z' }), '2026-12-08T01:00:00.000Z');
  assert.equal(publisher.dueAt({ scheduledDate: '2026-12-07', scheduledTime: null }, { scheduledAt: null }), null);
  assert.equal(publisher.dueAt({ scheduledDate: null, scheduledTime: '10:00' }, { scheduledAt: null }), null);
});

test('TikTok options: privacy must be chosen; private-only apps always post privately', () => {
  assert.throws(() => publisher.tiktokOptions({}, false), (e) => e.code === 'tiktok_privacy_required');
  assert.deepEqual(publisher.tiktokOptions({ privacyLevel: 'PUBLIC_TO_EVERYONE', allowComments: false }, false),
    { privacyLevel: 'PUBLIC_TO_EVERYONE', allowComments: false, brandOrganic: false, brandedContent: false });
  assert.equal(publisher.tiktokOptions({}, true).privacyLevel, 'SELF_ONLY');
  assert.throws(() => publisher.tiktokOptions({ privacyLevel: 'SELF_ONLY', brandedContent: true }, false), (e) => e.code === 'tiktok_branded_private');
});

test('Facebook: text, one photo and several photos', async () => {
  const conn = { externalAccountId: '1110001' };
  const text = await meta.publishFacebook(conn, 'fake-page-token-1110001', { text: 'Hello', imageUrls: [] });
  assert.match(text.postId, /^1110001_\d+$/);
  assert.equal(text.url, `https://www.facebook.com/${text.postId}`);
  const one = await meta.publishFacebook(conn, 'fake-page-token-1110001', { text: 'Hi', imageUrls: ['https://api.example/uploads/a.jpg'] });
  assert.match(one.postId, /^1110001_/);
  const many = await meta.publishFacebook(conn, 'fake-page-token-1110001', { text: '', imageUrls: ['https://x/a.jpg', 'https://x/b.jpg'] });
  assert.match(many.postId, /^1110001_/);
  await assert.rejects(() => meta.publishFacebook(conn, 'fake-page-token-1110001', { text: ' ', imageUrls: [] }), (e) => e.code === 'empty_post');
  await assert.rejects(() => meta.publishFacebook(conn, 'fake-revoked-1110003', { text: 'x', imageUrls: [] }), (e) => e.kind === 'auth');
});

test('Instagram: single image and carousel; images required', async () => {
  const conn = { externalAccountId: '1784000111' };
  const one = await meta.publishInstagram(conn, 'fake-page-token-1110001', { text: 'Hi', imageUrls: ['https://x/a.jpg'] });
  assert.ok(one.postId);
  assert.match(one.url, /^https:\/\/www\.instagram\.com\/p\//);
  const carousel = await meta.publishInstagram(conn, 'fake-page-token-1110001', { text: 'Hi', imageUrls: ['https://x/a.jpg', 'https://x/b.jpg'] });
  assert.ok(carousel.postId);
  await assert.rejects(() => meta.publishInstagram(conn, 't', { text: 'x', imageUrls: [] }), (e) => e.code === 'ig_needs_image');
  await assert.rejects(() => meta.publishInstagram(conn, 'fake-page-token-1110001', { text: 'x', imageUrls: ['https://x/fail.jpg'] }), (e) => e.kind === 'invalid');
});

test('TikTok: photo post starts a job, then reports it live', async () => {
  const conn = { username: 'democreator' };
  const token = 'fake-tt-access-1';
  const info = await tiktok.creatorInfo(token);
  assert.equal(info.username, 'democreator');
  assert.ok(info.privacyOptions.includes('SELF_ONLY'));
  const { jobId } = await tiktok.publishPhotos(conn, token, { text: 'Line one\nmore', imageUrls: ['https://x/a.jpg'], options: { privacyLevel: 'SELF_ONLY' } });
  assert.match(jobId, /^p_pub_fake_/);
  const s = await tiktok.publishStatus(conn, token, jobId);
  assert.equal(s.state, 'done');
  assert.match(s.url, /^https:\/\/www\.tiktok\.com\/@democreator\/photo\/\d+$/);
  await assert.rejects(() => tiktok.publishPhotos(conn, token, { text: 'x', imageUrls: [] }), (e) => e.code === 'tiktok_needs_image');
});
