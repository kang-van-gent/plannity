'use strict';

/**
 * Slip2Go client (https://slip2go.com/guide). Server-side only: the secret
 * never leaves this process and is never logged. Network errors, timeouts and
 * non-JSON answers are returned as `{ error }` — an unknown outcome that the
 * decision rules send to staff review, never to a grant.
 */
const { RECEIVER_TYPES } = require('../utils/slip-decision');

let warned = false;

/** Validated configuration. `enabled` is false (manual review) unless everything required is present. */
function slip2goConfig(env = process.env) {
  const apiUrl = String(env.SLIP2GO_API_URL || '').trim().replace(/\/+$/, '');
  const secret = String(env.SLIP2GO_SECRET_KEY || env.SLIP2GO_API_KEY || '').trim();
  const promptpayType = String(env.PROMPTPAY_TYPE || 'phone_number').trim();
  const receiver = {
    accountType: String(env.PAYMENT_RECEIVER_ACCOUNT_TYPE || RECEIVER_TYPES[promptpayType] || '').trim(),
    accountNumber: String(env.PAYMENT_RECEIVER_ACCOUNT_NUMBER || env.PROMPTPAY_CODE || env.PROMPTPAY_ID || '').replace(/\D/g, ''),
    nameTH: String(env.PAYMENT_RECEIVER_NAME_TH || '').trim() || null,
    // The bank account behind the PromptPay ID. Many banking apps print this on
    // the slip instead of the PromptPay number; Slip2Go accepts a slip when ANY
    // checkReceiver entry matches, so both are sent.
    alternates: [],
  };
  const bankAccount = String(env.PAYMENT_RECEIVER_BANK_ACCOUNT || '').replace(/\D/g, '');
  if (bankAccount) receiver.alternates.push({ accountType: String(env.PAYMENT_RECEIVER_BANK_TYPE || '01004').trim(), accountNumber: bankAccount });
  const problems = [];
  if (!apiUrl || !secret) problems.push('SLIP2GO_API_URL and SLIP2GO_SECRET_KEY are required');
  if (apiUrl && !/^https:\/\//i.test(apiUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrl)) problems.push('SLIP2GO_API_URL must be https');
  if (!/^0\d{4}$/.test(receiver.accountType)) problems.push('PAYMENT_RECEIVER_ACCOUNT_TYPE (e.g. 02001 for a PromptPay phone number) is required');
  if (!receiver.accountNumber) problems.push('PAYMENT_RECEIVER_ACCOUNT_NUMBER (or PROMPTPAY_CODE) is required');
  if (receiver.accountType === '02001' && !/^0\d{9}$/.test(receiver.accountNumber)) problems.push('a PromptPay phone receiver must be a 10-digit number starting with 0');
  for (const a of receiver.alternates) {
    if (!/^01\d{3}$/.test(a.accountType) || !/^\d{10,15}$/.test(a.accountNumber)) problems.push('PAYMENT_RECEIVER_BANK_ACCOUNT must be the bank account digits, PAYMENT_RECEIVER_BANK_TYPE a bank code such as 01004 (KBank)');
  }
  const configured = !!(apiUrl || secret);
  if (configured && problems.length && !warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.error(`[slip2go] disabled — slips go to staff review: ${problems.join('; ')}`);
  }
  return {
    enabled: configured && !problems.length,
    configured,
    problems,
    apiUrl,
    secret,
    receiver,
    timeoutMs: Math.max(2000, Number(env.SLIP2GO_TIMEOUT_MS || 15000)),
    autoApprove: String(env.SLIP2GO_AUTO_APPROVE || '').toLowerCase() === 'true',
  };
}

async function call(cfg, path, init) {
  let res;
  try {
    res = await fetch(`${cfg.apiUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.secret}`, Accept: 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(cfg.timeoutMs),
      redirect: 'error',
    });
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? 'timeout' : 'network error' };
  }
  const text = await res.text().catch(() => '');
  try {
    return { httpStatus: res.status, body: JSON.parse(text) };
  } catch {
    return { httpStatus: res.status, error: 'non-JSON response' };
  }
}

/** POST /api/verify-slip/qr-image/info — multipart `file` + `payload` (JSON string). */
async function verifyImage(cfg, { buffer, mime, filename, payload }) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), filename);
  form.append('payload', JSON.stringify(payload));
  // Native FormData sets the multipart Content-Type (with boundary) itself.
  return call(cfg, '/api/verify-slip/qr-image/info', { method: 'POST', body: form });
}

/** GET /api/account/info — credentials, package and remaining quota (code "200001"). */
async function accountInfo(cfg) {
  return call(cfg, '/api/account/info', { method: 'GET' });
}

/**
 * POST /api/qr-payment/generate-qr-code — amount-fixed PromptPay payload
 * (code "200", data.qrCode). Only a QR to pay with: never evidence of payment.
 * Shorter timeout than slip checks: checkout falls back to a locally built QR.
 */
async function generateQr(cfg, { promptPayCode, promptPayType, accountName, amount }) {
  return call({ ...cfg, timeoutMs: Math.min(cfg.timeoutMs, 6000) }, '/api/qr-payment/generate-qr-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ promptPayCode, promptPayType, accountName, amount }),
  });
}

/** Settings changed (App settings saved): report a broken configuration again. */
function resetWarning() { warned = false; }

module.exports = { slip2goConfig, verifyImage, accountInfo, generateQr, resetWarning };
