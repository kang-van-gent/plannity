# Plannity — Slip2Go Payment Verification Integration

Version: 0.1 | Reviewed: 2026-11-26 | Branch: `feature/slip2go-payment`

## 1. Goal and scope
Implement automatic verification of uploaded bank transfer slips for Plannity's prepaid PromptPay payments (Kasikorn account). Reuse the existing checkout, wallet, subscription and entitlement services. Slip2Go verifies transfers; it does not itself settle payments or prove which internal order a transfer belongs to. No card payments, recurring debits, auto-renewal, or automatic refunds. No Queue API/webhook needed for MVP. Use synchronous REST verification with a durable payment-attempt record and recoverable fulfillment.

Business rules from Plannity: Solo free; Team THB 349/month; Studio THB 999/month; additional brand THB 99/month on Solo/Team; AI Content and AI Brief THB 10 each. Credits do not expire while account/service remains active. No VAT registration currently; do not issue VAT tax invoices. Use existing pricing configuration as authoritative, not hardcoded frontend amounts. Refund exceptions and disputes follow applicable law and existing terms.

## 2. Official documentation (provider facts)
- Authentication: https://slip2go.com/guide/authentication
- Image REST verification: https://slip2go.com/guide/rest-api/image
- Response codes: https://slip2go.com/guide/response
- Account info: https://slip2go.com/guide/rest-api/account-info
- Generate QR: https://slip2go.com/guide/rest-api/promptpay-qr
- QR image URL alternative: https://slip2go.com/guide/rest-api/promptpay-qr-url
- History: https://slip2go.com/guide/rest-api/slip-history
- Pricing: https://slip2go.com/pricing
- Alternative inputs: https://slip2go.com/guide/rest-api/qr-code and https://slip2go.com/guide/rest-api/base64

Provider endpoints, field names and codes below come from the public documentation. All Plannity routes, schema, time limits, security and UI rules below are proposed implementation decisions, not provider guarantees. Public docs use `{apiUrl}`; obtain the actual API URL and secret from the dashboard rather than guessing. No live credentials or API calls were used in preparing this spec.

## 3. Setup checklist
1. Register at https://app.slip2go.com/ and enable API Connect; confirm quota/plan.
2. Obtain API URL and Secret Key from account settings.
3. Whitelist production server outbound IP(s), if stable. Docs allow up to 10 IPs and default wildcard `*`. Remove wildcard for production when possible.
4. Confirm actual PromptPay identifier, identifier type and registered account name; do not infer from legal ID or bank name. Prefer a phone-based alias if available to avoid exposing national ID in QR payload.
5. Configure secrets only in backend environment; never in Nuxt public runtime config, browser, repository or logs.
6. Verify credentials with `GET /api/account/info`, using `Authorization: Bearer <secret>`; expected informational success code `200001`. Confirm quota and actual response in dashboard/test environment.

```dotenv
SLIP2GO_API_URL=
SLIP2GO_SECRET_KEY=
PROMPTPAY_CODE=
PROMPTPAY_TYPE=phone_number
PAYMENT_RECEIVER_NAME_TH=
PAYMENT_RECEIVER_ACCOUNT_TYPE=02001
PAYMENT_RECEIVER_ACCOUNT_NUMBER=
PAYMENT_ORDER_TTL_MINUTES=30
PAYMENT_SLIP_MAX_BYTES=5242880
SLIP2GO_TIMEOUT_MS=15000
```
Defaults above are proposed, not vendor limits. Fail startup or disable checkout if required values absent or inconsistent. Keep receiver config private; never ship identity numbers in fixtures.

## 4. Checkout and QR
1. Authenticated owner selects SKU and quantity. Backend calculates price in integer satang, snapshots entitlement and receiver, creates order and expiry. Do not trust client amount, credit quantity, plan, beneficiary or dates.
2. Generate amount-specific PromptPay QR. Existing QR implementation can be reused if correct; otherwise use provider endpoint below.
3. Show exact amount, recipient name, QR, order ID and upload button. Explain that QR is not a payment confirmation and order expiration does not prevent bank transfers.
4. User pays in bank app and uploads slip. Use order-specific authorization, not arbitrary wallet ID from browser.

Provider: `POST {apiUrl}/api/qr-payment/generate-qr-code`, bearer auth, JSON.

```json
{
  "promptPayCode": "<configured alias>",
  "promptPayType": "phone_number",
  "accountName": "<registered receiver name>",
  "amount": "349.00"
}
```

