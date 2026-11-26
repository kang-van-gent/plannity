'use strict';

/**
 * Slip checking for PromptPay orders (plannity-context-slip2go.md §7–§9, §13).
 *
 *   1. In a short transaction (per-order lock): check the order, record the
 *      attempt, take a processing lease (status → verifying).
 *   2. Call Slip2Go outside any transaction.
 *   3. In a second transaction (same lock): re-check the order and the lease,
 *      record the bank transfer as a claim (globally unique), set the outcome.
 *      `paid` then triggers fulfilment (lifecycle) — exactly once per order;
 *      a recovery job finishes anything interrupted.
 *
 * Slips are stored privately on disk (not in the public uploads folder) and
 * are only reachable through a signed link shown to staff in the admin.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const D = require('../utils/slip-decision');
const { slip2goConfig, verifyImage, accountInfo } = require('./slip2go');
const { lockAccount } = require('./entitlements');

const ORDER = 'api::payment-order.payment-order';
const ATTEMPT = 'api::payment-attempt.payment-attempt';
const CLAIM = 'api::payment-claim.payment-claim';
const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS_PER_ORDER = 6;
const MAX_ATTEMPTS_PER_HOUR = 20;
const retentionDays = () => Number(process.env.SLIP_RETENTION_DAYS || 30);

class PaymentError extends Error {
  constructor(status, code, message, fieldErrors = {}) {
    super(message);
    Object.assign(this, { status, code, fieldErrors });
  }
}

// ---- private slip storage ----------------------------------------------------
function slipDir(strapi) {
  const dir = process.env.SLIP_STORAGE_DIR || path.join(strapi.dirs.app.root, '.private', 'slips');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const linkSecret = () => process.env.SLIP_LINK_SECRET || process.env.ADMIN_JWT_SECRET || process.env.APP_KEYS || 'dev-only';
const sign = (id, exp) => crypto.createHmac('sha256', linkSecret()).update(`${id}.${exp}`).digest('hex');

function slipLink(attemptId) {
  const exp = Date.now() + retentionDays() * 864e5;
  const base = String(process.env.PUBLIC_URL || 'http://localhost:1337').replace(/\/$/, '');
  return `${base}/api/payments/slips/${attemptId}?exp=${exp}&sig=${sign(attemptId, exp)}`;
}
function verifyLink(attemptId, exp, sig) {
  if (!/^\d+$/.test(String(exp)) || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(attemptId, exp), 'hex');
  const got = Buffer.from(String(sig || ''), 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Order fields frozen at checkout: who must be paid. */
function receiverSnapshot() {
  const cfg = slip2goConfig();
  return { ...cfg.receiver, version: 1 };
}

