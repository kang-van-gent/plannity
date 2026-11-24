# Plannity — API (Strapi 5)

Content types, owner-scoped controllers, and bootstrap for the Plannity frontend (`../app`).

## What's here

- **`src/api/*`** — collections from spec §16:
  - user-owned: `brand`, `content`, `content-revision`, `holiday`, `promotion-inquiry`, `feedback`, `generation-job`
  - internal (written only by services): `generation-item`, `credit-wallet`, `credit-ledger`, `payment-order`, `payment-event`
- **`src/utils/owner-scoped.js`** — tenant isolation for every user-owned collection:
  - Reads are always filtered to `ctx.state.user`.
  - Another user's record returns **404**, so IDs can't be probed.
  - `owner` is taken from the session, never from the request body.
  - Relations such as `brand` and `content` must point at the caller's own records.
  - Optional optimistic versioning (`409 VERSION_CONFLICT`) and business-rule validation, using the spec error envelope `{error:{code,message,fieldErrors,requestId}}`.
- **`src/api/content/controllers`** — status rules: `scheduled` needs a date, and `published` stamps `postedAt`. (`publishedAt` is reserved by Strapi; the frontend adapter maps between the two.)
- **`src/api/promotion-inquiry/controllers`** — consent is required; reference, status, and `contactConsentAt` are set by the server.
- **`src/index.js` bootstrap** (idempotent):
  - Grants the *authenticated* role only the actions the app uses.
  - Credit, payment, and generation tables are never exposed.
  - Seeds the curated Thai key dates from `src/seed/holidays.json`.

## Verified locally

A throwaway SQLite database was booted with two users. These all behaved correctly:

- isolation on list, get, update, and delete
- cross-tenant relation attach is blocked
- body `owner` spoofing is ignored
- version conflict returns 409
- the status rules are enforced
- the consent rule is enforced
- curated dates are shared and read-only
- anonymous access is rejected
- credit routes are not exposed

## Still to build (spec Phases C–D)

Custom routes the frontend adapter already calls:

- `GET /api/dashboard`
- `/api/generation/jobs` (create/get/list/cancel): reserve credits and enqueue in one transaction, BullMQ worker, outbox
- `POST /api/contents/:id/regenerate`
- `GET /api/contents/export`
- `/api/credits/balance`, `/api/credits/ledger`
- `/api/payments/orders`, `POST /api/payments/webhook` (signature verification, unique event id)
- `POST /api/auth/verify` (idempotent trial grant)
- `PUT /api/me`

Also needed: SQL migrations for the constraints the schema can't express:

- `CHECK (available >= 0 AND reserved >= 0)` on wallets
- unique `(job, ordinal)` on generation items
- the indexes from spec §16

---

# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
