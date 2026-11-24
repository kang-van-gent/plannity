# Plannity --- Product & Technical Specification

Version: Pre-site V0.1 \| Status: Implementation brief \| Currency: THB \| Default locale: th-TH

## 1. Product vision

แพลตฟอร์มสำหรับ Content Creator, Marketing, Freelancer, Agency และ SME ที่ต้องวางแผนคอนเทนต์เป็นประจำ ลดเวลาจากการคิดหัวข้อ เขียนแคปชั่น บรีฟงาน และจัดตาราง ให้เหลือ workflow เดียว โดยไม่ต้องสมัครสมาชิกแบบรายเดือน

Value proposition: วางแผนคอนเทนต์ทั้งเดือนในไม่กี่นาที เริ่มต้น 10 บาทต่อคอนเทนต์ ปฏิทินใช้ฟรี

## 2. MVP scope

-   Landing Page สาธารณะ พร้อม CTA สมัครและทดลองใช้งาน
-   User Panel: authentication, brand profiles, AI generation, content library, calendar, credits, feedback
-   สร้าง 1--30 คอนเทนต์ต่อคำขอ; แก้ไขและจัดวันเองได้
-   Upstify: ช่องทางส่งคำขอบริการโปรโมต/KOC ที่เปิดเผยความสัมพันธ์อย่างเหมาะสม ไม่สร้าง engagement ปลอมหรือรีวิวหลอกลวง
-   ไม่ทำ auto-post, social account integration, image/video generation, analytics จาก social platform, team collaboration หรือ subscription ใน V0.1


## 2A. Brand identity & creative direction

Product name: **Plannity**. Tagline: **Less planning. More creating.** Brand personality: Creative, Playful, Friendly, Smart. Visual direction เป็น Creative SaaS ไม่ใช่ Corporate ERP. Primary color #6C4CF5; supporting colors #FF6FAE, #FFB23F, #62C5F4, #A7E66B; deep text #211C3A; background #FBFAFF / white. ใช้ soft rounded cards, color blocks, spark, doodle/sticker accents และ micro-interactions ที่ไม่รบกวน accessibility. ภาษาไทยใช้ Noto Sans Thai / Noto Sans Thai UI หรือ webfont ที่เทียบเท่า.

Official logo: ใช้โลโก้ที่ผู้ใช้อนุมัติแล้วซึ่งประกอบด้วย icon สี่เหลี่ยมมนสีม่วงพร้อม white spark, multicolor petals และ wordmark `plannity.` พร้อม tagline. ห้ามสร้างโลโก้ใหม่หรือเปลี่ยนสีหลักใน implementation โดยไม่ได้รับอนุมัติ.

## 3. Business model

1 เครดิต = 1 คอนเทนต์ที่สร้างสำเร็จ = 10 บาท ราคาเป็นค่าเริ่มต้นที่ปรับได้จาก server configuration. 30 คอนเทนต์ = 300 บาท. ให้ทดลองฟรี 3 เครดิตต่อบัญชีที่ยืนยันอีเมลแล้วครั้งเดียว. ปฏิทินและการเพิ่ม/แก้ไขคอนเทนต์เองฟรี. การ regenerate แบบ AI ใช้เครดิตใหม่เมื่อสำเร็จ โดยแสดงราคาก่อนยืนยัน. ไม่มีวันหมดอายุเครดิตใน MVP. ไม่หักเครดิตเมื่อ generation ล้มเหลวหรือผลลัพธ์ไม่ผ่าน validation. ชำระเงินจริงผ่าน payment provider ที่รองรับไทยและ webhook ที่ตรวจสอบได้; หากยังไม่มี credentials ให้ใช้ sandbox และแสดงชัดว่าเป็นโหมดทดสอบ ห้ามแสดงการเติมเงินสำเร็จจาก client callback เพียงอย่างเดียว.

## 4. Information architecture