// ---- the slip check ------------------------------------------------------------
module.exports = ({ strapi }) => {
  const docs = (uid) => strapi.documents(uid);
  const inLock = (orderId, fn) => strapi.db.transaction(async ({ trx }) => {
    await lockAccount(strapi, trx, orderId, 'payorder');
    return fn();
  });

  /**
   * @param {object} order       the caller's order (already ownership-checked)
   * @param {object} user        ctx.state.user
   * @param {{ filepath: string, size: number, mime: string, name: string }} file  already type/size-checked
   * @param {string|null} idempotencyKey
   */
  async function submitSlip(order, user, file, idempotencyKey) {
    const key = String(idempotencyKey || crypto.randomUUID()).slice(0, 80);
    const attemptKey = `${order.documentId}:${key}`;
    // The same upload (retried request) is processed once.
    const prior = await docs(ATTEMPT).findFirst({ filters: { attemptKey } });
    if (prior) return docs(ORDER).findOne({ documentId: order.documentId });

    // Rate limits: per order and per person.
    const [forOrder, lastHour] = await Promise.all([
      docs(ATTEMPT).count({ filters: { order: { documentId: order.documentId } } }),
      docs(ATTEMPT).count({ filters: { requester: { id: user.id }, createdAt: { $gt: new Date(Date.now() - 3600_000).toISOString() } } }),
    ]);
    if (forOrder >= MAX_ATTEMPTS_PER_ORDER) throw new PaymentError(429, 'RATE_LIMITED', 'Too many slips for this order. We\'ll check it for you — please contact us.');
    if (lastHour >= MAX_ATTEMPTS_PER_HOUR) throw new PaymentError(429, 'RATE_LIMITED', 'Too many slips in the last hour. Please try again later.');

    const buffer = fs.readFileSync(file.filepath);
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    // A slip image that already paid another order: refuse without spending a provider check.
    const usedElsewhere = await docs(ATTEMPT).findFirst({ filters: { fileHash, status: 'passed', order: { documentId: { $ne: order.documentId } } } });

    // 1) record the attempt + take the lease (short transaction, no network).
    const leaseToken = crypto.randomBytes(12).toString('hex');
    const { attempt, snapshot } = await inLock(order.documentId, async () => {
      const fresh = await docs(ORDER).findOne({ documentId: order.documentId });
      if (fresh.status === 'paid') return { attempt: null, snapshot: fresh };
      if (fresh.status === 'verifying' && fresh.leaseUntil && Date.parse(fresh.leaseUntil) > Date.now()) {
        throw new PaymentError(409, 'CONFLICT', 'This slip is already being checked.');
      }
      if (!['pending', 'rejected', 'expired', 'verifying'].includes(fresh.status)) {
        throw new PaymentError(409, 'CONFLICT', fresh.status === 'awaiting_review' ? 'Your slip is with our team for checking — no need to pay again.' : `This order is ${fresh.status}.`);
      }
      const a = await docs(ATTEMPT).create({ data: { order: order.documentId, requester: user.id, attemptKey, fileHash, status: 'pending' } });
      const storageKey = `${a.documentId}.${EXT[file.mime] || 'img'}`;
      fs.writeFileSync(path.join(slipDir(strapi), storageKey), buffer, { mode: 0o600 });
      const link = slipLink(a.documentId);
      await docs(ATTEMPT).update({ documentId: a.documentId, data: { storageKey, slipLink: link } });
      const updated = await docs(ORDER).update({
        documentId: order.documentId,
        data: { status: 'verifying', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(), slipUploadedAt: new Date().toISOString(), slipLink: link, reviewNote: null, resultCode: null },
      });
      return { attempt: a, snapshot: updated };
    });
    if (!attempt) return snapshot; // already paid: nothing to do

    // 2) decide — provider call outside any transaction.
    const cfg = slip2goConfig();
    let decision;
    if (usedElsewhere) {
      decision = { outcome: 'rejected', result: D.RESULT.duplicate, code: null, reason: 'this slip image already paid another order' };
    } else if (!cfg.enabled) {
      decision = { outcome: 'review', result: 'manual', code: null, reason: cfg.configured ? `Slip2Go misconfigured: ${cfg.problems.join('; ')}` : 'Slip2Go not configured — staff review' };
    } else {
      const notFoundAttempts = await docs(ATTEMPT).count({ filters: { order: { documentId: order.documentId }, result: D.RESULT.notFound } });
      const receiver = snapshot.receiverSnapshot && snapshot.receiverSnapshot.accountNumber ? snapshot.receiverSnapshot : cfg.receiver;
      const res = await verifyImage(cfg, { buffer, mime: file.mime, filename: `slip.${EXT[file.mime] || 'jpg'}`, payload: D.buildPayload(snapshot, receiver) });
      decision = D.decide(res, snapshot, { now: Date.now(), notFoundAttempts, autoApprove: cfg.autoApprove });
      if (decision.alert) strapi.log.error(`[slip2go] operator attention needed: ${decision.reason} (order ${snapshot.reference})`);
    }
    return finalize(order.documentId, attempt.documentId, leaseToken, decision);
  }

  /** 3) apply the decision under the order lock; claim the transfer atomically. */
  async function finalize(orderId, attemptId, leaseToken, decision) {
    const sanitized = decision.facts ? { ...decision.facts, verified: !!decision.verified || decision.outcome === 'paid', claim: decision.claim ?? null } : null;
    const attemptStatus = { paid: 'passed', rejected: 'rejected', retry: 'retry', review: decision.result === 'manual' ? 'manual' : 'review' }[decision.outcome] ?? 'error';
    return inLock(orderId, async () => {
      const order = await docs(ORDER).findOne({ documentId: orderId });
      await docs(ATTEMPT).update({
        documentId: attemptId,
        data: {
          status: attemptStatus, result: decision.result, providerCode: decision.code, providerReferenceId: decision.facts?.referenceId ?? null,
          sanitizedResult: sanitized, failureReason: decision.outcome === 'paid' ? null : String(decision.reason).slice(0, 500), completedAt: new Date().toISOString(),
        },
      });
      // A newer attempt took over (or staff already decided): keep this attempt's record only.
      if (order.status !== 'verifying' || order.leaseToken !== leaseToken) return order;

      let outcome = decision.outcome;
      let result = decision.result;
      if (outcome === 'paid') {
        const claimed = await claimTransfer(order, decision.claim, 'slip2go');
        if (claimed !== true) { outcome = 'rejected'; result = D.RESULT.duplicate; }
      }
      const status = { paid: 'paid', rejected: 'rejected', retry: 'pending', review: 'awaiting_review' }[outcome];
      const data = {
        status, resultCode: result, leaseToken: null, leaseUntil: null,
        verification: sanitized, reviewNote: null,
      };
      if (outcome === 'paid') Object.assign(data, { verifiedBy: 'slip2go', paidAt: new Date().toISOString() });
      // `paid` → fulfilment by the payment-order lifecycle subscriber (idempotent, recovered if interrupted).
      return docs(ORDER).update({ documentId: orderId, data });
    });
  }

  /**
   * Records the bank transfer for this order. Globally unique: one transfer
   * pays one order. Returns true, or the reason it can't be claimed.
   */
  async function claimTransfer(order, claim, approvedBy) {
    if (!claim?.senderBankId || !claim?.transRef) return 'missing transfer identity';
    const mine = await docs(CLAIM).findFirst({ filters: { orderKey: order.documentId } });
    if (mine) return mine.claimKey === D.claimKey(claim) ? true : 'order already claimed by another transfer';
    const taken = await docs(CLAIM).findFirst({ filters: { $or: [{ claimKey: D.claimKey(claim) }, ...(claim.qrDigest ? [{ qrDigest: claim.qrDigest }] : [])] } });
    if (taken) return 'transfer already used';
    try {
      await docs(CLAIM).create({
        data: {
          order: order.documentId, orderKey: order.documentId, claimKey: D.claimKey(claim), qrDigest: claim.qrDigest || null,
          senderBankId: claim.senderBankId, transRef: claim.transRef, amountSatang: claim.amountSatang, transferAt: claim.transferAt,
          providerReferenceId: claim.providerReferenceId, approvedBy,
        },
      });
      return true;
    } catch (e) {
      // Unique constraint lost a race with another order.
      return `claim conflict: ${e.message}`;
    }
  }

  /**
   * Staff marked an order paid in the admin: if Slip2Go facts are attached,
   * the same uniqueness applies — a transfer already used elsewhere can't pay
   * this order (it's sent back to review with the reason).
   */
  async function claimForStaffApproval(order) {
    const claim = order.verification?.claim;
    if (!claim) return true; // no bank facts (e.g. provider down): staff confirmed against the bank statement
    const r = await claimTransfer(order, claim, 'staff');
    if (r === true) return true;
    await docs(ORDER).update({ documentId: order.documentId, data: { status: 'awaiting_review', resultCode: D.RESULT.duplicate, reviewNote: null } });
    strapi.log.error(`[payments] staff approval blocked for ${order.reference}: ${r}`);
    return false;
  }

  // ---- recovery & housekeeping (scheduled in bootstrap) ---------------------------
  async function recover() {
    const now = new Date().toISOString();
    // Checks interrupted mid-way (crash/timeout): staff decide; the customer must not pay again.
    const stale = await docs(ORDER).findMany({ filters: { status: 'verifying', leaseUntil: { $lt: now } }, limit: 100 });
    for (const o of stale) {
      await inLock(o.documentId, async () => {
        const fresh = await docs(ORDER).findOne({ documentId: o.documentId });
        if (fresh.status === 'verifying' && fresh.leaseUntil && fresh.leaseUntil < now) {
          await docs(ORDER).update({ documentId: o.documentId, data: { status: 'awaiting_review', resultCode: D.RESULT.unavailable, leaseToken: null, leaseUntil: null } });
          strapi.log.warn(`[payments] ${o.reference}: slip check interrupted — sent to staff review`);
        }
      });
    }
    // Paid but not yet delivered (crash between payment and fulfilment): deliver now (idempotent).
    const undelivered = await docs(ORDER).findMany({ filters: { status: 'paid', fulfilledAt: { $null: true }, paidAt: { $lt: new Date(Date.now() - 60_000).toISOString() } }, limit: 100 });
    const { fulfillOrder } = require('./billing');
    for (const o of undelivered) {
      try { await fulfillOrder(strapi, o.documentId); } catch (e) { strapi.log.error(`[payments] delivery retry failed for ${o.reference}: ${e.message}`); }
    }
  }

  /** Slip images are deleted after the retention period unless the order is still under review. */
  async function purgeOldSlips() {
    const cutoff = new Date(Date.now() - retentionDays() * 864e5).toISOString();
    const old = await docs(ATTEMPT).findMany({ filters: { storageKey: { $notNull: true }, createdAt: { $lt: cutoff } }, populate: { order: { fields: ['status'] } }, limit: 500 });
    for (const a of old) {
      if (a.order?.status === 'awaiting_review') continue;
      try { fs.rmSync(path.join(slipDir(strapi), a.storageKey), { force: true }); } catch { /* already gone */ }
      await docs(ATTEMPT).update({ documentId: a.documentId, data: { storageKey: null, slipLink: null } });
    }
  }

  /** Startup check: credentials, package and quota (never logs the secret). */
  async function healthCheck() {
    const cfg = slip2goConfig();
    if (!cfg.enabled) {
      strapi.log.info(`[slip2go] ${cfg.configured ? 'misconfigured' : 'not configured'} — slips go to staff review`);
      return;
    }
    const r = await accountInfo(cfg);
    if (r.body?.code === '200001') {
      const d = r.body.data || {};
      strapi.log.info(`[slip2go] connected: package ${d.package ?? '?'} until ${d.packageExpiredDate ?? '?'}, tokens ${d.tokenRemaining ?? '?'}/${d.tokenLimit ?? '?'}; auto-approve ${cfg.autoApprove ? 'ON' : 'off'}`);
    } else {
      strapi.log.error(`[slip2go] account check failed: ${r.error ?? `code ${r.body?.code} ${r.body?.message ?? ''}`} — slips will go to staff review until fixed`);
    }
  }

  /** Signed-link slip download for staff. */
  async function slipFile(attemptId, exp, sig) {
    if (!verifyLink(attemptId, exp, sig)) return null;
    const a = await docs(ATTEMPT).findOne({ documentId: attemptId });
    if (!a?.storageKey) return null;
    const file = path.join(slipDir(strapi), path.basename(a.storageKey));
    if (!fs.existsSync(file)) return null;
    const ext = path.extname(file).slice(1);
    return { buffer: fs.readFileSync(file), mime: Object.keys(EXT).find((m) => EXT[m] === ext) || 'application/octet-stream' };
  }

  return { PaymentError, submitSlip, finalize, claimTransfer, claimForStaffApproval, recover, purgeOldSlips, healthCheck, slipFile, receiverSnapshot };
};

module.exports.receiverSnapshot = receiverSnapshot;
module.exports.verifyLink = verifyLink;
module.exports.slipLink = slipLink;
