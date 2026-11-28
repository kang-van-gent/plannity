'use strict';

/**
 * HTTP for the Meta and TikTok adapters: timeout, JSON, and one error shape.
 *   SocialError.kind: auth (token revoked/expired → reconnect) · permission ·
 *   rate_limited · invalid · unavailable (network/5xx: try again later)
 * With SOCIAL_FAKE=true (never in production) requests go to ./fake.js instead,
 * so the whole connect/test flow can be clicked through locally.
 */
const TIMEOUT_MS = 15_000;

class SocialError extends Error {
  constructor(kind, code, message, extra = {}) {
    super(message || code);
    this.kind = kind;
    this.code = code;
    Object.assign(this, extra);
  }
}

const fakeMode = () => process.env.SOCIAL_FAKE === 'true' && process.env.NODE_ENV !== 'production';

async function request(url, { method = 'GET', headers = {}, form, json, classify } = {}) {
  if (fakeMode()) return require('./fake').respond(url, { method, headers, form, json, classify });
  const init = { method, headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (form) { init.body = new URLSearchParams(form).toString(); init.headers['content-type'] = 'application/x-www-form-urlencoded'; }
  if (json) { init.body = JSON.stringify(json); init.headers['content-type'] = 'application/json; charset=UTF-8'; }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new SocialError('unavailable', 'network', e?.name === 'TimeoutError' ? 'The platform did not answer in time' : 'Could not reach the platform');
  }
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  const err = classify(res.status, body);
  if (err) throw err;
  if (!res.ok) throw new SocialError(res.status >= 500 ? 'unavailable' : 'invalid', `http_${res.status}`, `The platform answered ${res.status}`);
  return body;
}

module.exports = { request, SocialError, fakeMode };