Types: `phone_number`, `citizen_id`, `e_wallet`. Response `code: "200"`, `data.qrCode`, `data.accountName`, `data.amount`. Render QR locally from returned code; confirm amount and configuration. Optional `/api/qr-payment/generate-qr-image-link` returns `data.qrImageLink` instead. Do not assume either endpoint produces a unique bank-side order reference. Never use QR generation response as evidence of payment.

## 5. Verify uploaded image (primary provider API)
`POST {apiUrl}/api/verify-slip/qr-image/info`

Headers: `Authorization: Bearer <secret>`, multipart content type with generated boundary.

Multipart parts: `file` (binary slip image), `payload` (serialized JSON string). Unlike QR-code JSON input, image payload is a form field. Example for phone PromptPay:

```json
{
  "checkDuplicate": true,
  "checkReceiver": [{
    "accountType": "02001",
    "accountNumber": "<configured phone alias>",
    "accountNameTH": "<registered name without title>"
  }],
  "checkAmount": {"type": "eq", "amount": "349.00"},
  "checkDate": {"type": "gte", "date": "<order creation UTC ISO timestamp>"}
}
```

Receiver types: `01004` direct Kasikorn bank account, `02001` phone PromptPay, `02003` national ID/tax ID PromptPay, `02004` e-wallet PromptPay. Pick actual route; do not confuse `01004` with response bank ID `004`. Verify the actual receiver matching behavior with real slips. Multiple receiver objects are OR alternatives; each must identify an approved receiver, never add a bank-only or name-only fallback. Use account number and type together; optional name without honorific; normalize number without spaces/symbols according to docs. Returned account numbers may be masked; do not treat suffix alone as proof. Amount checks use `eq`/`gte`/`lte`; choose `eq`. Date uses ISO UTC and one comparator; additionally enforce upper bound locally.

