'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSet, rollup, isMaterialChange, effective, isValidTimezone, destinationKey } = require('../src/utils/destinations');

test('validateSet: inherit (null) is kept apart from an explicit empty caption', () => {
  const { errors, list } = validateSet([{ platform: 'facebook' }, { platform: 'instagram', captionOverride: '' }], { imageIds: [] });
  assert.deepEqual(errors, {});
  assert.equal(list[0].captionOverride, null);
  assert.equal(list[1].captionOverride, '');
  assert.equal(list[0].timezone, 'Asia/Bangkok');
});

test('validateSet: rejects empty, duplicate and unknown platforms', () => {
  assert.equal(validateSet([], { imageIds: [] }).errors.destinations, 'required');
  assert.equal(validateSet(null, { imageIds: [] }).errors.destinations, 'required');
  assert.equal(validateSet([{ platform: 'facebook' }, { platform: 'facebook' }], { imageIds: [] }).errors['destinations.1.platform'], 'duplicate');
  assert.equal(validateSet([{ platform: 'myspace' }], { imageIds: [] }).errors['destinations.0.platform'], 'invalid');
});

test('validateSet: media overrides may only use this content’s images', () => {
  const ok = validateSet([{ platform: 'instagram', mediaOverrideIds: ['2', 1] }], { imageIds: ['1', '2', '3'] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.list[0].mediaOverrideIds, ['2', '1']);
  const foreign = validateSet([{ platform: 'instagram', mediaOverrideIds: ['99'] }], { imageIds: ['1'] });
  assert.equal(foreign.errors['destinations.0.mediaOverrideIds'], 'not_this_content');
  const dup = validateSet([{ platform: 'instagram', mediaOverrideIds: ['1', '1'] }], { imageIds: ['1'] });
  assert.equal(dup.errors['destinations.0.mediaOverrideIds'], 'duplicate');
});

test('validateSet: dates, time zones, caption length and auto mode', () => {
  const r = validateSet([
    { platform: 'facebook', scheduledAt: '2026-12-01T10:00:00+07:00' },
    { platform: 'instagram', scheduledAt: 'tomorrow' },
    { platform: 'tiktok', timezone: 'Mars/Olympus' },
    { platform: 'x', captionOverride: 'a'.repeat(5001) },
    { platform: 'line', mode: 'auto' },
  ], { imageIds: [] });
  assert.equal(r.list[0].scheduledAt, '2026-12-01T03:00:00.000Z'); // stored in UTC
  assert.equal(r.errors['destinations.1.scheduledAt'], 'invalid_date');
  assert.equal(r.errors['destinations.2.timezone'], 'invalid');
  assert.equal(r.errors['destinations.3.captionOverride'], 'too_long');
  assert.equal(r.errors['destinations.4.mode'], 'auto_unavailable');
  assert.ok(isValidTimezone('Asia/Bangkok'));
});

test('rollup: partially published content is never marked published', () => {
  const content = { status: 'scheduled', scheduledDate: '2026-12-01', postUrl: null };
  assert.equal(rollup(content, [{ status: 'published' }, { status: 'draft' }]), null);
  const all = rollup(content, [
    { status: 'published', postedAt: '2026-12-01T03:00:00.000Z', externalPostUrl: 'https://fb.com/1' },
    { status: 'published', postedAt: '2026-12-01T05:00:00.000Z', externalPostUrl: 'https://ig.com/2' },
  ]);
  assert.equal(all.status, 'published');
  assert.equal(all.postedAt, '2026-12-01T05:00:00.000Z'); // the last platform to go live
});

test('rollup: undoing one platform takes the content out of published', () => {
  assert.deepEqual(rollup({ status: 'published', scheduledDate: '2026-12-01' }, [{ status: 'published' }, { status: 'draft' }]), { status: 'scheduled', postedAt: null });
  assert.deepEqual(rollup({ status: 'published', scheduledDate: null }, [{ status: 'draft' }]), { status: 'approved', postedAt: null });
  assert.equal(rollup({ status: 'published' }, [{ status: 'published' }]), null);
});

test('isMaterialChange and effective values', () => {
  const base = { captionOverride: null, mediaOverrideIds: null, scheduledAt: null, timezone: 'Asia/Bangkok' };
  assert.equal(isMaterialChange(base, { ...base }), false);
  assert.equal(isMaterialChange(base, { ...base, captionOverride: '' }), true);
  assert.equal(isMaterialChange({ ...base, scheduledAt: new Date('2026-12-01T03:00:00Z') }, { ...base, scheduledAt: '2026-12-01T03:00:00.000Z' }), false);
  const e = effective({ caption: 'shared' }, { captionOverride: null, mediaOverrideIds: ['3', '9'] }, ['1', '3']);
  assert.equal(e.caption, 'shared');
  assert.deepEqual(e.imageIds, ['3']); // removed image dropped
  assert.equal(destinationKey('abc', 'facebook'), 'abc:facebook');
});
