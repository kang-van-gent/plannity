'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/utils/pricing');
const { normalizePositions } = require('../src/utils/positions');
const r = require('../src/utils/task-rules');

const NOW = '2026-11-26T00:00:00.000Z';
const sub = (planKey, periodStart, periodEnd, status = 'active') => ({ planKey, periodStart, periodEnd, status });

test('prices and limits match pricing.md', () => {
  const c = p.pricing({});
  assert.equal(c.plans.solo.monthlySatang, 0);
  assert.equal(c.plans.team.monthlySatang, 34900);
  assert.equal(c.plans.studio.monthlySatang, 99900);
  assert.equal(c.additionalBrandMonthlySatang, 9900);
  assert.deepEqual([c.plans.solo.maxMembers, c.plans.team.maxMembers, c.plans.studio.maxMembers], [1, 5, 10]);
  assert.equal(c.aiContentCreditSatang, 1000);
  assert.equal(c.aiBriefCreditSatang, 1000);
});

test('feature flags: collaboration only on paid plans; preview on all', () => {
  assert.equal(p.featureFlags('solo').taskAssignment, false);
  assert.equal(p.featureFlags('solo').postPreview, true);
  assert.equal(p.featureFlags('team').memberPositions, true);
  assert.equal(p.featureFlags('studio').taskReview, true);
  assert.equal(p.featureFlags('solo').socialConnections, false);
  assert.equal(p.featureFlags('team').socialConnections, true);
});

