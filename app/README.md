# Plannity — web app (Nuxt)

Frontend demo for Plannity, built from `plannity-spec.md`. It covers the public site (landing, pricing, login, register, privacy, terms) and the full user panel (dashboard, brands, AI generation wizard + job progress, content library + editor, calendar, credits, Upstify promote, settings).

By default it runs on an **in-browser mock backend** with demo data. Setting one environment variable switches it to Strapi (`../server`).

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npx nuxi typecheck   # vue-tsc
npm run build
```

Demo login (mock mode): `demo@example.com` / `plannity123`. The login page also has a "use demo account" button.

## Stack

| Concern | Choice |
|---|---|
| Framework | Nuxt 4, Vue 3, TypeScript. Public pages SSR; `/app/**` client-rendered with `X-Robots-Tag: noindex` |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`). Tokens live in `app/assets/css/main.css` |
| Motion | GSAP 3 + ScrollTrigger |
| Icons | `@lucide/vue` (the successor to the deprecated `lucide-vue-next`) |
| Fonts | Fredoka (display), Plus Jakarta Sans (UI), Noto Sans Thai (Thai) |

## Configuration

Copy `.env.example` to `.env`.

| Variable | Default | Purpose |
|---|---|---|
| `NUXT_PUBLIC_DATA_SOURCE` | `mock` | `mock` or `strapi` |
| `NUXT_STRAPI_URL` | `http://localhost:1337` | Server-only: where the BFF proxy reaches Strapi |
| `NUXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical URLs and sitemap |
| `NUXT_PUBLIC_CREDIT_PRICE_SATANG` | `1000` | Price shown on public pages. Must match the backend |
| `NUXT_PUBLIC_TRIAL_CREDITS` | `3` | Trial credits shown on public pages |
| `NUXT_PUBLIC_CONTACT_EMAIL` | `hello@plannity.example` | Footer contact (placeholder) |

## Project layout

```
app/
  assets/css/main.css        Tailwind v4 theme: brand colours, light/dark surfaces, .btn/.card/.input
  locales/th.ts, en.ts       All UI copy. th is the source of truth; en is type-checked against it
  types/index.ts             Domain types (spec §16) and the AI output contract (spec §9)
  services/api/
    contract.ts              DataSource interface + ApiError ({code,message,fieldErrors,requestId})
    mock/                    Mock backend (localStorage), seed data, template-based "LLM"
    strapi.ts                Strapi 5 adapter (through the BFF)
  plugins/api.ts             Provides $api (mock or strapi)
  plugins/motion.ts          GSAP/ScrollTrigger setup + v-anim / v-parallax directives
  composables/               useLocale, useTheme, useNotify, useSession, useBrands, useWallet, useQuery…
  components/
    ActionCenter.vue         Right-side animated result cards + confirm panel
    SidePanel.vue            The right-side modal used everywhere
    PageCurtain.vue          Page-transition curtain
    ResultIcon.vue           Animated success/warning/error/cancel/info icons
  pages/                     Routes from spec §4
server/
  api/auth/*.post.ts         BFF login/register/logout (JWT kept in an HttpOnly cookie)
  api/bff/[...path].ts       Authenticated proxy to Strapi with a CSRF header check
  routes/sitemap.xml.ts      Sitemap of public routes
public/brand/                Logo assets cut from the approved artwork
scripts/extract-logo.py      Regenerates public/brand from brand-source/
```

## UI conventions

- **Every modal opens from the right.** Use `<SidePanel>` for forms and details, and `useNotify().confirm()` for confirmations.
- **Every action gets a response.** Use `useNotify()`: `success`, `warning`, `error`, `cancel`, `info`, or `fromError(e, { retry })`. Each type has its own animation:
  - success: check draws, then confetti
  - error: the card shakes
  - warning: the icon wobbles
  - cancel: the icon spins in, muted
  - info: a ripple
  
  Cards pause on hover and move left of an open panel so they don't cover it.
- **Entrance animation:** add `v-anim` (or `v-anim="i"` to stagger, or `v-anim="{ from: 'pop' }"`). It is SSR-safe, plays when scrolled into view, waits for the page curtain, and is skipped under `prefers-reduced-motion`.
- **Scroll-scrubbed motion:** `v-parallax="-80"` for decoration. The landing page uses `ScrollTrigger` with `scrub: true` for:
  - the preview tilt
  - the marquee rows
  - the pain-point cards
  - the pinned horizontal "how it works" track (desktop)
  - the deliverables highlight
  - the Upstify circular reveal
  - the final word fill
- **Page transitions:**
  - Between public pages, and when entering or leaving `/app`: a four-colour curtain.
  - Inside `/app`: a blur and slide of the content area.
- **Theme:** light, dark, or system. Stored in a cookie and applied before first paint. Toggling uses a circular View Transition where the browser supports it.
- **Language:** TH (default) or EN, stored in a cookie. Generated content follows each brand's language setting, not the UI language.
- **Every data screen** has loading, empty, error-with-retry, and success states (`useQuery` + `Ui*State` components).

## Mock backend

`services/api/mock` behaves like the API the spec describes, so the UI is built against realistic rules:

- Ownership is enforced. Other tenants' records return 404 (seed includes a second tenant).
- Credits use an append-only ledger with unique operation keys. A job reserves N credits, each successful item consumes 1, and each failed or cancelled item releases 1.
- Generation takes an `Idempotency-Key`. Job progress is simulated over time; polling runs every 2 s and stops when the job finishes.
- Content uses optimistic versioning: a stale save returns `409 VERSION_CONFLICT`. The status rules are enforced.
- Payments run in sandbox only. Credits are granted only by a simulated webhook, never by the client.
- CSV export is UTF-8 with a BOM, and cells that start with `= + - @` are neutralised against formula injection.

**Settings → Demo mode controls** lets you add latency, force API failures (to see error/retry/rollback states), change the item failure rate, preview every notification type, and reset the demo data. Data is stored per browser under `localStorage['plannity-mock-db-v3']`.

## Switching to Strapi

1. Start Strapi from `../server` (see its README). On boot it grants the authenticated role its actions and seeds the curated key dates.
2. Set `NUXT_PUBLIC_DATA_SOURCE=strapi` and `NUXT_STRAPI_URL`, then restart Nuxt.

The browser only talks to Nuxt (`/api/auth/*`, `/api/bff/*`). The Strapi JWT stays in an HttpOnly cookie, and cookie-authenticated writes must send `X-Requested-With: plannity`.

**Works today on Strapi core routes, with ownership enforced:**
- auth (login, register, logout, me)
- brands: CRUD and archive/restore
- contents: list/filter/paginate, get, create, versioned update, archive, duplicate, revisions
- calendar range and key dates
- Upstify inquiries
- feedback

**Still needs custom Strapi controllers** (spec Phases C–D; the adapter already calls these paths):

| Adapter call | Endpoint |
|---|---|
| `dashboard` | `GET /api/dashboard` |
| `generation.*` | `POST/GET /api/generation/jobs`, `POST …/:id/cancel` (reserve + enqueue in one transaction, BullMQ worker) |
| `contents.regenerate` | `POST /api/contents/:id/regenerate` |
| `contents.exportCsv` | `GET /api/contents/export` |
| `credits.*` | `GET /api/credits/balance`, `/api/credits/ledger`, `/api/payments/orders`, `POST /api/payments/webhook` |
| `auth.verifyEmail` | `POST /api/auth/verify` (idempotent trial grant) |
| `auth.updateProfile` | `PUT /api/me` |

## Assumptions and deviations

- **Logo:** used as supplied. `public/brand/*-dark.png` is the same artwork with the dark ink wordmark reversed to near-white so it reads on dark backgrounds. No colours or shapes were changed.
- **Holiday dates:** Loy Krathong 2026 and Chinese New Year 2027 are marked **unverified** in the seed data and the UI. Confirm them before relying on them.
- **Placeholder copy:** the contact email and the privacy/terms text are drafts, labelled as such on the pages.
- **No real integrations:** no real AI provider, payment provider, or email is connected. The mock and sandbox flows are labelled in the UI.