Public: `/`, `/pricing`, `/login`, `/register`, `/privacy`, `/terms`. Authenticated: `/app`, `/app/brands`, `/app/brands/new`, `/app/brands/:id`, `/app/generate`, `/app/jobs/:id`, `/app/content`, `/app/content/:id`, `/app/calendar`, `/app/credits`, `/app/promote`, `/app/settings`. ทุก app route ต้องตรวจ session; ทุก resource ต้องตรวจ ownership ที่ backend ไม่ใช่แค่ route middleware.

## 5. Landing page

-   Header: โลโก้ Plannity ที่อนุมัติแล้ว (creative purple spark icon + multicolor petals + wordmark), วิธีใช้งาน, ราคา, เข้าสู่ระบบ, CTA ทดลองฟรี
-   Hero: "วางแผนคอนเทนต์ทั้งเดือน ในไม่กี่นาที" / "เริ่มต้น 10 บาทต่อคอนเทนต์ พร้อมปฏิทินฟรี" / CTA เริ่มสร้างคอนเทนต์
-   Product preview: ตัวอย่าง monthly calendar และ content card ที่ระบุว่าเป็นข้อมูลตัวอย่าง
-   Pain points: คิดหัวข้อไม่ทัน, หลายแบรนด์, งานซ้ำ, บรีฟกระจัดกระจาย
-   How it works: สร้างแบรนด์ → ระบุเป้าหมาย → สร้างแผน → จัดปฏิทิน
-   Deliverables: hook, concept, caption, CTA, visual brief, pillar, suggested date
-   Pricing: ฟรีสำหรับ calendar, AI 10 บาท/ชิ้น, ทดลอง 3 ชิ้น; แสดงเงื่อนไขชัดเจน
-   Upstify section: บริการโปรโมตและ creator outreach แบบสมัครใจ ไม่รับประกันยอด engagement
-   FAQ: เครดิต, การแก้ไข, การโพสต์เอง, ความเป็นส่วนตัว, การคืนเครดิตเมื่อระบบผิดพลาด
-   Footer: contact, privacy, terms; ไม่ใช้ testimonial หรือสถิติที่แต่งขึ้น
-   SEO: SSR, title/description, OG, canonical, sitemap, robots; app routes noindex

## 6. User panel layout

Desktop sidebar: Dashboard, Brands, Generate, Content Library, Calendar, Promote, Credits, Settings. Header: brand switcher, credit balance, profile. Mobile: drawer/navigation, responsive cards, calendar list fallback. ทุกหน้ามี loading, empty, error, retry และ success state. ใช้ภาษาไทยเป็นค่าเริ่มต้น รองรับข้อความอังกฤษในเนื้อหาที่สร้าง.

## 7. Authentication & onboarding

Register: email/password, verify email, accept terms/privacy; login/logout/reset password. จำกัดความถี่การ login/reset. Onboarding: ชื่อแบรนด์, ประเภทธุรกิจ, กลุ่มเป้าหมาย, tone of voice, ช่องทางหลัก, เป้าหมาย. ข้ามข้อมูลเสริมได้ แต่ต้องมี brand name และ business description ก่อน generate. หลัง onboarding ไปหน้า Generate. Trial credit grant ต้อง idempotent.

## 8. Brand management

รองรับหลายแบรนด์ต่อบัญชีโดยไม่คิดค่าบริการเพิ่มใน MVP. Fields: name, industry, description, products/services, USP, audience, audience pain points, tone, language, platforms, brand guidelines, forbidden claims/words, competitors (optional), default pillars, CTA preferences. Edit/archive ได้; archive ไม่ลบประวัติ. Brand switcher ต้องเปลี่ยน scope ของ dashboard/library/calendar. เก็บ snapshot ของ brand context ใน generation job เพื่อ reproducibility.

## 9. AI generation wizard

