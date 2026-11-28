'use strict';

/**
 * Outgoing email through Brevo's transactional API (api.brevo.com/v3/smtp/email).
 *
 * Settings come from process.env, which App settings (Strapi admin → Content
 * Manager → App settings) overlays at boot and after every save, so a new key
 * or sender applies with no restart:
 *   MAIL_ENABLED     true = really send (otherwise emails are only logged)
 *   BREVO_API_KEY    Brevo → SMTP & API → API keys
 *   MAIL_FROM_EMAIL  a sender (or domain) verified in Brevo → Senders & domains
 *   MAIL_FROM_NAME   e.g. Plannity
 *   MAIL_REPLY_TO    optional
 *
 * Strapi's own emails (sign-up confirmation, forgot password) go through the
 * same path: bootstrap installs `provider()` as the email plugin's provider and
 * `syncAuthTemplates()` stores a marker template, which the provider replaces
 * with the designed, localized email (templates.js).
 */
const templates = require('./templates');

const API = 'https://api.brevo.com/v3/smtp/email';
const USER = 'plugin::users-permissions.user';

const trimUrl = (s) => String(s || '').replace(/\/$/, '');
const siteUrl = () => trimUrl(process.env.FRONTEND_URL || 'http://localhost:3000');

function config() {
  const env = process.env;
  const enabledFlag = env.MAIL_ENABLED ?? env.INVITE_EMAIL_ENABLED; // INVITE_EMAIL_ENABLED: older name, still honoured
  return {
    enabled: enabledFlag === 'true',
    apiKey: env.BREVO_API_KEY || '',
    fromEmail: env.MAIL_FROM_EMAIL || '',
    fromName: env.MAIL_FROM_NAME || 'Plannity',
    replyTo: env.MAIL_REPLY_TO || '',
  };
}

/** Ready to really send? (switched on, with a key and a sender) */
function ready(c = config()) {
  return c.enabled && !!c.apiKey && !!c.fromEmail;
}

/** "Name <a@b.c>", "a@b.c", arrays or comma lists → [{ email, name? }]. */
function recipients(to) {
  const list = Array.isArray(to) ? to : String(to || '').split(',');
  return list.map((r) => {
    if (r && typeof r === 'object') return { email: String(r.email || r.address || '').trim(), ...(r.name ? { name: String(r.name) } : {}) };
    const s = String(r).trim();
    const m = s.match(/^(.*)<([^>]+)>$/);
    if (m) return { email: m[2].trim(), ...(m[1].trim() ? { name: m[1].trim().replace(/^"|"$/g, '') } : {}) };
    return { email: s };
  }).filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
}

