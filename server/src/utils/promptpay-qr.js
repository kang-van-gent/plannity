'use strict';

/**
 * Thai QR / PromptPay payload checks (EMVCo merchant-presented QR, BOT spec).
 * A QR made by a third party (Slip2Go) is only shown to customers after it is
 * proven to pay *our* PromptPay ID the *exact* order amount in THB with a valid
 * checksum — otherwise checkout falls back to a QR we build ourselves.
 */
const { bahtToSatang } = require('./slip-decision');

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), EMVCo tag 63. */
function crc16(s) {
  let crc = 0xffff;
  for (const b of Buffer.from(s, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Top-level (or nested) TLV → { tag: value }. Null when malformed. */
function parseTlv(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return null;
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(s.slice(i + 2, i + 4)) || i + 4 + len > s.length) return null;
    out[tag] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** PromptPay target sub-tag for a receiver: phone → 01 (0066…), citizen/tax ID → 02, e-wallet → 03. */
function expectedTarget(accountType, accountNumber) {
  const digits = String(accountNumber || '').replace(/\D/g, '');
  if (accountType === '02001') return { tag: '01', value: `66${digits.replace(/^0/, '')}`.padStart(13, '0') };
  if (accountType === '02003') return { tag: '02', value: digits };
  if (accountType === '02004') return { tag: '03', value: digits };
  return null;
}

/**
 * True when `payload` is a well-formed PromptPay QR paying `receiver`
 * exactly `amountSatang` in THB.
 */
function isOurQr(payload, { amountSatang, receiver }) {
  if (typeof payload !== 'string' || payload.length < 30 || payload.length > 512 || !/^[\x20-\x7E]+$/.test(payload)) return false;
  // Checksum covers everything up to and including "6304".
  if (payload.slice(-8, -4) !== '6304' || crc16(payload.slice(0, -4)) !== payload.slice(-4).toUpperCase()) return false;
  const top = parseTlv(payload);
  if (!top || top['53'] !== '764' || !top['29']) return false;
  if (bahtToSatang(top['54']) !== Number(amountSatang)) return false;
  const merchant = parseTlv(top['29']);
  const want = expectedTarget(receiver?.accountType, receiver?.accountNumber);
  if (!merchant || merchant['00'] !== 'A000000677010111' || !want) return false;
  return merchant[want.tag] === want.value;
}

module.exports = { crc16, parseTlv, isOurQr };