Step 1 เลือกแบรนด์และช่วงวันที่. Step 2 เลือกเป้าหมาย (awareness, engagement, consideration, conversion), campaign, promotion, key dates, platform, จำนวน 1--30, format (static/carousel/short video/text), pillar mix และรายละเอียดเพิ่มเติม. Step 3 สรุปจำนวนเครดิตและยอดคงเหลือก่อนกดยืนยัน. Step 4 แสดง progress และผลลัพธ์รายชิ้น; partial success ต้องระบุจำนวนที่สำเร็จ/ล้มเหลวและเครดิตคืน. Step 5 เลือกบันทึกวันลง calendar หรือเก็บเป็น draft; ผลลัพธ์ทุกชิ้นบันทึก library อัตโนมัติเมื่อสำเร็จ.

Validation: ช่วงวันที่ถูกต้อง, จำนวนเต็ม 1--30, platform/format อยู่ใน allowlist, pillar weights รวม 100 หากกำหนด, จำกัดความยาว input, ตรวจเครดิตก่อน enqueue. ไม่เรียก AI จาก browser. ห้ามให้ model คิดราคา/ส่วนลด/สรรพคุณที่ไม่ได้อยู่ใน brief; ใช้ placeholder หากข้อมูลไม่พอ. ห้ามรับประกันความถูกต้องของวันสำคัญที่ไม่ได้ยืนยัน.

### Output contract per content

``` json
{"title":"หัวข้อ", "concept":"แนวคิด", "pillar":"Education", "objective":"awareness", "platform":"facebook", "format":"carousel", "hook":"ประโยคเปิด", "caption":"ข้อความ", "cta":"คำชวน", "hashtags":["#example"], "visualBrief":"รายละเอียดภาพ", "videoScript":null, "suggestedDate":"2026-12-01", "rationale":"เหตุผลที่เหมาะกับกลุ่มเป้าหมาย"}
```

Video format ต้องมี script และ shot suggestions ใน visualBrief; non-video ให้ videoScript เป็น null. AI response ใช้ JSON schema validation, ไม่ render raw HTML. ดึงหัวข้อย้อนหลังล่าสุดไม่เกิน 90 วันหรือ 100 ชิ้นเป็น context เพื่อช่วยลดการซ้ำ; ตรวจ normalized title ซ้ำและ retry แบบจำกัด. ห้ามอ้างว่าไม่ซ้ำ 100%.

## 10. Content library & editor

List/grid, search title/caption, filter brand/platform/pillar/status/date, sort updated/date. Content detail: แก้ทุก field, copy caption, duplicate แบบ manual ฟรี, archive, assign date, remove date, regenerate แบบเสียเครดิตโดยสร้าง revision ใหม่และเก็บต้นฉบับ. Status: draft → in_review → approved → scheduled → published (ผู้ใช้ยืนยันเอง); อนุญาตย้อนสถานะและ archive. Scheduled ต้องมี scheduled date. Published ต้องมี publishedAt และ optional post URL. ไม่ส่งโพสต์จริง. รองรับ CSV export UTF-8 BOM พร้อมป้องกัน spreadsheet formula injection; fields: date, brand, platform, format, pillar, title, hook, caption, CTA, brief, status, post URL.

## 11. Free content calendar

Month view เป็น default, week/list view, previous/next/today, brand/platform/status filters. การ์ดแสดงหัวข้อ platform และสถานะ. คลิกวันเพื่อเพิ่ม manual content ฟรี; คลิกการ์ดเปิด editor. Drag/drop เปลี่ยนวันและรองรับ keyboard/form alternative. รองรับหลายโพสต์ต่อวัน, unscheduled tray, วันสำคัญไทยจาก curated data ที่มี source/year และแก้เองได้. Timezone Asia/Bangkok; planned date เป็น DATE และเวลาที่ระบุเป็น local time พร้อม timezone. ไม่ใช้ UTC midnight แทนวันปฏิทิน. การลากไม่เปลี่ยน published status อัตโนมัติ. เมื่อบันทึกล้มเหลว rollback UI และแจ้ง retry. ไม่เชื่อม social API หรือ auto-post.

## 12. Dashboard

