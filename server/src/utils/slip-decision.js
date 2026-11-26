'use strict';

/**
 * Slip2Go verification rules (plannity-context-slip2go.md §5–§7). Pure and
 * unit-tested: no I/O, no clock reads. Provider facts (endpoint, payload,
 * codes, response shape) are from https://slip2go.com/guide; everything else
 * (time window, what needs review) is Plannity policy.
 *
 * HTTP 200 alone is NOT success: only code "200200" with complete, valid data
 * that also passes our own checks may become `paid`. Everything unclear fails
 * closed to `review` (staff decide) — never to a grant.
 */

/** Receiver account types accepted by Slip2Go's checkReceiver. */
const RECEIVER_TYPES = { bank_kbank: '01004', phone_number: '02001', citizen_id: '02003', e_wallet: '02004' };

/** Satang → "349.00" (exact, no float maths). */
function satangToBaht(satang) {
  const n = Number(satang);
  if (!Number.isInteger(n) || n < 0) throw new Error('invalid satang');
  return `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`;
}

/**
 * Provider amount (number like 349 or 349.5, or a string) → integer satang, or
 * null when it isn't an exact amount in at most 2 decimals.
 */
function bahtToSatang(amount) {
  const s = typeof amount === 'number' ? (Number.isFinite(amount) ? String(amount) : '') : String(amount ?? '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) {
    // Numbers like 349.999999 or 1e3 — accept only if they round-trip to 2 decimals exactly.
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    const satang = Math.round(n * 100);
    return Math.abs(satang / 100 - n) < 1e-9 ? satang : null;
  }
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
}

/** Digits only (Slip2Go: account numbers without spaces or symbols). */
const digits = (v) => String(v ?? '').replace(/\D/g, '');
/** Thai/English titles are not allowed in receiver names. */
const stripTitle = (name) => String(name ?? '').trim().replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss)\s*/i, '').trim();

/** checkReceiver entry from the receiver snapshot stored on the order. */
function receiverCheck(receiver) {
  const out = { accountType: receiver.accountType, accountNumber: digits(receiver.accountNumber) };
  if (receiver.nameTH) out.accountNameTH = stripTitle(receiver.nameTH);
  return out;
}

/** The `payload` form field sent with the slip image. */
function buildPayload(order, receiver, { skewMs = 60_000 } = {}) {
  return {
    checkDuplicate: true,
    // Any entry matching passes: the PromptPay ID, and the bank account behind it (as some slips show).
    checkReceiver: [receiverCheck(receiver), ...(receiver.alternates || []).map((a) => receiverCheck({ ...a, nameTH: receiver.nameTH }))],
    checkAmount: { type: 'eq', amount: satangToBaht(order.amountSatang) },
    // Transfers made before the order existed are not accepted (small clock allowance).
    checkDate: { type: 'gte', date: new Date(Date.parse(order.createdAt) - skewMs).toISOString() },
  };
}

/** What the customer is told (UI maps these keys to Thai/English copy). */
const RESULT = {
  paid: 'paid',
  receiverMismatch: 'receiver_mismatch',
  amountMismatch: 'amount_mismatch',
  dateMismatch: 'date_mismatch',
  notFound: 'not_found',
  fraud: 'invalid_slip',
  duplicate: 'duplicate',
  unavailable: 'unavailable', // provider/bank down, timeout, quota… → staff check, don't pay again
  unclear: 'unclear',
};

/**
 * Decide what a provider answer means for an order.
 *
 * @param {{ httpStatus?: number, body?: any, error?: string }} res  provider call result (error = network/timeout/parse failure)
 * @param {{ amountSatang: number|string, createdAt: string, expiresAt?: string|null }} order
 * @param {{ now: string|number, skewMs?: number, notFoundAttempts?: number, autoApprove?: boolean }} opts
 * @returns {{ outcome: 'paid'|'rejected'|'retry'|'review', result: string, code: string|null, alert?: boolean, claim?: object, facts?: object, reason: string }}
 */