test('active plan: highest covering period, Solo otherwise', () => {
  assert.equal(p.activePlan([], NOW).planKey, 'solo');
  assert.equal(p.activePlan([sub('team', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')], NOW).planKey, 'team');
  assert.equal(p.activePlan([sub('team', '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z')], NOW).planKey, 'solo', 'expired');
  assert.equal(p.activePlan([sub('team', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', 'cancelled')], NOW).planKey, 'solo');
  const both = [sub('team', '2026-11-01T00:00:00.000Z', '2026-12-20T00:00:00.000Z'), sub('studio', '2026-11-20T00:00:00.000Z', '2026-12-20T00:00:00.000Z')];
  assert.equal(p.activePlan(both, NOW).planKey, 'studio');
  // back-to-back renewals report the final end date
  const chain = [sub('team', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'), sub('team', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z')];
  assert.equal(p.activePlan(chain, NOW).periodEnd, '2027-01-01T00:00:00.000Z');
});

test('brand capacity: Solo/Team 2 + add-ons, Studio unlimited; archived brands count', () => {
  assert.equal(p.brandLimitError('solo', 0, 1), null);
  assert.equal(p.brandLimitError('solo', 0, 2), 'brand_limit', 'third owned brand needs an add-on');
  assert.equal(p.brandLimitError('solo', 1, 2), null);
  assert.equal(p.brandLimitError('team', 0, 2), 'brand_limit');
  assert.equal(p.brandLimitError('studio', 0, 500), null);
  const addons = [{ status: 'active', quantity: 2, periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z' }, { status: 'active', quantity: 5, periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z' }];
  assert.equal(p.activeAddonUnits(addons, NOW), 2);
});

test('seats are unique people across all owned brands, owner included', () => {
  const usage = {
    members: [{ userId: 1, email: 'owner@x.com' }, { userId: 2, email: 'a@x.com' }, { userId: 2, email: 'a@x.com' }], // a@ is in two brands
    pendingEmails: ['b@x.com', 'b@x.com', 'a@x.com'], // b@ invited twice, a@ already a member
  };
  assert.equal(p.seatCount(usage), 3);
  assert.equal(p.seatError('solo', usage, 'c@x.com'), 'plan_required');
  assert.equal(p.seatError('team', usage, 'c@x.com'), null);
  assert.equal(p.seatError('team', usage, 'a@x.com'), null, 'already counted → no new seat');
  const full = { members: [1, 2, 3, 4, 5].map((i) => ({ userId: i, email: `${i}@x.com` })), pendingEmails: [] };
  assert.equal(p.seatError('team', full, 'six@x.com'), 'seat_limit', 'sixth unique Team member is blocked');
  assert.equal(p.seatError('studio', full, 'six@x.com'), null);
});

test('paid months: renew extends, upgrade starts now, downgrade waits', () => {
  const team = [sub('team', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')];
  assert.deepEqual(p.nextPeriod('team', team, NOW), { periodStart: '2026-12-01T00:00:00.000Z', periodEnd: '2027-01-01T00:00:00.000Z' });
  assert.equal(p.nextPeriod('studio', team, NOW).periodStart, NOW);
  const studio = [sub('studio', '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')];
  assert.equal(p.nextPeriod('team', studio, NOW).periodStart, '2026-12-01T00:00:00.000Z');
  assert.equal(p.nextPeriod('team', [], NOW).periodStart, NOW);
  assert.equal(p.addMonths('2027-01-31T00:00:00.000Z', 1), '2027-02-28T00:00:00.000Z');
});

test('order amounts come from config', () => {
  assert.equal(p.orderAmount({ kind: 'plan', planKey: 'team' }), 34900);
  assert.equal(p.orderAmount({ kind: 'plan', planKey: 'solo' }), null);
  assert.equal(p.orderAmount({ kind: 'brand_addon', quantity: 3 }), 29700);
  assert.equal(p.orderAmount({ kind: 'brand_addon', quantity: 0 }), null);
  assert.equal(p.orderAmount({ kind: 'credits', credits: 30 }), 30000);
});

test('positions: known keys only, canonical order, no duplicates', () => {
  assert.deepEqual(normalizePositions(['photographer', 'graphic_designer', 'photographer']).keys, ['graphic_designer', 'photographer']);
  assert.equal(normalizePositions(['wizard']).error, 'invalid_position');
  assert.equal(normalizePositions('graphic_designer').error, 'invalid_position');
  assert.deepEqual(normalizePositions(undefined).keys, []);
});

test('task transitions follow the workflow', () => {
  const assignee = r.actorCapabilities({ role: 'editor', isAssignee: true, isAssigner: false });
  const owner = r.actorCapabilities({ role: 'owner', isAssignee: false, isAssigner: false });
  const viewer = r.actorCapabilities({ role: 'viewer', isAssignee: true, isAssigner: true });
  assert.equal(r.transitionError('start', { status: 'todo', caps: assignee }), null);
  assert.equal(r.transitionError('start', { status: 'todo', caps: viewer }), 'forbidden', 'viewer cannot mutate tasks even if assigned');
  assert.equal(r.transitionError('submit', { status: 'in_progress', caps: assignee, imageCount: 0 }), 'needs_image');
  assert.equal(r.transitionError('submit', { status: 'in_progress', caps: assignee, imageCount: 1 }), null);
  assert.equal(r.transitionError('approve', { status: 'in_review', caps: assignee }), 'forbidden');
  assert.equal(r.transitionError('approve', { status: 'in_review', caps: owner }), null);
  assert.equal(r.transitionError('request_changes', { status: 'in_review', caps: owner, note: ' ' }), 'note_required');
  assert.equal(r.transitionError('start', { status: 'changes_requested', caps: assignee }), null);
  assert.equal(r.transitionError('approve', { status: 'todo', caps: owner }), 'invalid_transition');
  assert.equal(r.transitionError('cancel', { status: 'completed', caps: owner }), 'invalid_transition');
});

test('assignees need an edit role and a matching position', () => {
  const m = (role, positionKeys, status = 'active') => ({ role, positionKeys, status });
  assert.equal(r.assigneeError({ positionKey: 'graphic_designer', member: m('editor', ['graphic_designer']) }), null);
  assert.equal(r.assigneeError({ positionKey: 'graphic_designer', member: m('viewer', ['graphic_designer']) }), 'assignee_cannot_edit', 'tags never elevate');
  assert.equal(r.assigneeError({ positionKey: 'graphic_designer', member: m('editor', ['photographer']) }), 'position_mismatch');
  assert.equal(r.assigneeError({ positionKey: 'stock_manager', member: m('editor', ['stock_manager']) }), 'invalid_position');
  assert.equal(r.assigneeError({ positionKey: 'graphic_designer', member: m('editor', ['graphic_designer'], 'removed') }), 'invalid_assignee');
  assert.deepEqual(r.assignmentFieldErrors({ dueDate: '2026-13', priority: 'urgent' }), { dueDate: 'invalid_date', priority: 'invalid' });
  assert.equal(r.isOverdue({ dueDate: '2026-11-20', status: 'in_progress' }, '2026-11-26'), true);
  assert.equal(r.isOverdue({ dueDate: '2026-11-20', status: 'completed' }, '2026-11-26'), false);
});

test('brand cover: 2 oldest free, extras need Studio or their own slot', () => {
  const brands = ['b1', 'b2', 'b3', 'b4', 'b5'].map((id, i) => ({ id, createdAt: `2026-0${i + 1}-01T00:00:00.000Z` }))
  const slot = (brandId, periodStart, periodEnd, quantity = 1) => ({ id: `s_${brandId}_${periodStart}`, brandId, quantity, status: 'active', periodStart, periodEnd })
  const slots = [
    slot('b3', '2026-11-10T00:00:00.000Z', '2026-12-10T00:00:00.000Z'),
    slot('b3', '2026-12-10T00:00:00.000Z', '2027-01-10T00:00:00.000Z'), // renewed in advance
    slot('b4', '2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'), // lapsed
  ]
  const solo = p.brandCoverage({ brands, planKey: 'solo', planEnd: null, slots, now: NOW })
  assert.deepEqual(solo.brands.map((b) => b.kind), ['included', 'included', 'slot', 'none', 'none'])
  assert.equal(solo.brands[2].until, '2027-01-10T00:00:00.000Z', 'renewals chain')
  assert.equal(p.brandCreateErrorFor(solo, 'solo'), 'brand_limit')
  const studio = p.brandCoverage({ brands, planKey: 'studio', planEnd: '2026-12-20T00:00:00.000Z', slots, now: NOW })
  assert.ok(studio.brands.every((b) => !b.locked), 'Studio covers brands added while it runs')
  assert.equal(studio.brands[4].until, '2026-12-20T00:00:00.000Z')
  assert.equal(studio.brands[2].until, '2027-01-10T00:00:00.000Z', 'own slot outlasts Studio')
  // Studio lapses → brands added during it lock unless they have their own slot
  const after = p.brandCoverage({ brands, planKey: 'solo', planEnd: null, slots, now: '2026-12-21T00:00:00.000Z' })
  assert.deepEqual(after.brands.map((b) => b.locked), [false, false, false, true, true])
  // free slots unlock locked brands, oldest first
  const free = [...slots, { id: 'free', brandId: null, quantity: 1, status: 'active', periodStart: NOW, periodEnd: '2026-12-26T00:00:00.000Z' }]
  const cov = p.brandCoverage({ brands, planKey: 'solo', planEnd: null, slots: free, now: NOW })
  assert.equal(cov.freeSlots, 1)
  assert.deepEqual(p.slotAssignments(cov, free, NOW), [{ slotId: 'free', brandId: 'b4' }])
  assert.equal(p.brandCreateErrorFor(p.brandCoverage({ brands: brands.slice(0, 1), planKey: 'solo', slots: [], now: NOW }), 'solo'), null)
  assert.equal(p.renewalStart('2026-12-10T00:00:00.000Z', NOW), '2026-12-10T00:00:00.000Z')
  assert.equal(p.renewalStart('2026-11-01T00:00:00.000Z', NOW), NOW)
});

test('renewal orders: plan + brands in one payment', () => {
  assert.equal(p.orderAmount({ kind: 'renewal', planKey: 'team', brandIds: ['a', 'b'] }), 34900 + 2 * 9900);
  assert.equal(p.orderAmount({ kind: 'renewal', planKey: null, brandIds: ['a'] }), 9900);
  assert.equal(p.orderAmount({ kind: 'renewal', planKey: 'studio', brandIds: ['a'] }), null, 'Studio already covers brands');
  assert.equal(p.orderAmount({ kind: 'renewal', planKey: null, brandIds: [] }), null);
  assert.equal(p.orderAmount({ kind: 'renewal', planKey: null, brandIds: ['a', 'a'] }), null);
});