แสดงเครดิตคงเหลือ, จำนวนคอนเทนต์เดือนนี้, draft/approved/published, upcoming 7 days, งานค้าง, recent generation jobs และ CTA generate. ตัวเลขคำนวณจากข้อมูลในระบบจริง ไม่ใช่ social metrics. Empty state แนะนำสร้างแบรนด์และทดลอง 3 เครดิต.

## 13. Upstify integration

V0.1 เป็น service inquiry ไม่ใช่ระบบ fulfilment อัตโนมัติ. จาก content detail หรือ Promote page เลือกประเภท creator collaboration, community promotion ที่ได้รับอนุญาต หรือ campaign consultation; ระบุ brand, platform, post URL (optional), objective, budget, brief, contact consent. สร้าง inquiry พร้อม reference ID และสถานะ submitted/contacted/quoted/closed. ส่งต่อข้อมูลให้ Upstify เมื่อผู้ใช้ยินยอมเท่านั้น; หากยังไม่มี integration ใช้ admin export/manual follow-up. ไม่หัก AI credits สำหรับบริการนี้; ราคาเสนอแยก. ไม่ขายการปั่นยอดหรือแอบอ้างเป็นลูกค้าจริง.

## 14. Credit ledger & payment

Ledger เป็น append-only; integer credits และเงินเป็น satang. Types: trial_grant, purchase, reserve, consume, release, adjustment. ใช้ balance available/reserved พร้อม transaction และ row lock. เมื่อสร้าง job ให้ reserve N credits แบบ atomic; เมื่อ item สำเร็จ consume 1; ล้มเหลวถาวร release 1. Job cancellation คืนเฉพาะส่วนที่ยังไม่สำเร็จ. Idempotency key ต่อ request และ unique ledger operation ต่อ item. ป้องกัน double charge จาก concurrent requests/retry. Payment order: pending → paid/failed/expired/refunded; webhook verify signature, event ID unique, amount/currency/order match; credit grant และ paid transition ใน transaction เดียว. Reconciliation สำหรับ webhook ตกหล่น. ไม่เก็บข้อมูลบัตร. Credit history แสดงเวลา รายการ จำนวน และยอดคงเหลือ.

## 15. Architecture & stack

Nuxt (Vue, TypeScript, SSR public pages), Strapi (Node.js, custom services/controllers), PostgreSQL, Redis + BullMQ สำหรับ asynchronous jobs, worker process แยกจาก API. ใช้ provider adapter สำหรับ LLM และ payment เพื่อเปลี่ยนผู้ให้บริการได้. ใช้ Docker Compose สำหรับ local/staging: frontend, API, worker, PostgreSQL, Redis. Production ใช้ reverse proxy TLS (Nginx/Caddy), persistent volumes, private DB/Redis network. Pin stable compatible versions และ lockfile. ไม่ต้องใช้ Kubernetes/microservices หลายตัวใน MVP. ใช้ Strapi admin สำหรับดูข้อมูลและ support ภายใน โดยจำกัดสิทธิ์; ไม่ต้องสร้าง admin panel แยก.

## 16. Data model

ใช้ UUID หรือ Strapi documentId เป็น public identifier; กำหนด mapping ให้ชัดเจน. ทุก business entity มี createdAt/updatedAt และ owner ผ่าน brand/user. Critical credit tables ใช้ SQL migration และ constraints.

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  Entity                              Key fields / relationships
  ----------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------
  User                                email unique, verifiedAt, locale, timezone

  Brand                               ownerId FK, name, profile JSON, archivedAt

  Content                             brandId FK, jobItemId nullable unique, fields ตาม output contract, status, scheduledDate, scheduledTime, publishedAt, postUrl, archivedAt, version

  ContentRevision                     contentId FK, snapshot JSON, version unique per content

  GenerationJob                       userId, brandId, inputSnapshot JSON, requestedCount, status, idempotencyKey unique per user, completedCount, failedCount

  GenerationItem                      jobId, ordinal unique per job, status, attempts, errorCode, contentId

  CreditWallet                        userId unique, available, reserved, version; CHECK nonnegative

  CreditLedger                        walletId, operationKey unique, type, deltaAvailable, deltaReserved, jobItemId/paymentId, createdAt

  PaymentOrder                        userId, amountSatang, credits, currency, status, providerRef unique

  PaymentEvent                        providerEventId unique, orderId, processedAt

  Holiday                             date, title, country, source, year

  PromotionInquiry                    userId, brandId, contentId nullable, serviceType, budgetSatang, brief, contactConsentAt, status

  Feedback                            userId, contentId nullable, rating, comment
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Indexes: content(brandId, scheduledDate), content(brandId,status), job(userId,createdAt), item(jobId,status), ledger(walletId,createdAt), inquiry(userId,createdAt). Foreign keys และ deletion policy ต้องชัดเจน; ledger/payment records ไม่ cascade delete. Account deletion anonymize/retain เฉพาะข้อมูลที่จำเป็นตามกฎหมายและนโยบายที่ประกาศ.

