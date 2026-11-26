'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../src/utils/slip-decision');

const order = { amountSatang: 34900, createdAt: '2026-11-26T08:00:00.000Z', expiresAt: '2026-11-26T08:30:00.000Z' };
const now = '2026-11-26T08:10:00.000Z';
const data = (over = {}) => ({
  referenceId: 'ref-1', decode: '0041000600000101030040220014242082547BPM049885102TH9104xxxx', transRef: '015073144041ATF00999',
  dateTime: '2026-11-26T08:05:00.000Z', amount: 349,
  receiver: { account: { name: 'x', bank: { account: null }, proxy: { type: 'MSISDN', account: 'xxx-xxx-0831' } }, bank: { id: '004', name: 'KBANK' } },
  sender: { account: { name: 'y', bank: { account: 'xxx-x-x9866-x' } }, bank: { id: '014', name: 'SCB' } },
  ...over,
});
const ok = (body) => ({ httpStatus: 200, body });
const AUTO = { now, autoApprove: true };

test('money is exact', () => {
  assert.equal(d.satangToBaht(34900), '349.00');
  assert.equal(d.satangToBaht(9905), '99.05');
  assert.equal(d.bahtToSatang(349), 34900);
  assert.equal(d.bahtToSatang(200.31), 20031);
  assert.equal(d.bahtToSatang('99.5'), 9950);
  assert.equal(d.bahtToSatang('1,000'), null);
  assert.equal(d.bahtToSatang('abc'), null);
  assert.equal(d.bahtToSatang(0.001), null);
});

test('payload: exact amount, receiver without spaces or title, date from order creation', () => {
  const p = d.buildPayload(order, { accountType: '02001', accountNumber: '096-887-0831', nameTH: 'นายสุภชัย แวน เคนท์' });
  assert.equal(p.checkDuplicate, true);
  assert.deepEqual(p.checkReceiver, [{ accountType: '02001', accountNumber: '0968870831', accountNameTH: 'สุภชัย แวน เคนท์' }]);
  assert.deepEqual(p.checkAmount, { type: 'eq', amount: '349.00' });
  assert.deepEqual(p.checkDate, { type: 'gte', date: '2026-11-26T07:59:00.000Z' });
});

test('only 200200 with complete, matching data is paid', () => {
  const r = d.decide(ok({ code: '200200', message: 'Slip is valid.', data: data() }), order, AUTO);
  assert.equal(r.outcome, 'paid');
  assert.deepEqual(r.claim, { senderBankId: '014', transRef: '015073144041ATF00999', qrDigest: data().decode, amountSatang: 34900, transferAt: '2026-11-26T08:05:00.000Z', providerReferenceId: 'ref-1' });
  assert.equal(d.claimKey(r.claim), '014:015073144041ATF00999');
});

test('verified but auto-approve off → staff review with the claim attached', () => {
  const r = d.decide(ok({ code: '200200', data: data() }), order, { now });
  assert.equal(r.outcome, 'review');
  assert.equal(r.verified, true);
  assert.ok(r.claim);
});

test('HTTP 200 with any other code never grants', () => {
  const expect = {
    200000: 'review', 200001: 'review', 200202: 'review', 200401: 'rejected', 200402: 'review', 200403: 'review',
    200500: 'rejected', 200501: 'rejected', 200502: 'review', 400409: 'review', 401005: 'review', 429000: 'review', 500503: 'review', 999999: 'review',
  };
  for (const [code, outcome] of Object.entries(expect)) {
    const r = d.decide(ok({ code, data: data() }), order, AUTO);
    assert.equal(r.outcome, outcome, code);
    assert.notEqual(r.outcome, 'paid', code);
  }
  assert.equal(d.decide(ok({ code: '401007' }), order, AUTO).alert, true, 'IP/quota problems alert the operator');
});

test('not found: retry first, then review', () => {
  assert.equal(d.decide(ok({ code: '200404', data: { referenceId: 'r' } }), order, { ...AUTO, notFoundAttempts: 0 }).outcome, 'retry');
  assert.equal(d.decide(ok({ code: '200404' }), order, { ...AUTO, notFoundAttempts: 2 }).outcome, 'review');
});

test('fail closed: network errors, malformed bodies, missing fields', () => {
  assert.equal(d.decide({ error: 'timeout' }, order, AUTO).outcome, 'review');
  assert.equal(d.decide({ httpStatus: 200, body: 'not json' }, order, AUTO).outcome, 'review');
  assert.equal(d.decide(ok({ code: '200200' }), order, AUTO).outcome, 'review');
  assert.equal(d.decide(ok({ code: '200200', data: data({ transRef: '' }) }), order, AUTO).outcome, 'review');
  assert.equal(d.decide(ok({ code: '200200', data: data({ sender: { bank: {} } }) }), order, AUTO).outcome, 'review');
});

test('our own checks still apply after 200200', () => {
  assert.equal(d.decide(ok({ code: '200200', data: data({ amount: 348.99 }) }), order, AUTO).result, 'amount_mismatch');
  assert.equal(d.decide(ok({ code: '200200', data: data({ amount: '349,00' }) }), order, AUTO).outcome, 'review');
  assert.equal(d.decide(ok({ code: '200200', data: data({ dateTime: '2026-11-26T07:30:00.000Z' }) }), order, AUTO).result, 'date_mismatch', 'old slip');
  assert.equal(d.decide(ok({ code: '200200', data: data({ dateTime: '2026-11-26T09:00:00.000Z' }) }), order, { ...AUTO, now: '2026-11-26T10:00:00.000Z' }).result, 'date_mismatch', 'after expiry');
  assert.equal(d.decide(ok({ code: '200200', data: data({ dateTime: '2026-11-26T08:20:00.000Z' }) }), order, AUTO).result, 'date_mismatch', 'future');
  assert.equal(d.decide(ok({ code: '200200', data: data({ dateTime: 'yesterday' }) }), order, AUTO).outcome, 'review');
});
