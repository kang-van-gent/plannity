'use strict';

/**
 * Mobile payment hand-off: a signed, expiring token that lets a phone open one
 * payment order without signing in — to see its QR and status and to send a
 * slip for it. Nothing else: no account data, no other orders.
 *
 *   token = <orderDocumentId>.<expiry, base36 ms>.<HMAC-SHA256, base64url, 32 chars>
 *
 * Stateless (no table): it can't be listed or guessed, and it expires on its
 * own. Anyone holding the link can only pay for this order — the slip still
 * has to pass every server check, and a paid order can't be paid twice.
 */
const crypto = require('node:crypto');

const TTL_MS = () => Math.max(5, Number(process.env.PAYMENT_HANDOFF_TTL_MINUTES || 45)) * 60_000;
const secret = () => process.env.PAYMENT_HANDOFF_SECRET || process.env.SLIP_LINK_SECRET || process.env.ADMIN_JWT_SECRET || process.env.APP_KEYS || 'dev-only';
const mac = (id, exp) => crypto.createHmac('sha256', secret()).update(`payment-handoff:v1:${id}.${exp}`).digest('base64url').slice(0, 32);

function issue(orderId, now = Date.now()) {
  const exp = now + TTL_MS();
  const e = exp.toString(36);
  return { token: `${orderId}.${e}.${mac(orderId, e)}`, expiresAt: new Date(exp).toISOString() };
}

/** Order document id when the token is genuine and unexpired, else null. */
function verify(token, now = Date.now()) {
  const m = /^([a-z0-9]{10,40})\.([0-9a-z]{6,12})\.([\w-]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const [, id, e, sig] = m;
  if (parseInt(e, 36) < now) return null;
  const want = Buffer.from(mac(id, e));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? id : null;
}

module.exports = { issue, verify };