## 17. API contract

Base `/api/v1`; JSON, authenticated routes ใช้ secure HttpOnly cookie หรือ BFF session; CSRF protection สำหรับ cookie mutations. Response success `{data,meta}`; error `{error:{code,message,fieldErrors,requestId}}`. Pagination default 20 max 100. Never expose provider secrets.

  ------------------------------------------------------------------------------------------------------------------------------
  Method                  Endpoint                                    Behavior
  ----------------------- ------------------------------------------- ----------------------------------------------------------
  POST                    /auth/register, /auth/login, /auth/logout   account/session

  POST                    /auth/verify, /auth/forgot, /auth/reset     verification/reset

  GET                     /me, /dashboard                             user/summary

  GET/POST                /brands                                     list/create

  GET/PATCH/DELETE        /brands/:id                                 read/update/archive

  POST                    /generation/jobs                            reserve credits + enqueue; 202; Idempotency-Key required

  GET                     /generation/jobs/:id                        progress and result IDs

  POST                    /generation/jobs/:id/cancel                 cancel pending items

  GET/POST                /contents                                   list/manual create

  GET/PATCH/DELETE        /contents/:id                               read/update/archive; optimistic version

  POST                    /contents/:id/regenerate                    new paid job

  GET                     /calendar?from=&to=&brandId=                date range

  GET                     /contents/export                            filtered CSV

  GET                     /credits/balance, /credits/ledger           wallet/history

  POST                    /payments/orders                            create checkout

  GET                     /payments/orders/:id                        payment status

  POST                    /payments/webhook                           signed provider event

  GET/POST                /promotion-inquiries                        list/create

  POST                    /feedback                                   submit feedback
  ------------------------------------------------------------------------------------------------------------------------------

HTTP 400 invalid input, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict/insufficient credits, 429 rate limit, 503 provider unavailable. No cross-tenant reads even with guessed IDs.

## 18. Generation worker & reliability

Job statuses queued/running/completed/partial/failed/cancelled. Reserve credits and create job/items/outbox in one DB transaction; dispatcher publishes outbox to queue with deterministic job ID. Worker processes small batches or individual items with bounded concurrency; retries transient errors with exponential backoff (max 3 attempts), timeout per provider call, no retry on invalid permanent input. Commit validated content, item status and credit consumption atomically. Queue delivery is at-least-once; DB unique constraints and idempotent processing prevent duplicate results. Reconcile stuck jobs and reservations after worker crash. Poll progress every 2--5 seconds while active, stop on terminal state. Track provider token usage and latency; cap generation per account/day via config.

## 19. Security, privacy & UX quality