### Node.js backend example (adapt to existing runtime)
```ts
async function verifySlip(file: Buffer, mime: string, filename: string, order: Order) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file)], { type: mime }), filename);
  form.append('payload', JSON.stringify({
    checkDuplicate: true,
    checkReceiver: [order.receiverVerificationConfig],
    checkAmount: { type: 'eq', amount: formatSatang(order.amountSatang) },
    checkDate: { type: 'gte', date: order.createdAt.toISOString() }
  }));
  const response = await fetch(`${config.apiUrl.replace(/\/$/, '')}/api/verify-slip/qr-image/info`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.secret}` },
    body: form,
    signal: AbortSignal.timeout(config.timeoutMs),
    redirect: 'error'
  });
  return parseAndValidateProviderResponse(response.status, await response.json());
}
```
Conceptual code: Order/config/formatSatang/parser must be implemented using existing services. Do not manually set multipart Content-Type with native FormData. Handle non-JSON, network failures and timeouts as unknown outcome; never log request body or secret. Validate API host from trusted configuration.

## 6. Response handling (provider code strings)
HTTP 200 alone is NOT success. Only `200200` with complete expected checks, valid response data and internal verification may auto-fulfill.

| Code | Meaning | Plannity action |
|---|---|---|
| 200200 | Conditions valid | Validate local invariants and claim transfer atomically |
| 200000 | Slip located | Do not auto-credit; review unexpected response |
| 200001 | Information retrieved | Reconciliation only; no automatic approval |
| 200202 | Queue accepted | Unexpected for REST; no fulfillment |
| 200401 | Recipient mismatch | Reject attempt; allow correct slip |
| 200402 | Amount mismatch | Review if actual payment to us; no auto-credit |
| 200403 | Date mismatch | Review late/old transfer; no auto-credit |
| 200404 | Not found | Allow controlled retry or review; not proof of fraud |
| 200500 | Invalid/fraud slip | Reject attempt; no grant |
| 200501 | Duplicate | Check internal claim; if same fulfilled order return existing success; otherwise review/reject |
| 200502 | Bank error | Retryable/unknown; no grant |
| 400409 | Repeated request | Reconcile attempt; no grant |
| 401001–401007 | Provider auth/account/plan/quota/IP failure | Alert operator; no grant |
| 429000 | Rate limit | Backoff, no grant |
| 500500 / 500503 | Provider error/maintenance | Pending review or retry, no grant |
| Unknown or malformed | Unknown | Fail closed |

Extract `data.referenceId`, `data.transRef`, `data.decode`, `data.dateTime`, `data.amount`, `data.sender.bank.id`, recipient information. Validate schema; normalize amount using decimal arithmetic to exact satang, reject invalid decimals, missing identifiers or timestamps. A provider reference may identify a verification request rather than the underlying bank transfer: do not use it alone for deduplication. The provider documentation does not guarantee scope or retention of its duplicate check; maintain own permanent minimal claim ledger while legally necessary.

## 7. Internal payment correctness
- Bind order to authenticated billing owner and immutable SKU/amount/recipient snapshot. A collaborator's membership alone does not authorize purchases from owner's wallet.
- Check transfer time >= order creation and <= order expiry; reject future timestamps beyond configured clock tolerance; persist UTC and display Asia/Bangkok.
- Do not accept arbitrary old slips, even if recipient and amount match. For expired orders, mismatches, or genuine transfer with delayed bank response, allow operator reconciliation without asking customer to pay again automatically.
- A normal PromptPay QR does not bind a payment to order/user. A stolen unused slip of same amount/time is a residual risk. For MVP, restrict to authenticated checkout, use short window, rate limits, private slip submission, and flag ambiguous matching orders for manual reconciliation. Do not claim proof of payer identity. Consider distinct quoted satang amounts or bank merchant order-reference integration later, with explicit pricing/accounting approval. Do not silently alter listed prices.
- Only verified bank-side data, not OCR, frontend status, filenames or image hashes, can authorize fulfillment.

## 8. Data model (adapt to current PostgreSQL/Strapi schema)

### PaymentOrder
`id, billingOwnerId, sku, quantity, amountSatang, currency=THB, productSnapshot, receiverConfigVersion, status, createdAt, expiresAt, paidAt, fulfilledAt`

States: `awaiting_payment`, `verifying`, `needs_review`, `paid`, `fulfilled`, `expired`, `cancelled`. Failed attempts need not permanently fail the order. Paid/fulfilled cannot be reset by customer. Paid but unfulfilled orders must be recoverable.

### PaymentAttempt
`id, orderId, requesterId, idempotencyKey, fileHash, privateStorageKey?, providerReferenceId?, providerCode?, sanitizedResult?, status, createdAt, completedAt, failureReason?`
Unique `(orderId,idempotencyKey)`; store attempt before outbound API call. Use per-order in-flight lease with fencing token to prevent double requests and stale workers overwriting status. Do not hold DB locks during network calls.

### PaymentClaim
`id, orderId, senderBankId, transRef, qrDigest, amountSatang, transferAt, providerReferenceId, createdAt`
Global unique `(senderBankId,transRef)` and unique canonical QR digest when available; unique orderId for single-payment orders. If sender bank ID or transaction reference missing, send for manual review. Keep duplicate scope global, not per user or brand. Test bank-reference uniqueness assumptions with provider before production. File SHA-256 is only a supplemental early-retry signal, not transaction identity.

### Fulfillment / Ledger
Unique `orderId` for fulfillment and immutable credit ledger purchase reference. Use existing credit ledger and subscription tables; do not duplicate them. Record exact credits/product granted and entitlement window. Prefer one database transaction for claim, order payment, ledger/entitlement mutation and completion. If services cross transactions, use transactional outbox and idempotent consumer; never repeat grants after crash.

## 9. Concurrency and recovery
1. Acquire short per-order processing lease atomically; persist attempt.
2. Call provider outside transaction.
3. On valid result, lock order in database transaction; verify owner, status, lease and immutable order fields again.
4. Insert claim with global unique constraints; conflicting order cannot claim same transfer.
5. Grant purchase once using unique order fulfillment key, update order. Commit. On rollback neither claim nor grant should persist (unless outbox model intentionally records paid separately).
6. Duplicate request for fulfilled order returns existing result, not new grant.
7. Timeout after provider consumed slip may return duplicate later. Do not treat duplicate as automatically valid. If known provider reference, `GET /api/verify-slip/{referenceId}` returns information (`200001`); useful for reconciliation but not proof of passed conditions. Operator checks receiver, amount, time and bank statement, then uses same atomic claim/fulfillment path. No manual bypass of deduplication. Record reviewer/reason/evidence.
8. Job scans stale verifying and paid-unfulfilled orders; reconcile safely, alert staff. Avoid unbounded retry or repeatedly spending provider tokens.

## 10. Product activation
- Credit top-up: grant purchased credits from order snapshot; preserve no-expiry rule and existing wallet units (do not assume 1 credit = 1 baht; inspect existing code).
- Team/Studio: prepaid access for configured monthly period; no automatic debit. Renewal of same active plan extends from current expiry; expired renewal starts at activation. Use existing calendar-month semantics or document chosen rule. Mid-cycle upgrades/proration and downgrades must follow pricing spec; if undefined, disable ambiguous purchases pending product decision.
- Brand add-on: grant purchased quota to owner only; align expiry and renewal policy with pricing spec, otherwise restrict until defined.
- Update UI from server wallet/subscription state after fulfillment, not optimistic client credit.

## 11. Proposed internal routes
- `POST /api/payment-orders` create checkout from SKU/quantity.
- `GET /api/payment-orders/:id` owned status and QR details.
- `POST /api/payment-orders/:id/slip` multipart image + idempotency key; return normalized state.
- `GET /api/payment-orders` own transaction history.
- Admin-only review list/action; explicit permission, audit, reason and bank confirmation evidence. Never expose raw provider response, slip or secret to other users.

## 12. UX
Checkout: order summary, exact THB amount, recipient, scannable QR, save QR, expiry, upload JPG/PNG (proposed 5 MB limit; confirm actual vendor limits), upload preview, submit, processing state, result and history. Mobile-friendly. Disable duplicate submit; refresh/poll owned status after interruption. Thai copy: `กำลังตรวจสอบสลิป`, `ชำระเงินสำเร็จ`, `ยอดเงินไม่ตรงกับรายการ`, `ยังยืนยันการชำระเงินไม่ได้ กรุณารอตรวจสอบ ไม่ต้องโอนซ้ำ`, `สลิปนี้ถูกใช้แล้ว`. Do not expose other user's order on duplicate. Distinguish payment received vs entitlement still processing.

## 13. Security, privacy, operations
- Authenticate and authorize all routes. Validate actual image MIME/magic bytes, enforce byte/pixel limits, safe filename, no SVG or arbitrary remote URL. Rate-limit by user/order/IP and cap concurrent checks. No public upload folder; avoid reuse of public content image storage.
- Use HTTPS and private storage. Delete slip binary after proposed short dispute window (e.g. 30 days unless active dispute/legal need); retain minimum accounting and anti-replay records as legally required. Restrict admin access and encrypt sensitive fields; redact names/account numbers/QR/secret from logs. Do not forward slips to AI provider. Update Plannity privacy notice with Slip2Go processing and confirm vendor retention, terms and data protection arrangements before launch.
- Monitoring: provider latency/codes, quota, duplicate attempts, stale orders, fulfillment failures. API plan costs are distinct from Plannity AI credits; some unsuccessful checks consume tokens per provider pricing table. Verify exact quota/cost in dashboard; never assume failures free. Alert on quota/auth/whitelist failures. No blind automatic retry of POST.
- Use separate test fixtures and production secrets; redact real account details. Test with provider-approved sample/real low-value transfers only with operator consent. No live test performed for this document.

## 14. Acceptance tests
- Correct amount/receiver/time and code 200200 -> one credit or entitlement grant.
- HTTP 200 with mismatch, not found, fraud, duplicate or unknown code -> no grant.
- Same slip re-upload, altered/cropped image of same transfer, same slip across two owners, concurrent requests -> at most one claim/grant globally.
- Crash after provider response or after DB commit, network timeout, duplicate result on retry -> recover without double grant; unresolved cases reviewed.
- Expired/old/future slip, wrong receiver, under/overpayment -> no auto-grant; genuine transfers can be reconciled.
- Tampered price/SKU/owner, cross-tenant order ID, oversized/non-image payload -> rejected.
- QR generation code 200 does not activate purchase; account info/history codes do not activate purchase.
- Team/Studio renewal and top-up preserve existing entitlement/credit rules; no auto-renewal.
- Provider outage, malformed JSON, quota exhaustion -> actionable status and operator alert.
- Admin reconciliation audited and uses same uniqueness/fulfillment constraints.
- Secrets and raw slips never appear in frontend bundles, public URLs or logs.

## 15. Coding agent instructions and rollout
1. Inspect current repo, pricing.md, terms/policy, wallet and subscription implementations. Map this spec to actual entities; do not rebuild unrelated checkout.
2. Add provider adapter and mocked contract tests; configure secrets and health check.
3. Implement payment order/attempt/claim migrations and atomic fulfillment; test race conditions against real PostgreSQL.
4. Wire QR and slip upload UI, status and review flow; test mobile.
5. Confirm actual PromptPay alias/type, provider URL/key, matching conditions and image limits in dashboard. Run low-value end-to-end test before enabling auto-fulfillment.
6. Enable behind feature flag, monitor first transactions, keep manual review fallback. Update legal/privacy pages.

Open decisions: real API URL/key and PromptPay alias, vendor file/rate/quota limits, duplicate-check semantics, account matching against masked data, plan-change/proration rules, order TTL and retention approval. Do not invent production credentials or treat proposed defaults as verified provider facts.
