'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { crc16, isOurQr } = require('../src/utils/promptpay-qr');
const handoff = require('../src/utils/handoff-token');

const tlv = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
/** Same layout as app/utils/promptpay.ts. */
function payload({ phone = '0968870831', amount = '349.00', currency = '764', aid = 'A000000677010111', crc } = {}) {
  const target = tlv('01', `66${phone.replace(/^0/, '')}`.padStart(13, '0'));
  const body = [tlv('00', '01'), tlv('01', '12'), tlv('29', tlv('00', aid) + target), tlv('53', currency), tlv('54', amount), tlv('58', 'TH')].join('') + '6304';
  return body + (crc ?? crc16(body));
}
const receiver = { accountType: '02001', accountNumber: '0968870831' };

test('QR from the provider: only ours, exact amount, valid checksum', () => {
  assert.equal(isOurQr(payload(), { amountSatang: 34900, receiver }), true);
  assert.equal(isOurQr(payload({ amount: '349' }), { amountSatang: 34900, receiver }), true, 'amount without decimals');
  assert.equal(isOurQr(payload({ amount: '348.99' }), { amountSatang: 34900, receiver }), false, 'wrong amount');
  assert.equal(isOurQr(payload({ phone: '0812345678' }), { amountSatang: 34900, receiver }), false, 'someone else\'s PromptPay');
  assert.equal(isOurQr(payload({ currency: '840' }), { amountSatang: 34900, receiver }), false, 'not THB');
  assert.equal(isOurQr(payload({ aid: 'A000000677010112' }), { amountSatang: 34900, receiver }), false, 'not PromptPay credit transfer');
  assert.equal(isOurQr(payload({ crc: 'ABCD' }), { amountSatang: 34900, receiver }), false, 'bad checksum');
  assert.equal(isOurQr(undefined, { amountSatang: 34900, receiver }), false);
  assert.equal(isOurQr('<script>', { amountSatang: 34900, receiver }), false);
});

test('hand-off token: opens one order, expires, cannot be forged', () => {
  const id = 'k3n9x2m4p8q1r7s5t6u0v2w3';
  const { token, expiresAt } = handoff.issue(id);
  assert.equal(handoff.verify(token), id);
  assert.ok(Date.parse(expiresAt) > Date.now());
  assert.equal(handoff.verify(token, Date.parse(expiresAt) + 1), null, 'expired');
  const [, e, sig] = token.split('.');
  assert.equal(handoff.verify(`a${id.slice(1)}.${e}.${sig}`), null, 'other order');
  assert.equal(handoff.verify(`${id}.${(parseInt(e, 36) + 3600_000).toString(36)}.${sig}`), null, 'extended expiry');
  assert.equal(handoff.verify(`${id}.${e}.${'A'.repeat(32)}`), null, 'forged signature');
  assert.equal(handoff.verify('garbage'), null);
});