/** Low-level send. Throws on failure (callers decide whether that matters). */
async function deliver(strapi, { to, subject, html, text, replyTo, tags }) {
  const c = config();
  const rcpt = recipients(to);
  if (!rcpt.length) throw new Error('mail: no valid recipient');
  if (!ready(c)) {
    // Not configured (local dev): say what would have been sent. Links carry
    // one-time tokens, so they are only printed outside production.
    const dev = process.env.NODE_ENV !== 'production';
    strapi.log[dev ? 'info' : 'warn'](`[mail] not sent (mail is off or Brevo isn't configured): "${subject}" → ${rcpt.map((r) => r.email).join(', ')}`
      + (dev && text ? `\n${text}` : ''));
    return { sent: false };
  }
  const body = {
    sender: { email: c.fromEmail, name: c.fromName },
    to: rcpt,
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {}),
    ...((replyTo || c.replyTo) ? { replyTo: { email: recipients(replyTo || c.replyTo)[0]?.email || c.replyTo } } : {}),
    ...(tags?.length ? { tags } : {}),
  };
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { 'api-key': c.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new Error(`mail: Brevo unreachable (${e.name === 'TimeoutError' ? 'timeout' : e.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 = wrong key; 400 with "sender" = the From address isn't verified in Brevo.
    throw new Error(`mail: Brevo ${res.status} ${data.code || ''} ${data.message || ''}`.trim());
  }
  return { sent: true, messageId: data.messageId };
}

/** Finds the recipient's account (language + name), if they have one. */
async function account(strapi, email) {
  if (!email) return null;
  try {
    return await strapi.db.query(USER).findOne({ where: { email: String(email).toLowerCase() }, select: ['id', 'email', 'name', 'username', 'locale'] });
  } catch {
    return null;
  }
}

/* ---- Strapi's own auth emails -------------------------------------------- */

// Stored as the users-permissions template. Strapi fills the <%= %> values; the
// provider spots the marker and sends the designed email instead. The text after
// the marker is a plain fallback, used only if another provider is ever configured.
const MARKER = /^\s*<!--plannity:(\{[^]*?\})-->/;
const AUTH_TEMPLATES = {
  email_confirmation: {
    object: 'Confirm your email — Plannity',
    message: '<!--plannity:{"t":"email_confirmation","url":"<%= URL %>","code":"<%= CODE %>"}-->'
      + '<p>Confirm your Plannity email: <a href="<%= URL %>?confirmation=<%= CODE %>"><%= URL %>?confirmation=<%= CODE %></a></p>',
  },
  reset_password: {
    object: 'Reset your password — Plannity',
    message: '<!--plannity:{"t":"reset_password","url":"<%= URL %>","code":"<%= TOKEN %>"}-->'
      + '<p>Set a new Plannity password: <a href="<%= URL %>?code=<%= TOKEN %>"><%= URL %>?code=<%= TOKEN %></a></p>',
  },
};

/** Builds the designed email for a marker, or null when the html isn't one of ours. */
async function fromMarker(strapi, html, to) {
  const m = String(html || '').match(MARKER);
  if (!m) return null;
  let p;
  try { p = JSON.parse(m[1]); } catch { return null; }
  const code = encodeURIComponent(String(p.code || ''));
  const user = await account(strapi, recipients(to)[0]?.email);
  const base = { locale: user?.locale, siteUrl: siteUrl(), name: user?.name || null };
  if (p.t === 'reset_password') {
    // An empty "reset password page" setting would give "null?code=…": use the app's page.
    const url = p.url && p.url !== 'null' && /^https?:\/\//.test(p.url) ? p.url : `${siteUrl()}/reset-password`;
    return { ...templates.resetPassword({ ...base, link: `${url}?code=${code}` }), tags: ['reset-password'] };
  }
  if (p.t === 'email_confirmation') {
    return { ...templates.confirmEmail({ ...base, link: `${p.url}?confirmation=${code}` }), tags: ['confirm-email'] };
  }
  return null;
}

/** The Strapi email-plugin provider: every strapi.plugin('email') send goes through Brevo. */
function provider(strapi) {
  return {
    async send(options = {}) {
      const designed = await fromMarker(strapi, options.html, options.to);
      const msg = designed
        ? { to: options.to, replyTo: options.replyTo, ...designed }
        : { to: options.to, replyTo: options.replyTo, subject: options.subject, html: options.html || `<pre>${String(options.text || '')}</pre>`, text: options.text };
      const r = await deliver(strapi, msg);
      return r;
    },
  };
}

/**
 * Stores the marker templates in users-permissions (Settings → Email templates)
 * and fills the two app URLs it needs when they're still empty. Idempotent.
 */
async function syncAuthTemplates(strapi) {
  const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
  const email = (await store.get({ key: 'email' })) || {};
  let changed = false;
  for (const [key, tpl] of Object.entries(AUTH_TEMPLATES)) {
    const cur = email[key] || { display: `Email.template.${key}`, icon: key === 'reset_password' ? 'sync' : 'check-square', options: {} };
    const opts = cur.options || {};
    if (opts.message !== tpl.message || opts.object !== tpl.object) {
      email[key] = { ...cur, options: { ...opts, object: tpl.object, message: tpl.message, from: opts.from || { name: 'Plannity', email: 'no-reply@plannity.space' } } };
      changed = true;
    }
  }
  if (changed) await store.set({ key: 'email', value: email });

  const advanced = (await store.get({ key: 'advanced' })) || {};
  const patch = {};
  if (!advanced.email_reset_password) patch.email_reset_password = `${siteUrl()}/reset-password`;
  if (!advanced.email_confirmation_redirection) patch.email_confirmation_redirection = `${siteUrl()}/login?confirmed=1`;
  if (Object.keys(patch).length) await store.set({ key: 'advanced', value: { ...advanced, ...patch } });
}

/** Sends one of Plannity's templated emails. Never throws: returns whether it went out. */
async function sendTemplate(strapi, name, to, data, { tags } = {}) {
  const render = templates[name];
  if (!render) throw new Error(`mail: unknown template ${name}`);
  try {
    const r = await deliver(strapi, { to, ...render({ siteUrl: siteUrl(), ...data }), tags: tags || [name] });
    return r.sent;
  } catch (e) {
    strapi.log.warn(`[mail] ${name} to ${to} failed: ${e.message}`);
    return false;
  }
}

module.exports = { config, ready, recipients, deliver, provider, fromMarker, syncAuthTemplates, sendTemplate, account, AUTH_TEMPLATES, MARKER };
