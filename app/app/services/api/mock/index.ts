// DEVELOPMENT MOCK BACKEND — runs entirely in the browser and persists to
// localStorage. It deliberately enforces the same business rules the Strapi
// API must enforce (ownership, atomic credit reserve/consume/release,
// idempotency, optimistic versions, sandbox-only payments) so the UI is
// built against realistic behaviour. Enabled when NUXT_PUBLIC_DATA_SOURCE=mock.

import type {
  Brand, BrandInput, Content, ContentDraft, ContentQuery, DashboardSummary, GenerationInput, GenerationJob,
  Holiday, ItemStatus, LedgerEntry, LedgerType, Paginated, PaymentOrder, PromotionInquiry, User, Wallet,
} from '~/types'
import { CONTENT_STATUSES, FORMATS, OBJECTIVES, PLATFORMS } from '~/types'
import { addDays, diffDays, isValidISODate, nowISO, todayISO } from '~/utils/date'
import { normalizeTitle, uid } from '~/utils/format'
import { buildContentCsv } from '~/utils/csv'
import { ApiError, type DataSource } from '../contract'
import { buildSeed, type MockDB, type MockJob, type Owned } from './seed'
import { hashString, mockGenerate, validateDraft } from './llm'

const DB_KEY = 'plannity-mock-db-v3'
const CFG_KEY = 'plannity-mock-config'
const PRICE_SATANG = 1000
const TRIAL_CREDITS = 3

export interface MockConfig {
  /** Average simulated latency in ms. */
  latency: number
  /** Probability (0–1) that any request fails with 503, to exercise error/retry states. */
  failRate: number
  /** Probability (0–1) that a generated item fails permanently (credit is released). */
  itemFailRate: number
}

const defaultConfig: MockConfig = { latency: 380, failRate: 0, itemFailRate: 0.08 }
let config: MockConfig = { ...defaultConfig }
let db: MockDB | null = null

function storage(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null
}

function load(): MockDB {
  if (db) return db
  const raw = storage()?.getItem(DB_KEY)
  if (raw) {
    try { db = JSON.parse(raw) as MockDB } catch { db = null }
  }
  if (!db) { db = buildSeed(); persist() }
  return db
}

function persist() {
  if (db) storage()?.setItem(DB_KEY, JSON.stringify(db))
}

