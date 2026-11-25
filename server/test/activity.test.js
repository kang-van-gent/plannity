'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/utils/activity');

test('content diff only lists real changes, truncating long text', () => {
  const before = { title: 'A', caption: 'x', status: 'draft', hashtags: ['#a'] };
  const after = { title: 'A', caption: 'y'.repeat(400), status: 'draft', hashtags: ['#a', '#b'] };
  const ch = a.diff(before, after, a.CONTENT_FIELDS);
  assert.deepEqual(ch.map((c) => c.field), ['caption', 'hashtags']);
  assert.equal(ch[0].to.length, 301); // 300 chars + ellipsis
  assert.deepEqual(ch[1], { field: 'hashtags', from: ['#a'], to: ['#a', '#b'] });
});

test('fields not sent in the update are not reported', () => {
  assert.deepEqual(a.diff({ title: 'A', status: 'draft' }, { status: 'approved' }, a.CONTENT_FIELDS), [{ field: 'status', from: 'draft', to: 'approved' }]);
});

test('content actions are classified', () => {
  assert.equal(a.classifyContent([{ field: 'status', from: 'draft', to: 'approved' }]), 'content.status_changed');
  assert.equal(a.classifyContent([{ field: 'scheduledDate', from: null, to: '2026-12-01' }]), 'content.scheduled');
  assert.equal(a.classifyContent([{ field: 'scheduledDate', from: '2026-12-01', to: '2026-12-03' }]), 'content.rescheduled');
  assert.equal(a.classifyContent([{ field: 'scheduledDate', from: '2026-12-01', to: null }, { field: 'scheduledTime', from: '10:00', to: null }]), 'content.unscheduled');
  assert.equal(a.classifyContent([{ field: 'archivedAt', from: null, to: '2026-11-25T00:00:00Z' }]), 'content.archived');
  assert.equal(a.classifyContent([{ field: 'caption', from: 'a', to: 'b' }, { field: 'status', from: 'draft', to: 'approved' }]), 'content.updated');
  assert.equal(a.classifyContent([{ field: 'status', from: 'scheduled', to: 'published' }, { field: 'postedAt', from: null, to: '2026-11-25T10:00:00Z' }]), 'content.status_changed');
  assert.equal(a.classifyContent([]), null);
});

test('brand diff covers profile fields', () => {
  const ch = a.diffBrand({ name: 'X', profile: { tone: 'warm', pillars: ['A'] } }, { name: 'Y', profile: { tone: 'warm', pillars: ['A', 'B'] } });
  assert.deepEqual(ch.map((c) => c.field), ['name', 'profile.pillars']);
  assert.equal(a.classifyBrand(ch), 'brand.updated');
  assert.equal(a.classifyBrand([{ field: 'archivedAt', from: null, to: 'now' }]), 'brand.archived');
});
