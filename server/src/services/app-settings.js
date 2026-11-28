'use strict';

/**
 * Admin-managed settings (Content Manager → App settings) layered over server/.env.
 *
 * A filled field wins; an empty field falls back to the value .env had when the
 * server started. Applied to process.env at boot and right after every save,
 * so the existing readers (Slip2Go, PromptPay, Meta/TikTok) pick them up with
 * no restart. Secret fields are encrypted with SOCIAL_TOKEN_KEY (utils/secret-box)
 * before they are stored and decrypted only here, in memory.
 * SOCIAL_TOKEN_KEY itself must stay in .env: it can't protect the database from inside it.
 */
const { seal, open } = require('../utils/secret-box');

const UID = 'api::app-setting.app-setting';

/** field → environment variable. */
const MAP = {
  metaAppId: 'META_APP_ID',
  metaAppSecret: 'META_APP_SECRET',
  metaGraphVersion: 'META_GRAPH_VERSION',
  metaLoginConfigId: 'META_LOGIN_CONFIG_ID',
  tiktokClientKey: 'TIKTOK_CLIENT_KEY',
  tiktokClientSecret: 'TIKTOK_CLIENT_SECRET',
  tiktokAudited: 'TIKTOK_AUDITED',
  socialTestMode: 'SOCIAL_FAKE',
  promptpayId: 'PROMPTPAY_ID',
  promptpayName: 'PROMPTPAY_NAME',
  promptpayType: 'PROMPTPAY_TYPE',
  receiverAccountType: 'PAYMENT_RECEIVER_ACCOUNT_TYPE',
  receiverAccountNumber: 'PAYMENT_RECEIVER_ACCOUNT_NUMBER',
  receiverNameTh: 'PAYMENT_RECEIVER_NAME_TH',
  receiverBankAccount: 'PAYMENT_RECEIVER_BANK_ACCOUNT',
  receiverBankType: 'PAYMENT_RECEIVER_BANK_TYPE',
  slip2goApiUrl: 'SLIP2GO_API_URL',
  slip2goSecretKey: 'SLIP2GO_SECRET_KEY',
  slip2goTimeoutMs: 'SLIP2GO_TIMEOUT_MS',
  slip2goAutoApprove: 'SLIP2GO_AUTO_APPROVE',
  slip2goGenerateQr: 'SLIP2GO_GENERATE_QR',
  paymentOrderTtlMinutes: 'PAYMENT_ORDER_TTL_MINUTES',
};
const SECRETS = ['metaAppSecret', 'tiktokClientSecret', 'slip2goSecretKey'];

// .env as it was at startup, so clearing a field in the admin restores it.
const BOOT_ENV = Object.fromEntries(Object.values(MAP).map((k) => [k, process.env[k]]));

const isSealed = (v) => /^v1\.[\w-]+\.[\w-]+\.[\w-]*$/.test(String(v || ''));

/** Lifecycle hook: encrypts secrets typed in the admin before they are stored. */
function sealSecrets(data) {
  if (!data) return;
  for (const f of SECRETS) {
    if (typeof data[f] !== 'string') continue;
    const v = data[f].trim();
    data[f] = v ? (isSealed(v) ? v : seal(v)) : null;
  }
}

/** The environment values a settings row produces (pure: used by apply and the tests). */
function toEnv(row, boot = BOOT_ENV, log = null) {
  const out = {};
  for (const [field, key] of Object.entries(MAP)) {
    let v = row ? row[field] : null;
    if (v !== null && v !== undefined && SECRETS.includes(field)) {
      const plain = open(v);
      if (plain === null && log) log.error(`[settings] App settings → ${field} can't be decrypted (SOCIAL_TOKEN_KEY changed?) — paste it again. Using .env meanwhile.`);
      v = plain;
    }
    if (typeof v === 'string') v = v.trim();
    out[key] = v === null || v === undefined || v === '' ? boot[key] : String(v);
  }
  return out;
}

/** Loads the App settings row and applies it to process.env. Returns which keys come from the admin. */
async function apply(strapi) {
  let row = null;
  try {
    row = await strapi.documents(UID).findFirst();
  } catch (e) {
    strapi.log.error(`[settings] could not read App settings: ${e.message} — using .env`);
  }
  const env = toEnv(row, BOOT_ENV, strapi.log);
  const fromAdmin = [];
  for (const [field, key] of Object.entries(MAP)) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
    if (row && row[field] !== null && row[field] !== undefined && row[field] !== '') fromAdmin.push(key);
  }
  return fromAdmin;
}

module.exports = { apply, sealSecrets, toEnv, MAP, SECRETS, UID };