Tenant isolation in every custom controller/service; disable unnecessary public Strapi collection permissions. Validate inputs, sanitize output, escape HTML, restrict CORS, rate-limit auth/generation/payment, secrets in environment variables. Treat brand text and AI output as untrusted; no tool execution from model response. Avoid sending unnecessary PII to LLM. Log request IDs and error codes without passwords, tokens or raw sensitive prompts. Privacy notice explains AI processing, retention, export/deletion and Upstify consent. Backups daily, restore test before launch. Accessibility: labels, keyboard focus, contrast, reduced motion, mobile layouts. Design: Creative SaaS workspace ที่ playful และมีสีสัน โดยใช้ Creative Purple เป็นสีหลัก (#6C4CF5), Deep Ink (#211C3A), Pink (#FF6FAE), Orange (#FFB23F), Blue (#62C5F4), Green (#A7E66B), พื้นหลัง #FBFAFF/White, การ์ดมุมมน, spark/doodle accents และ typography ที่อ่านง่าย. ใช้โลโก้ Plannity ที่อนุมัติแล้วเท่านั้น; tagline: "Less planning. More creating." Target public LCP under 2.5s on representative mobile connection; paginated queries; async AI requests.

## 20. Implementation plan & acceptance criteria

Phase A: scaffold monorepo, Docker Compose, env example, migrations, landing page, auth, onboarding, brand CRUD. Phase B: manual content editor/library/calendar and dashboard. Phase C: wallet/ledger, mock LLM adapter, worker, real provider adapter, generation wizard and history. Phase D: sandbox payment/webhook, Upstify inquiry, CSV export, feedback, QA and staging. Deploy real payments only after verified provider setup.

Acceptance tests: - Anonymous visitor can see landing and register; protected routes redirect to login. - Verified user gets exactly 3 trial credits, including repeated verification requests. - User A cannot read or edit User B brand/content/job/wallet. - Manual content create/edit/calendar move does not change credits. - Generate 3 items with 3 credits: all successful items persist and consume exactly 3. - Generate 3 items with 2 credits: rejected without queueing or negative balance. - Two simultaneous requests cannot overspend wallet. - Partial job with 2 successful and 1 failed item consumes 2 and releases 1. - Replayed request, worker delivery and payment webhook do not double charge/grant. - Worker crash after provider response does not duplicate content or ledger consumption. - Calendar shows correct Thai local dates and supports mobile list view. - Mark published manually; no external social posting occurs. - Export opens correctly with Thai characters and safe cell values. - Promotion inquiry requires consent before sharing; no AI credits deducted. - Invalid AI JSON never becomes a billable content item. - Landing has no fake testimonials; pricing matches backend configuration.

## 21. Repository & developer handoff

Suggested structure: `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `infra`, `docs`, `tests`. Include README with install, migrate, seed, start, test and deployment steps; `.env.example` with DATABASE_URL, REDIS_URL, APP_KEYS, JWT_SECRET, LLM_PROVIDER, LLM_API_KEY, PAYMENT_PROVIDER, PAYMENT_WEBHOOK_SECRET, PUBLIC_APP_URL, CREDIT_PRICE_SATANG. Never commit secrets. Seed demo brand/content only in development. CI: lint, typecheck, unit tests, integration tests against test PostgreSQL/Redis, build; E2E via Playwright. Unit tests for pricing/schema; integration for ownership, ledger, jobs/webhook; E2E for onboarding, generation, calendar.

## 22. Validation metrics & decisions after launch

Track consent-aware events: landing CTA, registration, brand created, first generation, generation success/failure, calendar use, credit purchase, repeat purchase, promotion inquiry. Initial experiment: 10--20 target users; measure activation, willingness to pay 10 THB, repeat use after 30 days, cost per successful content, manual editing rate, inquiry conversion. These are hypotheses, not guaranteed outcomes. Keep calendar free; revisit packages only after real usage. Do not expand scope to auto-post or full agency ERP until core retention is proven.

## 23. Instructions for Codex

Treat this file as source of truth. First inspect repository; if empty scaffold the stack. Create an implementation checklist and implement phases in order. Prioritize working end-to-end vertical slices over decorative screens. Use mocks only behind explicit development configuration and label them. Do not invent provider credentials, external integrations, or completed payments. Document assumptions and deviations. Run tests after each phase. Deliver a runnable local environment and staging deployment instructions. Definition of done: both public landing and authenticated user panel work, AI generation can be tested end-to-end, calendar persists real data, credit accounting is atomic, and acceptance tests pass.