export const mockAdmin = {
  getConfig(): MockConfig {
    const raw = storage()?.getItem(CFG_KEY)
    if (raw) try { config = { ...defaultConfig, ...JSON.parse(raw) } } catch { /* ignore */ }
    return { ...config }
  },
  setConfig(next: Partial<MockConfig>) {
    config = { ...config, ...next }
    storage()?.setItem(CFG_KEY, JSON.stringify(config))
  },
  reset() {
    db = buildSeed()
    persist()
  },
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function net(opts: { canFail?: boolean; latency?: number } = {}) {
  mockAdmin.getConfig()
  await sleep((opts.latency ?? config.latency) * (0.6 + Math.random() * 0.8))
  if (opts.canFail !== false && Math.random() < config.failRate) {
    throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Simulated network failure (mock failRate)')
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
function strip<T extends { ownerId?: unknown }>(row: T): Omit<T, 'ownerId'> {
  const { ownerId: _o, ...rest } = clone(row)
  return rest
}
const nextSeq = () => ++load().seq

export function createMockSource(getToken: () => string | null | undefined): DataSource {
  // ---------------------------------------------------------------- helpers
  function currentUser(): MockDB['users'][number] {
    const token = getToken()
    const u = token ? load().users.find((x) => x.id === token) : undefined
    if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in')
    return u
  }
  const uidOf = () => currentUser().id

  function ownBrand(id: string): Owned<Brand> {
    const b = load().brands.find((x) => x.id === id && x.ownerId === uidOf())
    // Same 404 for "missing" and "someone else's" — no cross-tenant probing.
    if (!b) throw new ApiError(404, 'NOT_FOUND', 'Brand not found')
    return b
  }
  function ownContent(id: string): Owned<Content> {
    const c = load().contents.find((x) => x.id === id && x.ownerId === uidOf())
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Content not found')
    return c
  }
  function wallet(userId: string) {
    const d = load()
    return (d.wallets[userId] ??= { available: 0, reserved: 0 })
  }
  /** Append-only ledger with unique operation keys: replays become no-ops. */
  function post(userId: string, type: LedgerType, dA: number, dR: number, refType: LedgerEntry['refType'], refId: string | null, operationKey: string): boolean {
    const d = load()
    if (d.ledger.some((l) => l.ownerId === userId && l.operationKey === operationKey)) return false
    const w = wallet(userId)
    if (w.available + dA < 0 || w.reserved + dR < 0) throw new ApiError(409, 'INSUFFICIENT_CREDITS', 'Not enough credits')
    w.available += dA
    w.reserved += dR
    d.ledger.push({ id: `l_${nextSeq()}`, ownerId: userId, type, deltaAvailable: dA, deltaReserved: dR, availableAfter: w.available, refType, refId, operationKey, createdAt: nowISO() })
    return true
  }
  function walletView(userId: string): Wallet {
    const w = wallet(userId)
    return { available: w.available, reserved: w.reserved, creditPriceSatang: PRICE_SATANG }
  }
  function fieldError(fields: Record<string, string>): never {
    throw new ApiError(400, 'INVALID_INPUT', 'Please check the highlighted fields', fields)
  }
  function snapshot(c: Content): ContentDraft {
    const { title, concept, pillar, objective, platform, format, hook, caption, cta, hashtags, visualBrief, videoScript, suggestedDate, rationale } = c
    return clone({ title, concept, pillar, objective, platform, format, hook, caption, cta, hashtags, visualBrief, videoScript, suggestedDate, rationale })
  }
  function addRevision(c: Owned<Content>, reason: 'edit' | 'regenerate' | 'create') {
    load().revisions.push({ id: `r_${nextSeq()}`, ownerId: c.ownerId, contentId: c.id, version: c.version, reason, snapshot: clone(c), createdAt: nowISO() })
  }

  // ------------------------------------------------------- job simulation
  // A deterministic stand-in for the BullMQ worker (spec §18): each item
  // finishes on a schedule relative to job start; commits content + credit
  // consumption together; permanent failures release the reserved credit.
  function advance(job: MockJob) {
    if (['completed', 'partial', 'failed', 'cancelled'].includes(job.status)) return
    const d = load()
    const elapsed = Date.now() - job.startedAt
    const brand = d.brands.find((b) => b.id === job.brandId)!
    const titles = new Set(d.contents.filter((c) => c.brandId === job.brandId && diffDays(todayISO(), c.createdAt.slice(0, 10)) <= 90).slice(-100).map((c) => normalizeTitle(c.title)))
    let changed = false
    for (const item of job.items) {
      if (item.status !== 'pending' && item.status !== 'running') continue
      const due = 1400 + item.ordinal * 850
      if (elapsed < due - 850) continue
      if (elapsed < due) { if (item.status !== 'running') { item.status = 'running'; item.attempts = 1; changed = true } continue }
      const roll = (hashString(`${job.id}:${item.ordinal}`) % 1000) / 1000
      const failRate = /#fail/i.test(job.input.notes) ? 0.4 : config.itemFailRate
      const p = job.plan[item.ordinal]!
      const draft = roll < failRate ? null : mockGenerate({
        brand, ordinal: item.ordinal, pillar: p.pillar, objective: job.input.objective, platform: p.platform, format: p.format,
        date: p.date, promotion: job.input.promotion, campaign: job.input.campaign, existingTitles: titles, seed: `${job.id}-${item.ordinal}`,
      })
      if (draft && validateDraft(draft)) {
        const id = `c_${nextSeq()}`
        const now = nowISO()
        const content: Owned<Content> = {
          ...draft, id, ownerId: job.ownerId, brandId: job.brandId, jobItemId: item.id, source: 'ai', status: 'draft',
          scheduledDate: null, scheduledTime: null, publishedAt: null, postUrl: null, archivedAt: null, version: 1, createdAt: now, updatedAt: now,
        }
        d.contents.push(content)
        addRevision(content, 'create')
        post(job.ownerId, 'consume', 0, -1, 'item', item.id, `consume:${item.id}`)
        Object.assign(item, { status: 'succeeded' as ItemStatus, contentId: id, attempts: Math.max(1, item.attempts) })
        job.completedCount++
      } else {
        // Invalid output or provider failure after max retries: never billable.
        post(job.ownerId, 'release', 1, -1, 'item', item.id, `release:${item.id}`)
        Object.assign(item, { status: 'failed' as ItemStatus, attempts: 3, errorCode: draft ? 'INVALID_JSON' : 'PROVIDER_TIMEOUT' })
        job.failedCount++
      }
      changed = true
    }
    const open = job.items.some((i) => i.status === 'pending' || i.status === 'running')
    const next = open
      ? (job.items.some((i) => i.status !== 'pending') ? 'running' : 'queued')
      : job.failedCount === 0 ? 'completed' : job.completedCount === 0 ? 'failed' : 'partial'
    if (next !== job.status) { job.status = next; changed = true }
    if (changed) { job.updatedAt = nowISO(); persist() }
  }
  function jobView(job: MockJob): GenerationJob {
    advance(job)
    const { idempotencyKey: _k, startedAt: _s, plan: _p, ownerId: _o, ...rest } = clone(job)
    return rest
  }

  function expireOrders(userId: string) {
    for (const o of load().orders) {
      if (o.ownerId === userId && o.status === 'pending' && Date.now() - Date.parse(o.createdAt) > 30 * 60_000) o.status = 'expired'
    }
  }

  // ------------------------------------------------------------ the API
  const source: DataSource = {
    kind: 'mock',

    auth: {
      async login(email, password) {
        await net({ canFail: false })
        const d = load()
        const key = email.trim().toLowerCase()
        const recent = (d.loginAttempts[key] ?? []).filter((t) => Date.now() - t < 10 * 60_000)
        if (recent.length >= 5) throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.')
        const u = d.users.find((x) => x.email === key && x.password === password)
        if (!u) {
          d.loginAttempts[key] = [...recent, Date.now()]
          persist()
          throw new ApiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect')
        }
        d.loginAttempts[key] = []
        persist()
        const { password: _p, ...user } = clone(u)
        return { user, token: u.id }
      },
      async register(input) {
        await net({ canFail: false })
        const d = load()
        const email = input.email.trim().toLowerCase()
        const errors: Record<string, string> = {}
        if (!input.name.trim()) errors.name = 'required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'invalid_email'
        else if (d.users.some((u) => u.email === email)) errors.email = 'email_taken'
        if (input.password.length < 8) errors.password = 'password_short'
        if (!input.acceptTerms) errors.acceptTerms = 'must_accept'
        if (Object.keys(errors).length) fieldError(errors)
        const user: User = { id: `u_${nextSeq()}`, email, name: input.name.trim(), verifiedAt: null, locale: 'th', timezone: 'Asia/Bangkok', createdAt: nowISO() }
        d.users.push({ ...user, password: input.password })
        d.wallets[user.id] = { available: 0, reserved: 0 }
        persist()
        return { user, token: user.id }
      },
      async social(provider) {
        // Demo: one account per provider, email already verified by the "provider".
        await net({ canFail: false, latency: 700 })
        const d = load()
        const email = `${provider}.demo@plannity.example`
        let u = d.users.find((x) => x.email === email)
        if (!u) {
          const name = { google: 'Google Demo', facebook: 'Facebook Demo', apple: 'Apple Demo' }[provider]
          u = { id: `u_${nextSeq()}`, email, name, verifiedAt: nowISO(), locale: 'th', timezone: 'Asia/Bangkok', createdAt: nowISO(), password: crypto.randomUUID() }
          d.users.push(u)
          d.wallets[u.id] = { available: 0, reserved: 0 }
          post(u.id, 'trial_grant', TRIAL_CREDITS, 0, null, null, `trial:${u.id}`)
          persist()
        }
        const { password: _p, ...user } = clone(u)
        return { user, token: u.id }
      },
      async verifyEmail() {
        await net({ canFail: false })
        const u = currentUser()
        if (!u.verifiedAt) u.verifiedAt = nowISO()
        // Idempotent: the unique operation key prevents a second grant.
        const granted = post(u.id, 'trial_grant', TRIAL_CREDITS, 0, null, null, `trial:${u.id}`) ? TRIAL_CREDITS : 0
        persist()
        const { password: _p, ...user } = clone(u)
        return { granted, user }
      },
      async forgot() {
        // Always succeeds so the response never reveals whether an account exists.
        await net({ canFail: false })
      },
      async logout() { await net({ canFail: false, latency: 120 }) },
      async me() {
        await net({ canFail: false, latency: 60 })
        const { password: _p, ...user } = clone(currentUser())
        return user
      },
      async updateProfile(input) {
        await net()
        const u = currentUser()
        if (input.name !== undefined) {
          if (!input.name.trim()) fieldError({ name: 'required' })
          u.name = input.name.trim()
        }
        if (input.locale) u.locale = input.locale
        persist()
        const { password: _p, ...user } = clone(u)
        return user
      },
    },

    async dashboard(brandId) {
      await net()
      const d = load()
      const me = uidOf()
      const today = todayISO()
      const scope = d.contents.filter((c) => c.ownerId === me && !c.archivedAt && (!brandId || c.brandId === brandId)
        && !d.brands.find((b) => b.id === c.brandId)?.archivedAt)
      const statusCounts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, scope.filter((c) => c.status === s).length])) as DashboardSummary['statusCounts']
      const byDate = (a: Content, b: Content) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '')
      const jobs = d.jobs.filter((j) => j.ownerId === me && (!brandId || j.brandId === brandId))
      jobs.forEach(advance)
      return {
        wallet: walletView(me),
        brandCount: d.brands.filter((b) => b.ownerId === me && !b.archivedAt).length,
        monthCount: scope.filter((c) => c.scheduledDate?.slice(0, 7) === today.slice(0, 7)).length,
        statusCounts,
        upcoming: scope.filter((c) => c.scheduledDate && c.scheduledDate >= today && c.scheduledDate <= addDays(today, 6)).sort(byDate).slice(0, 8).map(strip),
        backlog: scope.filter((c) => c.status !== 'published' && c.scheduledDate && (c.scheduledDate < today
          || (['draft', 'in_review'].includes(c.status) && c.scheduledDate <= addDays(today, 7)))).sort(byDate).slice(0, 6).map(strip),
        recentJobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(jobView),
      }
    },

    brands: {
      async list(opts) {
        await net()
        const d = load()
        const me = uidOf()
        return d.brands
          .filter((b) => b.ownerId === me && (opts?.includeArchived || !b.archivedAt))
          .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.createdAt.localeCompare(b.createdAt))
          .map((b) => ({ ...strip(b), contentCount: d.contents.filter((c) => c.brandId === b.id && !c.archivedAt).length }))
      },
      async get(id) {
        await net()
        return strip(ownBrand(id))
      },
      async create(input) {
        await net()
        validateBrand(input)
        const now = nowISO()
        const b: Owned<Brand> = { id: `b_${nextSeq()}`, ownerId: uidOf(), name: input.name.trim(), color: input.color, profile: clone(input.profile), archivedAt: null, createdAt: now, updatedAt: now }
        load().brands.push(b)
        persist()
        return strip(b)
      },
      async update(id, input) {
        await net()
        const b = ownBrand(id)
        const merged = { name: input.name ?? b.name, color: input.color ?? b.color, profile: { ...b.profile, ...input.profile } }
        validateBrand(merged)
        Object.assign(b, merged, { updatedAt: nowISO() })
        persist()
        return strip(b)
      },
      async archive(id) {
        await net()
        const b = ownBrand(id)
        b.archivedAt = nowISO() // history is retained, nothing is deleted
        persist()
        return strip(b)
      },
      async restore(id) {
        await net()
        const b = ownBrand(id)
        b.archivedAt = null
        persist()
        return strip(b)
      },
    },

    contents: {
      async list(q) {
        await net()
        return paginate(filterContents(q), q)
      },
      async get(id) {
        await net()
        return strip(ownContent(id))
      },
      async create(input) {
        await net()
        ownBrand(input.brandId)
        if (!input.title?.trim()) fieldError({ title: 'required' })
        if (input.scheduledDate && !isValidISODate(input.scheduledDate)) fieldError({ scheduledDate: 'invalid_date' })
        const brand = ownBrand(input.brandId)
        const now = nowISO()
        const c: Owned<Content> = {
          title: input.title.trim(), concept: input.concept ?? '', pillar: input.pillar ?? brand.profile.pillars[0] ?? 'Education',
          objective: input.objective ?? 'engagement', platform: input.platform ?? brand.profile.platforms[0] ?? 'facebook',
          format: input.format ?? 'static', hook: input.hook ?? '', caption: input.caption ?? '', cta: input.cta ?? '',
          hashtags: input.hashtags ?? [], visualBrief: input.visualBrief ?? '', videoScript: input.videoScript ?? null,
          suggestedDate: null, rationale: '',
          id: `c_${nextSeq()}`, ownerId: uidOf(), brandId: input.brandId, jobItemId: null, source: 'manual',
          status: input.scheduledDate ? (input.status ?? 'draft') : 'draft', scheduledDate: input.scheduledDate ?? null,
          scheduledTime: input.scheduledTime ?? null, publishedAt: null, postUrl: null, archivedAt: null, version: 1, createdAt: now, updatedAt: now,
        }
        load().contents.push(c)
        addRevision(c, 'create')
        persist()
        return strip(c)
      },
      async update(id, patch) {
        await net()
        const c = ownContent(id)
        if (patch.version !== c.version) throw new ApiError(409, 'VERSION_CONFLICT', 'This content was changed elsewhere. Reload to get the latest version.')
        const next = { ...c, ...patch }
        if (next.brandId !== c.brandId) ownBrand(next.brandId)
        const errors: Record<string, string> = {}
        if (!next.title?.trim()) errors.title = 'required'
        if (next.scheduledDate && !isValidISODate(next.scheduledDate)) errors.scheduledDate = 'invalid_date'
        if (next.status === 'scheduled' && !next.scheduledDate) errors.scheduledDate = 'needs_date'
        if (next.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.scheduledTime)) errors.scheduledTime = 'invalid_time'
        if (next.postUrl && !/^https?:\/\//i.test(next.postUrl)) errors.postUrl = 'invalid_url'
        if (Object.keys(errors).length) fieldError(errors)
        if (next.status === 'published' && !next.publishedAt) next.publishedAt = nowISO()
        if (next.status !== 'published') next.publishedAt = null
        const contentChanged = (['title', 'caption', 'hook', 'concept', 'cta', 'visualBrief', 'videoScript'] as const).some((k) => k in patch && patch[k] !== c[k])
        if (contentChanged) addRevision(c, 'edit')
        Object.assign(c, next, { version: c.version + 1, updatedAt: nowISO() })
        persist()
        return strip(c)
      },
      async archive(id) {
        await net()
        const c = ownContent(id)
        Object.assign(c, { archivedAt: nowISO(), version: c.version + 1, updatedAt: nowISO() })
        persist()
        return strip(c)
      },
      async duplicate(id) {
        await net()
        const src = ownContent(id)
        const now = nowISO()
        const copy: Owned<Content> = { ...clone(src), id: `c_${nextSeq()}`, title: `${src.title} (copy)`, jobItemId: null, source: 'manual', status: 'draft', scheduledDate: null, scheduledTime: null, publishedAt: null, postUrl: null, version: 1, createdAt: now, updatedAt: now }
        load().contents.push(copy)
        persist()
        return strip(copy)
      },
      async revisions(id) {
        await net()
        ownContent(id)
        return load().revisions.filter((r) => r.contentId === id).sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))
          .map((r) => ({ id: r.id, contentId: r.contentId, version: r.version, reason: r.reason, snapshot: snapshot(r.snapshot), createdAt: r.createdAt }))
      },
      async regenerate(id, key) {
        await net({ latency: 1400 })
        const d = load()
        const me = uidOf()
        const c = ownContent(id)
        const opKey = `regen:${me}:${key}`
        if (d.idempotency[opKey]) return strip(c)
        const brand = ownBrand(c.brandId)
        if (wallet(me).available < 1) throw new ApiError(409, 'INSUFFICIENT_CREDITS', 'Not enough credits')
        const itemId = `ri_${nextSeq()}`
        post(me, 'reserve', -1, 1, 'item', itemId, `reserve:${itemId}`)
        const titles = new Set(d.contents.filter((x) => x.brandId === c.brandId).map((x) => normalizeTitle(x.title)))
        const draft = mockGenerate({ brand, ordinal: c.version, pillar: c.pillar, objective: c.objective, platform: c.platform, format: c.format, date: c.suggestedDate, existingTitles: titles, seed: `${c.id}-regen-${c.version}-${key}` })
        if (!validateDraft(draft)) {
          post(me, 'release', 1, -1, 'item', itemId, `release:${itemId}`)
          persist()
          throw new ApiError(503, 'PROVIDER_UNAVAILABLE', 'Generation failed. No credit was charged.')
        }
        addRevision(c, 'regenerate') // original is kept as a revision
        Object.assign(c, draft, { suggestedDate: c.suggestedDate, version: c.version + 1, updatedAt: nowISO() })
        post(me, 'consume', 0, -1, 'item', itemId, `consume:${itemId}`)
        d.idempotency[opKey] = itemId
        persist()
        return strip(c)
      },
      async exportCsv(q) {
        await net()
        const rows = filterContents({ ...q, page: 1, pageSize: 10_000 })
        return buildContentCsv(rows, load().brands.filter((b) => b.ownerId === uidOf()))
      },
    },

    calendar: {
      async range(from, to, brandId, opts = {}) {
        await net()
        const withTray = opts.includeUnscheduled !== false
        const d = load()
        const archivedBrands = new Set(d.brands.filter((b) => b.archivedAt).map((b) => b.id))
        return d.contents
          .filter((c) => c.ownerId === uidOf() && !c.archivedAt && !archivedBrands.has(c.brandId) && (!brandId || c.brandId === brandId)
            && (c.scheduledDate === null ? withTray : c.scheduledDate >= from && c.scheduledDate <= to))
          .map(strip)
      },
      async holidays(from, to) {
        await net({ latency: 150 })
        const me = uidOf()
        return load().holidays.filter((h) => (h.ownerId === null || h.ownerId === me) && h.date >= from && h.date <= to).map(strip)
      },
      async addHoliday(input) {
        await net()
        if (!isValidISODate(input.date)) fieldError({ date: 'invalid_date' })
        if (!input.title.th.trim() && !input.title.en.trim()) fieldError({ title: 'required' })
        const h: Holiday & { ownerId: string } = {
          id: `h_${nextSeq()}`, ownerId: uidOf(), date: input.date, title: { th: input.title.th || input.title.en, en: input.title.en || input.title.th },
          kind: 'custom', country: 'TH', source: 'user', year: Number(input.date.slice(0, 4)), verified: true, custom: true,
        }
        load().holidays.push(h)
        persist()
        return strip(h)
      },
      async removeHoliday(id) {
        await net()
        const d = load()
        const i = d.holidays.findIndex((h) => h.id === id && h.ownerId === uidOf())
        if (i < 0) throw new ApiError(404, 'NOT_FOUND', 'Key date not found')
        d.holidays.splice(i, 1)
        persist()
      },
    },

    generation: {
      async create(input, idempotencyKey) {
        await net({ latency: 700 })
        const d = load()
        const me = uidOf()
        if (!idempotencyKey) throw new ApiError(400, 'INVALID_INPUT', 'Idempotency-Key is required')
        const existing = d.idempotency[`job:${me}:${idempotencyKey}`]
        if (existing) return jobView(d.jobs.find((j) => j.id === existing)!)
        const brand = ownBrand(input.brandId)
        validateGeneration(input, brand)
        if (wallet(me).available < input.count) {
          throw new ApiError(409, 'INSUFFICIENT_CREDITS', 'Not enough credits', { count: 'insufficient_credits' })
        }
        const jobId = `j_${nextSeq()}`
        // Reserve all N credits atomically before anything is queued.
        post(me, 'reserve', -input.count, input.count, 'job', jobId, `reserve:${jobId}`)
        const plan = planItems(input, brand)
        const now = nowISO()
        const job: MockJob = {
          id: jobId, ownerId: me, brandId: brand.id, brandName: brand.name, input: clone(input), requestedCount: input.count,
          status: 'queued', completedCount: 0, failedCount: 0, cancelledCount: 0, createdAt: now, updatedAt: now,
          items: plan.map((_, i) => ({ id: `${jobId}_i${i}`, jobId, ordinal: i, status: 'pending', attempts: 0, errorCode: null, contentId: null })),
          idempotencyKey, startedAt: Date.now(), plan,
        }
        d.jobs.push(job)
        d.idempotency[`job:${me}:${idempotencyKey}`] = jobId
        persist()
        return jobView(job)
      },
      async get(id) {
        await net({ latency: 200 })
        const job = load().jobs.find((j) => j.id === id && j.ownerId === uidOf())
        if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found')
        return jobView(job)
      },
      async list(brandId) {
        await net()
        return load().jobs.filter((j) => j.ownerId === uidOf() && (!brandId || j.brandId === brandId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(jobView)
      },
      async cancel(id) {
        await net()
        const job = load().jobs.find((j) => j.id === id && j.ownerId === uidOf())
        if (!job) throw new ApiError(404, 'NOT_FOUND', 'Job not found')
        advance(job)
        if (['completed', 'partial', 'failed', 'cancelled'].includes(job.status)) throw new ApiError(409, 'CONFLICT', 'Job already finished')
        // Only unfinished items are cancelled; their reserved credits are released.
        for (const it of job.items) {
          if (it.status === 'pending' || it.status === 'running') {
            it.status = 'cancelled'
            post(job.ownerId, 'release', 1, -1, 'item', it.id, `release:${it.id}`)
            job.cancelledCount++
          }
        }
        job.status = 'cancelled'
        job.updatedAt = nowISO()
        persist()
        return jobView(job)
      },
    },

    credits: {
      async balance() {
        await net({ canFail: false, latency: 120 })
        return walletView(uidOf())
      },
      async ledger() {
        await net()
        return load().ledger.filter((l) => l.ownerId === uidOf()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(({ ownerId: _o, operationKey: _k, ...rest }) => clone(rest))
      },
      async orders() {
        await net()
        expireOrders(uidOf())
        return load().orders.filter((o) => o.ownerId === uidOf()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(strip)
      },
      async createOrder(credits) {
        await net()
        if (!Number.isInteger(credits) || credits < 1 || credits > 500) fieldError({ credits: 'invalid_credits' })
        const id = `po_${nextSeq()}`
        const order: Owned<PaymentOrder> = { id, ownerId: uidOf(), credits, amountSatang: credits * PRICE_SATANG, currency: 'THB', status: 'pending', provider: 'sandbox', providerRef: `sbx_${uid().slice(0, 8)}`, createdAt: nowISO(), paidAt: null }
        load().orders.push(order)
        persist()
        return strip(order)
      },
      async getOrder(id) {
        await net({ latency: 200 })
        expireOrders(uidOf())
        const o = load().orders.find((x) => x.id === id && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        return strip(o)
      },
      async simulateWebhook(orderId, outcome) {
        // Stands in for the provider calling POST /payments/webhook. The UI
        // still learns the result only by polling the order status.
        await net({ canFail: false, latency: 900 })
        const d = load()
        const o = d.orders.find((x) => x.id === orderId && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        const eventId = `evt_${orderId}_${outcome}`
        if (d.paymentEvents.includes(eventId) || o.status !== 'pending') return // replay → no-op
        d.paymentEvents.push(eventId)
        if (outcome === 'paid') {
          o.status = 'paid'
          o.paidAt = nowISO()
          post(o.ownerId, 'purchase', o.credits, 0, 'payment', o.id, `purchase:${o.id}`)
        } else {
          o.status = 'failed'
        }
        persist()
      },
    },

    promotions: {
      async list() {
        await net()
        return load().inquiries.filter((i) => i.ownerId === uidOf()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(strip)
      },
      async create(input) {
        await net()
        ownBrand(input.brandId)
        if (input.contentId) ownContent(input.contentId)
        const errors: Record<string, string> = {}
        if (!input.consent) errors.consent = 'consent_required'
        if (input.brief.trim().length < 10) errors.brief = 'brief_short'
        if (input.brief.length > 2000) errors.brief = 'too_long'
        if (!Number.isInteger(input.budgetSatang) || input.budgetSatang < 0) errors.budget = 'invalid_budget'
        if (input.postUrl && !/^https?:\/\//i.test(input.postUrl)) errors.postUrl = 'invalid_url'
        if (Object.keys(errors).length) fieldError(errors)
        const d = load()
        const year = todayISO().slice(0, 4)
        const n = d.inquiries.filter((i) => i.reference.includes(`-${year}-`)).length + 8
        const now = nowISO()
        const { consent: _c, ...rest } = input
        const inq: Owned<PromotionInquiry> = { ...rest, id: `pi_${nextSeq()}`, ownerId: uidOf(), reference: `UPS-${year}-${String(n).padStart(4, '0')}`, status: 'submitted', contactConsentAt: now, createdAt: now }
        d.inquiries.push(inq)
        persist()
        return strip(inq)
      },
    },

    feedback: {
      async submit(input) {
        await net()
        if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) fieldError({ rating: 'required' })
        if (input.comment.length > 2000) fieldError({ comment: 'too_long' })
        load().feedback.push({ id: `f_${nextSeq()}`, ownerId: uidOf(), contentId: input.contentId, rating: input.rating, comment: input.comment, createdAt: nowISO() })
        persist()
      },
    },
  }

  // ------------------------------------------------------- validation
  function validateBrand(input: Pick<BrandInput, 'name' | 'profile'>) {
    const errors: Record<string, string> = {}
    if (!input.name?.trim()) errors.name = 'required'
    if (input.name && input.name.length > 80) errors.name = 'too_long'
    if (!input.profile.description?.trim()) errors.description = 'required'
    if (input.profile.description.length > 1500) errors.description = 'too_long'
    if (input.profile.platforms.some((p) => !PLATFORMS.includes(p))) errors.platforms = 'invalid'
    if (Object.keys(errors).length) fieldError(errors)
  }

  function validateGeneration(i: GenerationInput, brand: Brand) {
    const e: Record<string, string> = {}
    if (brand.archivedAt) e.brandId = 'brand_archived'
    if (!brand.name || !brand.profile.description) e.brandId = 'brand_incomplete'
    if (!isValidISODate(i.dateFrom)) e.dateFrom = 'invalid_date'
    if (!isValidISODate(i.dateTo)) e.dateTo = 'invalid_date'
    if (!e.dateFrom && !e.dateTo && i.dateTo < i.dateFrom) e.dateTo = 'date_order'
    if (!e.dateFrom && !e.dateTo && diffDays(i.dateTo, i.dateFrom) > 92) e.dateTo = 'range_too_long'
    if (!Number.isInteger(i.count) || i.count < 1 || i.count > 30) e.count = 'count_range'
    if (!OBJECTIVES.includes(i.objective)) e.objective = 'invalid'
    if (!i.platforms.length || i.platforms.some((p) => !PLATFORMS.includes(p))) e.platforms = 'pick_one'
    if (!i.formats.length || i.formats.some((f) => !FORMATS.includes(f))) e.formats = 'pick_one'
    if (i.pillarMix) {
      const sum = Object.values(i.pillarMix).reduce((a, b) => a + b, 0)
      if (sum !== 100) e.pillarMix = 'mix_100'
    }
    if (i.notes.length > 1000) e.notes = 'too_long'
    if (i.campaign.length > 200) e.campaign = 'too_long'
    if (i.promotion.length > 300) e.promotion = 'too_long'
    if (Object.keys(e).length) fieldError(e)
  }

  function planItems(i: GenerationInput, brand: Brand): MockJob['plan'] {
    const pillars: string[] = []
    if (i.pillarMix) {
      for (const [p, w] of Object.entries(i.pillarMix)) for (let k = 0; k < Math.round((w / 100) * i.count); k++) pillars.push(p)
    }
    const base = brand.profile.pillars.length ? brand.profile.pillars : ['Education']
    while (pillars.length < i.count) pillars.push(base[pillars.length % base.length]!)
    const span = Math.max(0, diffDays(i.dateTo, i.dateFrom))
    return Array.from({ length: i.count }, (_, k) => ({
      pillar: pillars[k]!,
      platform: i.platforms[k % i.platforms.length]!,
      format: i.formats[k % i.formats.length]!,
      date: addDays(i.dateFrom, i.count === 1 ? 0 : Math.round((k * span) / (i.count - 1))),
    }))
  }

  function filterContents(q: ContentQuery): Content[] {
    const d = load()
    const me = uidOf()
    const s = q.search?.trim().toLowerCase()
    const archivedBrands = new Set(d.brands.filter((b) => b.archivedAt).map((b) => b.id))
    const rows = d.contents.filter((c) => c.ownerId === me
      && (q.includeArchived || (!c.archivedAt && !archivedBrands.has(c.brandId)))
      && (!q.brandId || c.brandId === q.brandId)
      && (!s || c.title.toLowerCase().includes(s) || c.caption.toLowerCase().includes(s))
      && (!q.platform || c.platform === q.platform)
      && (!q.pillar || c.pillar === q.pillar)
      && (!q.status || (q.status === 'unscheduled' ? !c.scheduledDate : c.status === q.status))
      && (!q.from || (c.scheduledDate !== null && c.scheduledDate >= q.from))
      && (!q.to || (c.scheduledDate !== null && c.scheduledDate <= q.to)))
    rows.sort(q.sort === 'date'
      ? (a, b) => (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999')
      : (a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return rows.map(strip)
  }

  function paginate<T>(rows: T[], q: ContentQuery): Paginated<T> {
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20))
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
    const page = Math.min(pageCount, Math.max(1, q.page ?? 1))
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length, pageCount } }
  }

  return source
}