function decide(res, order, opts) {
  const now = typeof opts.now === 'number' ? opts.now : Date.parse(opts.now);
  const skew = opts.skewMs ?? 60_000;
  if (!res || res.error) return { outcome: 'review', result: RESULT.unavailable, code: null, reason: `provider call failed: ${res?.error ?? 'no response'}` };

  const body = res.body;
  const code = body && typeof body.code === 'string' ? body.code : body && typeof body.code === 'number' ? String(body.code) : null;
  if (!code) return { outcome: 'review', result: RESULT.unavailable, code: null, reason: `malformed provider response (HTTP ${res.httpStatus})` };

  const facts = extractFacts(body.data);

  switch (code) {
    case '200200': break; // validated below
    case '200401': return { outcome: 'rejected', result: RESULT.receiverMismatch, code, facts, reason: 'recipient does not match' };
    case '200402': return { outcome: 'review', result: RESULT.amountMismatch, code, facts, reason: 'amount does not match' };
    case '200403': return { outcome: 'review', result: RESULT.dateMismatch, code, facts, reason: 'transfer date outside the order window' };
    case '200404':
      return (opts.notFoundAttempts ?? 0) >= 2
        ? { outcome: 'review', result: RESULT.notFound, code, facts, reason: 'slip not found (repeated)' }
        : { outcome: 'retry', result: RESULT.notFound, code, facts, reason: 'slip not found' };
    case '200500': return { outcome: 'rejected', result: RESULT.fraud, code, facts, reason: 'provider flagged the slip as invalid' };
    case '200501': return { outcome: 'rejected', result: RESULT.duplicate, code, facts, reason: 'slip already used' };
    case '401001': case '401002': case '401003': case '401004': case '401005': case '401006': case '401007':
      return { outcome: 'review', result: RESULT.unavailable, code, alert: true, reason: `provider account problem (${code})` };
    default:
      // 200000/200001/200202 (not a passed check), 200502, 400xxx, 429000, 5xx, unknown: never a grant.
      return { outcome: 'review', result: RESULT.unavailable, code, alert: /^(4|5)/.test(code) && code !== '400409', reason: `provider code ${code}` };
  }

  // ---- 200200: the provider says the conditions passed; check everything ourselves too.
  if (!facts) return { outcome: 'review', result: RESULT.unclear, code, reason: 'valid code without data' };
  const missing = ['senderBankId', 'transRef', 'transferAt'].filter((k) => !facts[k]);
  if (missing.length) return { outcome: 'review', result: RESULT.unclear, code, facts, reason: `missing ${missing.join(', ')}` };
  if (facts.amountSatang === null || facts.amountSatang !== Number(order.amountSatang)) {
    return { outcome: 'review', result: RESULT.amountMismatch, code, facts, reason: `amount ${facts.amountSatang} ≠ ${order.amountSatang}` };
  }
  const at = Date.parse(facts.transferAt);
  if (!Number.isFinite(at)) return { outcome: 'review', result: RESULT.unclear, code, facts, reason: 'unreadable transfer time' };
  if (at > now + skew) return { outcome: 'review', result: RESULT.dateMismatch, code, facts, reason: 'transfer time is in the future' };
  if (at < Date.parse(order.createdAt) - skew) return { outcome: 'review', result: RESULT.dateMismatch, code, facts, reason: 'transfer made before the order' };
  if (order.expiresAt && at > Date.parse(order.expiresAt) + skew) return { outcome: 'review', result: RESULT.dateMismatch, code, facts, reason: 'transfer made after the order expired' };

  const claim = {
    senderBankId: facts.senderBankId, transRef: facts.transRef, qrDigest: facts.decode || null,
    amountSatang: facts.amountSatang, transferAt: new Date(at).toISOString(), providerReferenceId: facts.referenceId || null,
  };
  // Verified, but a person approves until auto-approval is switched on (rollout flag).
  if (!opts.autoApprove) return { outcome: 'review', result: RESULT.unclear, code, facts, claim, verified: true, reason: 'verified by Slip2Go — awaiting staff approval (auto-approve off)' };
  return { outcome: 'paid', result: RESULT.paid, code, facts, claim, reason: 'verified' };
}

/** The response fields we keep (sanitized: no names, masked accounts only). */
function extractFacts(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    referenceId: str(data.referenceId),
    transRef: str(data.transRef),
    decode: str(data.decode),
    transferAt: str(data.dateTime),
    amountSatang: data.amount === undefined || data.amount === null ? null : bahtToSatang(data.amount),
    senderBankId: str(data.sender?.bank?.id),
    receiverBankId: str(data.receiver?.bank?.id),
    receiverProxyType: str(data.receiver?.account?.proxy?.type),
    receiverAccountMasked: str(data.receiver?.account?.proxy?.account ?? data.receiver?.account?.bank?.account),
    receiverBankAccountMasked: str(data.receiver?.account?.bank?.account),
  };
}
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Global identity of a bank transfer, for the claim table. */
const claimKey = (claim) => `${claim.senderBankId}:${claim.transRef}`;

module.exports = { RECEIVER_TYPES, RESULT, satangToBaht, bahtToSatang, buildPayload, receiverCheck, stripTitle, decide, extractFacts, claimKey };
