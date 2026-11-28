'use strict';

/**
 * Encrypts social account tokens at rest (AES-256-GCM).
 *   box = "v1." + base64url(iv) + "." + base64url(tag) + "." + base64url(ciphertext)
 * Key: SOCIAL_TOKEN_KEY (any long random string; `openssl rand -base64 32`).
 * Production refuses to run without it. Development falls back to APP_KEYS so
 * local testing works out of the box. Changing the key makes stored tokens
 * unreadable: every account then shows "Reconnect required".
 */
const crypto = require('node:crypto');

function key() {
  const raw = process.env.SOCIAL_TOKEN_KEY || (process.env.NODE_ENV === 'production' ? '' : process.env.APP_KEYS || 'dev-only-social-key');
  if (!raw) throw new Error('SOCIAL_TOKEN_KEY is not set');
  return crypto.createHash('sha256').update(`plannity-social:${raw}`).digest();
}

const configured = () => !!process.env.SOCIAL_TOKEN_KEY || process.env.NODE_ENV !== 'production';

function seal(plain) {
  if (plain === null || plain === undefined) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** The plain text, or null when the box is missing, tampered with or from another key. */
function open(box) {
  const m = /^v1\.([\w-]+)\.([\w-]+)\.([\w-]*)$/.exec(String(box || ''));
  if (!m) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(m[1], 'base64url'));
    d.setAuthTag(Buffer.from(m[2], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(m[3], 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { seal, open, configured };
