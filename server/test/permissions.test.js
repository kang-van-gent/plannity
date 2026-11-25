'use strict';
// Run: npm test   (node:test, no extra dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/utils/permissions');

test('permission matrix matches the spec', () => {
  const rows = {
    'brand.read': [1, 1, 1, 1], 'brand.update': [1, 1, 0, 0], 'brand.delete': [1, 0, 0, 0],
    'member.invite': [1, 1, 0, 0], 'member.read': [1, 1, 1, 1], 'member.updateRole': [1, 1, 0, 0], 'member.remove': [1, 1, 0, 0],
    'content.create': [1, 1, 1, 0], 'content.update': [1, 1, 1, 0], 'content.delete': [1, 1, 1, 0], 'content.read': [1, 1, 1, 1],
    'contentImage.upload': [1, 1, 1, 0], 'contentImage.delete': [1, 1, 1, 0], 'contentImage.read': [1, 1, 1, 1], 'calendar.read': [1, 1, 1, 1],
  };
  for (const [perm, flags] of Object.entries(rows)) {
    p.BRAND_ROLES.forEach((role, i) => assert.equal(p.roleCan(role, perm), Boolean(flags[i]), `${role} ${perm}`));
  }
  assert.equal(p.roleCan(null, 'brand.read'), false);
  assert.equal(p.roleCan('stranger', 'brand.read'), false);
});

test('final owner is protected', () => {
  assert.equal(p.roleChangeError('owner', 'owner', 'admin', 1), 'last_owner');
  assert.equal(p.roleChangeError('owner', 'owner', 'admin', 2), null);
  assert.equal(p.removeError('owner', 'owner', 1), 'last_owner');
  assert.equal(p.leaveError('owner', 1), 'last_owner');
  assert.equal(p.leaveError('owner', 2), null);
  assert.equal(p.leaveError('editor', 1), null);
});

test('admins cannot touch ownership', () => {
  assert.equal(p.roleChangeError('admin', 'editor', 'owner', 1), 'owner_only'); // no self/other promotion to owner
  assert.equal(p.roleChangeError('admin', 'owner', 'viewer', 3), 'owner_only');
  assert.equal(p.roleChangeError('admin', 'viewer', 'editor', 1), null);
  assert.equal(p.removeError('admin', 'owner', 3), 'owner_only');
  assert.equal(p.removeError('admin', 'admin', 1), null);
});

test('editors and viewers cannot manage members', () => {
  for (const r of ['editor', 'viewer']) {
    assert.equal(p.inviteError(r, 'viewer'), 'forbidden');
    assert.equal(p.roleChangeError(r, 'viewer', 'editor', 1), 'forbidden');
    assert.equal(p.removeError(r, 'viewer', 1), 'forbidden');
  }
  assert.equal(p.inviteError('admin', 'owner'), 'invalid_role');
  assert.equal(p.inviteError('owner', 'editor'), null);
  assert.equal(p.roleChangeError('owner', 'viewer', 'superuser', 1), 'invalid_role');
});

test('seat count includes pending invitations', () => {
  assert.equal(p.seatsUsed(4, 1), 5);
});
