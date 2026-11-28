// DEVELOPMENT MOCK BACKEND — runs entirely in the browser and persists to
// localStorage. It deliberately enforces the same business rules the Strapi
// API must enforce (ownership, atomic credit reserve/consume/release,
// idempotency, optimistic versions, sandbox-only payments) so the UI is
// built against realistic behaviour. Enabled when NUXT_PUBLIC_DATA_SOURCE=mock.

import type { ActivityChange, Brand, BrandInput, BrandInvitation, BrandMember, BrandRole, Content, ContentDraft, ContentImage, ContentQuery, DashboardSummary, GenerationInput, GenerationJob, ContentStatePatch, PublishDestination, Holiday, ItemStatus, LedgerEntry, LedgerType, OrderInput, Paginated, PaymentOrder, PlanKey, PositionKey, PromotionInquiry, Task, TaskAction, User, Wallet, AutopostInfo, SocialConnection, SocialPlatform, TikTokPostOptions } from '~/types'
import { DEFAULT_PRICING, FREE_BRANDS, activePlan, addBillingMonths, brandCoverage, brandCreateErrorFor, featureFlags, nextPeriod, renewalStart, seatCount, slotAssignments } from '~/utils/pricing'
import { normalizePositions } from '~/utils/positions'
import { TASK_TRANSITIONS, OPEN_TASK_STATUSES, actorCapabilities, assigneeError, isOverdue, transitionError } from '~/utils/tasks'
import { inviteError, leaveError, removeError, roleCan, roleChangeError, type Permission } from '~/utils/permissions'
import { DEFAULT_IMAGE_LIMITS, IMAGE_MIME_TYPES, sniffFile, type ImageLimits } from '~/utils/images'
import { CONTENT_AUDIT_FIELDS, classifyBrand, classifyContent, diffBrand, diffFields } from '~/utils/activity'
import { CONTENT_STATUSES, FORMATS, OBJECTIVES, PLATFORMS } from '~/types'
import { addDays, diffDays, isValidISODate, nowISO, todayISO } from '~/utils/date'
import { normalizeTitle, uid } from '~/utils/format'
import { buildContentCsv } from '~/utils/csv'
import { DEFAULT_TIMEZONE, MAX_CAPTION, bangkokToUtc, platformsOf, rollupContent } from '~/utils/destinations'
import { PLATFORM_META } from '~/utils/content-meta'
import { ApiError, type DataSource } from '../contract'
import { buildSeed, membership, seedPlans, type MockBrand, type MockContentImage, type MockDB, type MockInvitation, type MockJob, type MockTask, type Owned } from './seed'
import { hashString, mockGenerate, validateDraft } from './llm'

const DB_KEY = 'plannity-mock-db-v3'
const CFG_KEY = 'plannity-mock-config'
const PRICE_SATANG = 1000
const TRIAL_CREDITS = 3
const INVITE_TTL_DAYS = 7

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
  // Migrate stores saved before Team Workspace / post images: each brand's creator becomes its Owner.
  if (!db.memberships) {
    db.memberships = db.brands.map((b) => membership(b.id, b.ownerId, 'owner', b.createdAt))
    db.invitations = []
    persist()
  }
  db.contentImages ??= []
  db.destinations ??= []
  db.activity ??= []
  // Pricing v0.2 / positions / tasks: older demo data gets the demo plans and empty tags.
  if (!db.subscriptions) {
    db.subscriptions = []
    db.addons = []
    if (db.users.some((u) => u.id === 'u_demo')) seedPlans(db, todayISO())
    persist()
  }
  db.tasks ??= []
  db.taskEvents ??= []
  for (const m of db.memberships) m.positionKeys ??= []
  for (const i of db.invitations) i.positionKeys ??= []
  for (const a of db.addons) a.brandId ??= null
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

// ---- image files: IndexedDB (localStorage is far too small for images) ----
const IDB_NAME = 'plannity-mock-images'
let idbPromise: Promise<IDBDatabase> | null = null
function idb(): Promise<IDBDatabase> {
  return (idbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('files', mode).objectStore('files'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const objectUrls = new Map<string, string>()

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface PaymentConfig { promptpayId: string; name: string; ttlHours: number; slipMaxBytes: number }
const DEFAULT_PAYMENT: PaymentConfig = { promptpayId: '0968870831', name: 'Supachai Van Gent', ttlHours: 24, slipMaxBytes: 5 * 1024 * 1024 }

export function createMockSource(getToken: () => string | null | undefined, limits: ImageLimits = DEFAULT_IMAGE_LIMITS, payment: PaymentConfig = DEFAULT_PAYMENT): DataSource {
  // ---------------------------------------------------------------- helpers
  function currentUser(): MockDB['users'][number] {
    const token = getToken()
    const u = token ? load().users.find((x) => x.id === token) : undefined
    if (!u) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in')
    return u
  }
  const uidOf = () => currentUser().id

  // ---- Team Workspace authorization (brand membership, not ownership) ----
  function activeMember(brandId: string, userId: string) {
    return load().memberships.find((m) => m.brandId === brandId && m.userId === userId && m.status === 'active')
  }
  // ---- Plans & entitlements (pricing.md v0.2) — the paying account is brand.ownerId.
  function planOf(ownerId: string) {
    const d = load()
    const now = nowISO()
    const subs = d.subscriptions.filter((s) => s.ownerId === ownerId)
    const active = activePlan(subs, now)
    const owned = d.brands.filter((b) => b.ownerId === ownerId)
    const slots = () => d.addons.filter((a) => a.ownerId === ownerId)
    // Unused paid slots go to locked brands (oldest first) — e.g. after buying slots, or when Studio ends.
    if (active.planKey !== 'studio') {
      for (const { slotId, brandId } of slotAssignments(brandCoverage(owned, active.planKey, active.periodEnd, slots(), now), slots(), now)) {
        const row = d.addons.find((a) => a.id === slotId)!
        if (row.quantity > 1) {
          row.quantity--
          d.addons.push({ ...row, id: `add_${nextSeq()}`, brandId, quantity: 1, orderKey: null })
        } else row.brandId = brandId
      }
    }
    const coverage = brandCoverage(owned, active.planKey, active.periodEnd, slots(), now)
    const last = subs.filter((x) => x.status === 'active').sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || (a.planKey === 'studio' ? -1 : 1) - (b.planKey === 'studio' ? -1 : 1))[0]
    return {
      planKey: active.planKey, periodEnd: active.periodEnd, subs, coverage, lastPlanKey: last?.planKey ?? null, lastPlanEnd: last?.periodEnd ?? null,
      addonUnits: coverage.brands.filter((b) => b.kind === 'slot').length + coverage.freeSlots,
    }
  }
  function brandPlan(brandId: string) {
    const b = load().brands.find((x) => x.id === brandId)
    const plan = b ? planOf(b.ownerId) : null
    const cover = plan?.coverage.brands.find((x) => x.id === brandId) ?? null
    const planKey: PlanKey = plan?.planKey ?? 'solo'
    return { ownerId: b?.ownerId ?? null, planKey, features: featureFlags(planKey), locked: !!cover?.locked, cover }
  }
  /** Unique people across every brand the account owns (owner always counted); pending invites reserve a seat. */
  function seatUsage(ownerId: string) {
    const d = load()
    expireInvites()
    const owned = new Set(d.brands.filter((b) => b.ownerId === ownerId).map((b) => b.id))
    const members = d.memberships.filter((m) => owned.has(m.brandId) && m.status === 'active').map((m) => ({ userId: m.userId, email: d.users.find((u) => u.id === m.userId)?.email ?? null }))
    if (!members.some((m) => m.userId === ownerId)) members.push({ userId: ownerId, email: d.users.find((u) => u.id === ownerId)?.email ?? null })
    const pendingEmails = d.invitations.filter((i) => owned.has(i.brandId) && i.status === 'pending').map((i) => i.email)
    return { members, pendingEmails, used: seatCount(members, pendingEmails) }
  }
  function storedRole(brandId: string): BrandRole | null {
    return activeMember(brandId, uidOf())?.role ?? null
  }
  /**
   * Effective role. Locked brands (no slot / Studio cover) are read-only for
   * everyone until renewed; collaborators are read-only while the owner's plan
   * lacks collaboration. Nothing is ever deleted.
   */
  function roleIn(brandId: string): BrandRole | null {
    const role = storedRole(brandId)
    if (!role || role === 'viewer') return role
    const { ownerId, features, locked } = brandPlan(brandId)
    if (locked) return 'viewer'
    return ownerId === uidOf() || features.collaboration ? role : 'viewer'
  }
  function planRequired(what: string): never {
    throw new ApiError(402, 'PLAN_REQUIRED', `${what} needs a Team or Studio plan on the brand owner's account.`)
  }
  /** Brands the current user is an active member of. */
  function myBrandIds(): Set<string> {
    const me = uidOf()
    return new Set(load().memberships.filter((m) => m.userId === me && m.status === 'active').map((m) => m.brandId))
  }
  function brandAccess(id: string, perm: Permission): MockBrand {
    const b = load().brands.find((x) => x.id === id)
    const role = b ? roleIn(b.id) : null
    // Same 404 for "missing" and "not a member" — no cross-tenant probing.
    if (!b || !role) throw new ApiError(404, 'NOT_FOUND', 'Brand not found')
    if (!roleCan(role, perm)) throw new ApiError(403, 'FORBIDDEN', 'Your role in this brand does not allow this')
    return b
  }
  function contentAccess(id: string, perm: Permission): Owned<Content> {
    const c = load().contents.find((x) => x.id === id)
    const role = c ? roleIn(c.brandId) : null
    if (!c || !role) throw new ApiError(404, 'NOT_FOUND', 'Content not found')
    if (!roleCan(role, perm)) throw new ApiError(403, 'FORBIDDEN', 'Your role in this brand does not allow this')
    return c
  }
  function brandView(b: MockBrand): Brand {
    const { ownerId, ...rest } = clone(b) as MockBrand & { maxSeats?: number }
    delete rest.maxSeats // pre-v0.2 demo data
    const plan = brandPlan(b.id)
    const role = roleIn(b.id)
    return {
      ...rest, myRole: role ?? 'viewer', myPositionKeys: activeMember(b.id, uidOf())?.positionKeys ?? [], planKey: plan.planKey, features: plan.features,
      isBillingOwner: ownerId === uidOf(), suspended: !!role && role !== storedRole(b.id) && !plan.locked,
      locked: plan.locked, coverKind: plan.cover?.kind ?? 'included', coveredUntil: plan.cover?.until ?? null,
    }
  }
  function imagesOf(contentId: string): MockContentImage[] {
    return load().contentImages.filter((i) => i.contentId === contentId).sort((a, b) => a.sortOrder - b.sortOrder)
  }
  /** Lists/calendar carry only the image count — no files are loaded. */
  function contentView(c: Owned<Content>): Content {
    return { ...strip(c), imageCount: imagesOf(c.id).length, destinations: destsOf(c).map(destView) }
  }

  // ---- multi-platform content (mirrors server/src/services/destinations.js) ----
  type MockDest = MockDB['destinations'][number]
  /** Every post has at least its own platform as a (manual) destination; older demo data is migrated here. */
  function destsOf(c: Content): MockDest[] {
    runDueMock()
    const d = load()
    let rows = d.destinations.filter((x) => x.contentId === c.id)
    if (!rows.length) {
      const pub = c.status === 'published'
      d.destinations.push(newDest(c, c.platform, pub ? { status: 'published', publishedAt: c.publishedAt ?? c.updatedAt, externalPostUrl: c.postUrl } : {}))
      persist()
      rows = d.destinations.filter((x) => x.contentId === c.id)
    }
    return rows
  }
  function newDest(c: Content, platform: Content['platform'], extra: Partial<MockDest> = {}): MockDest {
    return {
      id: `pd_${nextSeq()}`, contentId: c.id, brandId: c.brandId, platform, captionOverride: null, mediaOverrideIds: null, scheduledAt: null,
      timezone: DEFAULT_TIMEZONE, mode: 'manual', status: 'draft', revision: 1, externalPostUrl: null, publishedAt: null, lastErrorCode: null, updatedAt: nowISO(), ...extra,
    }
  }
  function destView(x: MockDest): PublishDestination {
    const { brandId: _b, ...rest } = x
    const own = new Set(imagesOf(x.contentId).map((i) => i.id))
    return { ...clone(rest), mediaOverrideIds: x.mediaOverrideIds ? x.mediaOverrideIds.filter((id) => own.has(id)) : null }
  }
  /** Moves the post's own status when its platforms say so; returns what changed for the UI. */
  function rollupFor(c: Owned<Content>, extra: Partial<Content> = {}): ContentStatePatch | null {
    const patch = { ...(rollupContent(c, destsOf(c)) ?? {}), ...extra }
    for (const k of Object.keys(extra) as (keyof Content)[]) if (c[k] === extra[k]) delete (patch as Record<string, unknown>)[k]
    if (!Object.keys(patch).length) return null
    Object.assign(c, patch, { version: c.version + 1, updatedAt: nowISO() })
    return { status: c.status, version: c.version, publishedAt: c.publishedAt, postUrl: c.postUrl, platform: c.platform }
  }
  // ---- demo social accounts + automatic posting (mirrors server/src/services/publisher.js) ----
  const AUTO: SocialPlatform[] = ['facebook', 'instagram', 'tiktok']
  const conns = () => (load().socialConnections ??= [])
  const connOf = (brandId: string, p: string) => conns().find((x) => x.brandId === brandId && x.platform === p) ?? null
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'brand'
  function postTextOf(c: Content, dest: MockDest): string {
    if (dest.captionOverride !== null) return dest.captionOverride
    const caption = (c.caption ?? '').trim()
    const tags = (c.hashtags ?? []).filter((h) => h && !caption.includes(h))
    return [caption, tags.join(' ')].filter(Boolean).join('\n\n')
  }
  function dueOf(c: Content, dest: MockDest): string | null {
    if (dest.scheduledAt) return dest.scheduledAt
    if (!c.scheduledDate || !/^\d{2}:\d{2}$/.test(c.scheduledTime ?? '')) return null
    return bangkokToUtc(c.scheduledDate, c.scheduledTime!)
  }
  function publishFail(code: string, message: string, status = 409): never {
    throw new ApiError(status, status === 403 ? (code === 'plan_required' ? 'PLAN_REQUIRED' : 'FORBIDDEN') : status === 400 ? 'INVALID_INPUT' : 'CONFLICT', message, { publish: code })
  }
  function preflightMock(c: Owned<Content>, dest: MockDest) {
    if (!AUTO.includes(dest.platform as SocialPlatform)) publishFail('manual_only', 'This platform is posted by hand')
    const plan = brandPlan(c.brandId)
    if (plan.locked) publishFail('brand_locked', 'This brand is locked until its plan is renewed', 403)
    if (!plan.features.socialConnections) publishFail('plan_required', 'Automatic posting is part of Team and Studio', 403)
    const conn = connOf(c.brandId, dest.platform)
    if (!conn) publishFail('not_connected', `Connect ${PLATFORM_META[dest.platform].label} in Social channels first`)
    if (conn.status !== 'connected') publishFail('reconnect_required', `${PLATFORM_META[dest.platform].label} needs to be connected again`)
    const all = imagesOf(c.id)
    const imgs = dest.mediaOverrideIds ? dest.mediaOverrideIds.filter((id) => all.some((i) => i.id === id)) : all.map((i) => i.id)
    if (dest.platform === 'instagram' && !imgs.length) publishFail('ig_needs_image', 'Instagram posts need at least one image')
    if (dest.platform === 'instagram' && imgs.length > 10) publishFail('ig_too_many_images', 'Instagram carousels take up to 10 images')
    if (dest.platform === 'instagram' && postTextOf(c, dest).length > 2200) publishFail('caption_too_long', 'Instagram captions are limited to 2,200 characters')
    if (dest.platform === 'tiktok' && !imgs.length) publishFail('tiktok_needs_image', 'TikTok photo posts need at least one image')
    if (dest.platform === 'facebook' && !imgs.length && !postTextOf(c, dest).trim()) publishFail('empty_post', 'Add a caption or an image first')
    return conn
  }
  function tiktokOpts(input: TikTokPostOptions | null | undefined): TikTokPostOptions {
    // The demo behaves like an app TikTok hasn't audited yet: always private.
    const o = input ?? ({} as Partial<TikTokPostOptions>)
    return { privacyLevel: 'SELF_ONLY', allowComments: o.allowComments !== false, brandOrganic: !!o.brandOrganic, brandedContent: !!o.brandedContent }
  }
  function goLive(c: Owned<Content>, dest: MockDest, conn: SocialConnection) {
    const id = `${Date.now()}`
    const url = dest.platform === 'facebook' ? `https://www.facebook.com/${conn.externalAccountId}_${id}`
      : dest.platform === 'instagram' ? `https://www.instagram.com/p/DEMO${id.slice(-6)}/`
      : `https://www.tiktok.com/@${conn.username}/photo/${id}`
    Object.assign(dest, { status: 'published', mode: 'auto', publishedAt: nowISO(), externalPostUrl: url, dueAt: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: nowISO() })
    rollupFor(c)
    logContent(c, 'content.autoposted', [{ field: 'platform', from: null, to: dest.platform }])
  }
  /** The demo's "worker": runs whenever posts are read. Scheduled posts that are due go out; TikTok finishes after a few seconds. */
  function runDueMock() {
    const d = load()
    const now = Date.now()
    let changed = false
    for (const dest of d.destinations) {
      const due = dest.status === 'scheduled' && dest.dueAt && Date.parse(dest.dueAt) <= now
      const tiktokDone = dest.status === 'publishing' && Date.parse(dest.updatedAt) + 4000 <= now
      if (!due && !tiktokDone) continue
      const c = d.contents.find((x) => x.id === dest.contentId)
      const conn = c ? connOf(c.brandId, dest.platform) : null
      if (!c || !conn) { Object.assign(dest, { status: 'failed', mode: 'auto', dueAt: null, lastErrorCode: 'not_connected', updatedAt: nowISO() }); changed = true; continue }
      if (due && dest.platform === 'tiktok') Object.assign(dest, { status: 'publishing', dueAt: null, updatedAt: nowISO() })
      else goLive(c, dest, conn)
      changed = true
    }
    if (changed) persist()
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

  /** Pending PromptPay orders stop accepting payment after their window (slips already sent are still reviewed). */
  /** Demo slip check shared by the signed-in upload and the phone hand-off. */
  async function acceptSlip(o: Owned<PaymentOrder>, file: File): Promise<PaymentOrder> {
    if (o.status === 'expired') throw new ApiError(409, 'CONFLICT', 'This payment request has expired. Start a new purchase.')
    if (o.status !== 'pending' && o.status !== 'rejected') throw new ApiError(409, 'CONFLICT', 'A slip was already submitted for this order.')
    const type = await sniffFile(file)
    if (!type || type === 'image/gif') throw new ApiError(400, 'FILE_TYPE', `"${file.name}" isn't a JPG, PNG or WEBP image of the slip.`)
    if (file.size > payment.slipMaxBytes) throw new ApiError(400, 'FILE_TOO_LARGE', `The slip must be under ${Math.round(payment.slipMaxBytes / 1048576)} MB.`)
    try {
      await idbDo('readwrite', (st) => st.put(file.slice(0, file.size, type), `slip_${o.id}`))
    } catch {
      throw new ApiError(507, 'STORAGE', 'Could not save the slip (browser storage is full or unavailable).')
    }
    Object.assign(o, { status: 'awaiting_review', slipUploadedAt: nowISO(), reviewNote: null })
    persist()
    return orderView(o)
  }
  function handoffOrder(token: string): Owned<PaymentOrder> {
    const m = /^demo\.([\w-]+)\.([0-9a-z]+)$/.exec(token)
    const o = m && parseInt(m[2]!, 36) > Date.now() ? load().orders.find((x) => x.id === m[1]) : undefined
    if (!o) throw new ApiError(404, 'LINK_EXPIRED', 'This payment link has expired. Scan the new QR on your computer.')
    return o
  }
  function expireOrders(userId: string) {
    const now = nowISO()
    for (const o of load().orders) {
      if (o.ownerId !== userId || o.status !== 'pending') continue
      const until = o.expiresAt ?? new Date(Date.parse(o.createdAt) + payment.ttlHours * 3600_000).toISOString()
      if (until < now) o.status = 'expired'
    }
  }
  /** Normalises orders saved before PromptPay fields existed. */
  function orderView(o: Owned<PaymentOrder>): PaymentOrder {
    const v = strip(o) as PaymentOrder
    return {
      ...v, kind: v.kind ?? 'credits', planKey: v.planKey ?? null, quantity: v.quantity ?? null, resultCode: v.resultCode ?? null, fulfilled: v.status === 'paid',
      reference: v.reference ?? `PLN-${o.id.slice(-6).toUpperCase()}`, payee: v.payee ?? null, slipUploadedAt: v.slipUploadedAt ?? null, reviewNote: v.reviewNote ?? null, expiresAt: v.expiresAt ?? null,
    }
  }
  /** Delivers what a paid order bought — exactly once per order (unique ledger / orderKey). */
  function fulfill(o: Owned<PaymentOrder>) {
    const d = load()
    const kind = o.kind ?? 'credits'
    const orderKey = `order:${o.id}`
    if (kind === 'credits') { post(o.ownerId, 'purchase', o.credits, 0, 'payment', o.id, `purchase:${o.id}`); return }
    const now = nowISO()
    if (kind === 'plan' && o.planKey && !d.subscriptions.some((x) => x.orderKey === orderKey)) {
      const period = nextPeriod(o.planKey, d.subscriptions.filter((x) => x.ownerId === o.ownerId), now)
      d.subscriptions.push({ id: `sub_${nextSeq()}`, ownerId: o.ownerId, planKey: o.planKey, status: 'active', ...period, orderKey })
    }
    if (kind === 'brand_addon' && o.quantity && !d.addons.some((x) => x.orderKey === orderKey)) {
      // Unused slots: given to locked brands first, otherwise waiting for a new brand.
      d.addons.push({ id: `add_${nextSeq()}`, ownerId: o.ownerId, brandId: null, quantity: o.quantity, status: 'active', periodStart: now, periodEnd: addBillingMonths(now, 1), orderKey })
    }
    if (kind === 'renewal' && !d.addons.some((x) => x.orderKey?.startsWith(`${orderKey}:`)) && !d.subscriptions.some((x) => x.orderKey === orderKey)) {
      const before = planOf(o.ownerId)
      if (o.planKey) {
        const period = nextPeriod(o.planKey, d.subscriptions.filter((x) => x.ownerId === o.ownerId), now)
        d.subscriptions.push({ id: `sub_${nextSeq()}`, ownerId: o.ownerId, planKey: o.planKey, status: 'active', ...period, orderKey })
      }
      // Each brand continues from where its own cover ends (or from now if it lapsed).
      for (const brandId of o.brandIds ?? []) {
        const cover = before.coverage.brands.find((b) => b.id === brandId)
        if (!cover || cover.kind === 'included') continue
        const start = renewalStart(cover.paidUntil, now)
        d.addons.push({ id: `add_${nextSeq()}`, ownerId: o.ownerId, brandId, quantity: 1, status: 'active', periodStart: start, periodEnd: addBillingMonths(start, 1), orderKey: `${orderKey}:${brandId}` })
      }
      d.addons.push({ id: `add_${nextSeq()}`, ownerId: o.ownerId, brandId: null, quantity: 1, status: 'cancelled', periodStart: now, periodEnd: now, orderKey: `${orderKey}:done` })
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
      async resetPassword(code, password) {
        // Demo: any code except "used" resets the first account's password.
        await net({ canFail: false })
        if (code === 'used') throw new ApiError(400, 'INVALID_INPUT', 'Incorrect code provided')
        const d = load()
        const u = d.users[0]
        if (!u) throw new ApiError(400, 'INVALID_INPUT', 'Incorrect code provided')
        u.password = password
        persist()
        const { password: _p, ...user } = clone(u)
        return { user, token: u.id }
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
      const mine = myBrandIds()
      const scope = d.contents.filter((c) => mine.has(c.brandId) && !c.archivedAt && (!brandId || c.brandId === brandId)
        && !d.brands.find((b) => b.id === c.brandId)?.archivedAt)
      const statusCounts = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, scope.filter((c) => c.status === s).length])) as DashboardSummary['statusCounts']
      const byDate = (a: Content, b: Content) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') || (a.scheduledTime ?? '').localeCompare(b.scheduledTime ?? '')
      const jobs = d.jobs.filter((j) => j.ownerId === me && (!brandId || j.brandId === brandId))
      jobs.forEach(advance)
      return {
        wallet: walletView(me),
        brandCount: d.brands.filter((b) => mine.has(b.id) && !b.archivedAt).length,
        monthCount: scope.filter((c) => c.scheduledDate?.slice(0, 7) === today.slice(0, 7)).length,
        statusCounts,
        upcoming: scope.filter((c) => c.scheduledDate && c.scheduledDate >= today && c.scheduledDate <= addDays(today, 6)).sort(byDate).slice(0, 8).map(contentView),
        backlog: scope.filter((c) => c.status !== 'published' && c.scheduledDate && (c.scheduledDate < today
          || (['draft', 'in_review'].includes(c.status) && c.scheduledDate <= addDays(today, 7)))).sort(byDate).slice(0, 6).map(contentView),
        recentJobs: jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(jobView),
      }
    },

    brands: {
      async list(opts) {
        await net()
        const d = load()
        const mine = myBrandIds()
        return d.brands
          .filter((b) => mine.has(b.id) && (opts?.includeArchived || !b.archivedAt))
          .sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || a.createdAt.localeCompare(b.createdAt))
          .map((b) => ({ ...brandView(b), contentCount: d.contents.filter((c) => c.brandId === b.id && !c.archivedAt).length }))
      },
      async get(id) {
        await net()
        return brandView(brandAccess(id, 'brand.read'))
      },
      async create(input) {
        await net()
        validateBrand(input)
        // 2 brands free; more need Studio or a free paid slot. Archived brands still count.
        const plan = planOf(uidOf())
        if (brandCreateErrorFor(plan.coverage, plan.planKey)) {
          throw new ApiError(402, 'BRAND_LIMIT', 'Your plan has no free brand slot. Add a brand (฿99/month) or upgrade to Studio.')
        }
        const now = nowISO()
        const b: MockBrand = { id: `b_${nextSeq()}`, ownerId: uidOf(), name: input.name.trim(), color: input.color, profile: clone(input.profile), archivedAt: null, createdAt: now, updatedAt: now }
        load().brands.push(b)
        load().memberships.push(membership(b.id, uidOf(), 'owner', now)) // creator = Owner
        logActivity(b.id, 'brand.created', 'brand', b.id, b.name)
        persist()
        return brandView(b)
      },
      async update(id, input) {
        await net()
        const b = brandAccess(id, 'brand.update')
        const merged = { name: input.name ?? b.name, color: input.color ?? b.color, profile: { ...b.profile, ...input.profile } }
        validateBrand(merged)
        const changes = diffBrand(b, merged)
        Object.assign(b, merged, { updatedAt: nowISO() })
        logActivity(b.id, classifyBrand(changes), 'brand', b.id, b.name, changes)
        persist()
        return brandView(b)
      },
      async archive(id) {
        await net()
        const b = brandAccess(id, 'brand.delete') // archiving is the owner-only "delete"
        b.archivedAt = nowISO() // history is retained, nothing is deleted (it still uses its slot)
        logActivity(b.id, 'brand.archived', 'brand', b.id, b.name)
        persist()
        return brandView(b)
      },
      async restore(id) {
        await net()
        const b = brandAccess(id, 'brand.delete')
        b.archivedAt = null
        logActivity(b.id, 'brand.restored', 'brand', b.id, b.name)
        persist()
        return brandView(b)
      },
    },

    contents: {
      async list(q) {
        await net()
        return paginate(filterContents(q), q)
      },
      async get(id) {
        await net()
        const c = contentAccess(id, 'content.read')
        return { ...contentView(c), images: await Promise.all(imagesOf(c.id).map(imageView)) }
      },
      async create(input) {
        await net()
        const brand = brandAccess(input.brandId, 'content.create')
        if (!input.title?.trim()) fieldError({ title: 'required' })
        if (input.scheduledDate && !isValidISODate(input.scheduledDate)) fieldError({ scheduledDate: 'invalid_date' })
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
        logContent(c, 'content.created')
        persist()
        return contentView(c)
      },
      async update(id, patch) {
        await net()
        const c = contentAccess(id, 'content.update')
        if (patch.version !== c.version) throw new ApiError(409, 'VERSION_CONFLICT', 'This content was changed elsewhere. Reload to get the latest version.')
        const next = { ...c, ...patch }
        if (next.brandId !== c.brandId) brandAccess(next.brandId, 'content.create')
        const errors: Record<string, string> = {}
        if (!next.title?.trim()) errors.title = 'required'
        if (next.scheduledDate && !isValidISODate(next.scheduledDate)) errors.scheduledDate = 'invalid_date'
        if (next.status === 'scheduled' && !next.scheduledDate) errors.scheduledDate = 'needs_date'
        if (next.scheduledTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(next.scheduledTime)) errors.scheduledTime = 'invalid_time'
        if (next.postUrl && !/^https?:\/\//i.test(next.postUrl)) errors.postUrl = 'invalid_url'
        // A post going to several platforms is marked published per platform, never all at once.
        const dests = destsOf(c)
        if (patch.status && patch.status !== c.status && dests.length > 1) {
          if (patch.status === 'published' && !dests.every((x) => x.status === 'published')) errors.status = 'publish_each_platform'
          if (c.status === 'published' && patch.status !== 'published') errors.status = 'unpublish_each_platform'
        }
        if (Object.keys(errors).length) fieldError(errors)
        if (next.status === 'published' && !next.publishedAt) next.publishedAt = nowISO()
        if (next.status !== 'published') next.publishedAt = null
        const contentChanged = (['title', 'caption', 'hook', 'concept', 'cta', 'visualBrief', 'videoScript'] as const).some((k) => k in patch && patch[k] !== c[k])
        if (contentChanged) addRevision(c, 'edit')
        const changes = diffFields(c, next, CONTENT_AUDIT_FIELDS)
        Object.assign(c, next, { version: c.version + 1, updatedAt: nowISO() })
        // Destinations follow: a new platform renames the only draft one (or is added); a single-platform post's status mirrors.
        if (!dests.some((x) => x.platform === c.platform)) {
          if (dests.length === 1 && dests[0]!.status === 'draft') Object.assign(dests[0]!, { platform: c.platform, revision: dests[0]!.revision + 1, updatedAt: nowISO() })
          else load().destinations.push(newDest(c, c.platform))
        }
        const now = destsOf(c)
        if (now.length === 1) {
          const only = now[0]!
          if (c.status === 'published' && only.status !== 'published') Object.assign(only, { status: 'published', publishedAt: c.publishedAt, externalPostUrl: c.postUrl ?? only.externalPostUrl })
          else if (c.status !== 'published' && only.status === 'published') Object.assign(only, { status: 'draft', publishedAt: null })
          else if (c.status === 'published' && 'postUrl' in patch) only.externalPostUrl = c.postUrl
        }
        // Scheduled automatic posts follow the post's date and time (removed date → back to draft).
        if ('scheduledDate' in patch || 'scheduledTime' in patch) {
          for (const x of destsOf(c)) {
            if (x.status !== 'scheduled' || x.scheduledAt) continue
            const due = dueOf(c, x)
            if (due) x.dueAt = due
            else Object.assign(x, { status: 'draft', mode: 'manual', dueAt: null, lastErrorCode: 'date_removed' })
          }
        }
        logContent(c, classifyContent(changes), changes)
        persist()
        return contentView(c)
      },
      async archive(id) {
        await net()
        const c = contentAccess(id, 'content.delete')
        Object.assign(c, { archivedAt: nowISO(), version: c.version + 1, updatedAt: nowISO() })
        logContent(c, 'content.archived')
        persist()
        return contentView(c)
      },
      async duplicate(id) {
        await net()
        const src = contentAccess(id, 'content.read')
        brandAccess(src.brandId, 'content.create')
        const now = nowISO()
        const copy: Owned<Content> = { ...clone(src), ownerId: uidOf(), id: `c_${nextSeq()}`, title: `${src.title} (copy)`, jobItemId: null, source: 'manual', status: 'draft', scheduledDate: null, scheduledTime: null, publishedAt: null, postUrl: null, version: 1, createdAt: now, updatedAt: now }
        load().contents.push(copy)
        logContent(copy, 'content.duplicated', [{ field: 'source', from: src.title, to: copy.title }])
        persist()
        return contentView(copy)
      },
      async revisions(id) {
        await net()
        contentAccess(id, 'content.read')
        return load().revisions.filter((r) => r.contentId === id).sort((a, b) => b.version - a.version || b.createdAt.localeCompare(a.createdAt))
          .map((r) => ({ id: r.id, contentId: r.contentId, version: r.version, reason: r.reason, snapshot: snapshot(r.snapshot), createdAt: r.createdAt }))
      },
      async regenerate(id, key) {
        await net({ latency: 1400 })
        const d = load()
        const me = uidOf()
        const c = contentAccess(id, 'content.update')
        const opKey = `regen:${me}:${key}`
        if (d.idempotency[opKey]) return contentView(c)
        const brand = brandAccess(c.brandId, 'brand.read')
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
        logContent(c, 'content.regenerated')
        Object.assign(c, draft, { suggestedDate: c.suggestedDate, version: c.version + 1, updatedAt: nowISO() })
        post(me, 'consume', 0, -1, 'item', itemId, `consume:${itemId}`)
        d.idempotency[opKey] = itemId
        persist()
        return contentView(c)
      },
      async exportCsv(q) {
        await net()
        const rows = filterContents({ ...q, page: 1, pageSize: 10_000 })
        const mine = myBrandIds()
        return buildContentCsv(rows, load().brands.filter((b) => mine.has(b.id)).map(brandView))
      },
    },

    // ------------------------------------------------------ Team Workspace
    team: {
      async get(brandId) {
        await net()
        const b = brandAccess(brandId, 'member.read')
        expireInvites()
        const me = uidOf()
        const d = load()
        const members: BrandMember[] = d.memberships.filter((m) => m.brandId === b.id && m.status === 'active')
          .map((m) => {
            const u = d.users.find((x) => x.id === m.userId)
            return { id: m.id, userId: m.userId, name: u?.name ?? '—', email: u?.email ?? '', role: m.role, positionKeys: [...m.positionKeys], joinedAt: m.joinedAt, isYou: m.userId === me }
          })
          .sort((x, y) => ROLE_ORDER[x.role] - ROLE_ORDER[y.role] || x.joinedAt.localeCompare(y.joinedAt))
        const invitations = d.invitations.filter((i) => i.brandId === b.id && i.status === 'pending').map(inviteView)
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        const plan = brandPlan(b.id)
        return {
          brandId: b.id, members, invitations, seatLimit: DEFAULT_PRICING.plans[plan.planKey].maxMembers, seatsUsed: seatUsage(b.ownerId).used,
          planKey: plan.planKey, features: plan.features, isBillingOwner: b.ownerId === me,
        }
      },
      async invite(brandId, input) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        const role = roleIn(b.id)!
        const err = inviteError(role, input.role)
        if (err === 'forbidden') throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to invite members')
        if (err) fieldError({ role: 'invalid_role' })
        const email = input.email.trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldError({ email: 'invalid_email' })
        expireInvites()
        const d = load()
        const existing = d.users.find((u) => u.email === email)
        if (existing && activeMember(b.id, existing.id)) throw new ApiError(409, 'ALREADY_MEMBER', 'This user is already a member.')
        if (d.invitations.some((i) => i.brandId === b.id && i.email === email && i.status === 'pending')) {
          throw new ApiError(409, 'DUPLICATE_INVITE', 'An invitation has already been sent.')
        }
        const pos = normalizePositions(input.positionKeys)
        if (pos.error) fieldError({ positionKeys: 'invalid_position' })
        // Seats: one pool across all of the owner's brands; someone already counted uses no new seat.
        const plan = brandPlan(b.id)
        if (!plan.features.collaboration) planRequired('Inviting teammates')
        const usage = seatUsage(b.ownerId)
        const counted = usage.members.some((m) => m.email === email) || usage.pendingEmails.includes(email)
        if (!counted && usage.used + 1 > DEFAULT_PRICING.plans[plan.planKey].maxMembers) throw new ApiError(409, 'SEAT_LIMIT', 'All seats on this plan are in use.')
        const token = randomToken()
        const now = nowISO()
        const inv: MockInvitation = {
          id: `inv_${nextSeq()}`, brandId: b.id, email, role: input.role, positionKeys: pos.keys, tokenHash: await sha256(token), status: 'pending',
          invitedByUserId: uidOf(), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString(),
          acceptedByUserId: null, acceptedAt: null, createdAt: now, updatedAt: now,
        }
        d.invitations.push(inv)
        logActivity(b.id, 'member.invited', 'member', inv.id, email, [{ field: 'role', from: null, to: input.role }, ...(pos.keys.length ? [{ field: 'positions', from: null, to: pos.keys }] : [])])
        persist()
        return { invitation: inviteView(inv), inviteUrl: inviteUrl(token), emailSent: false }
      },
      async resend(brandId, invitationId) {
        await net()
        const b = brandAccess(brandId, 'member.invite')
        expireInvites()
        const inv = load().invitations.find((i) => i.id === invitationId && i.brandId === b.id)
        if (!inv) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found')
        if (inv.status !== 'pending') throw new ApiError(409, 'INVITE_INVALID', `This invitation is ${inv.status}.`)
        const token = randomToken() // new link; the old one stops working
        Object.assign(inv, { tokenHash: await sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5).toISOString(), updatedAt: nowISO() })
        logActivity(b.id, 'member.invite_resent', 'member', inv.id, inv.email)
        persist()
        return { invitation: inviteView(inv), inviteUrl: inviteUrl(token), emailSent: false }
      },
      async cancel(brandId, invitationId) {
        await net()
        const b = brandAccess(brandId, 'member.invite')
        const inv = load().invitations.find((i) => i.id === invitationId && i.brandId === b.id)
        if (!inv) throw new ApiError(404, 'NOT_FOUND', 'Invitation not found')
        if (inv.status === 'pending') {
          Object.assign(inv, { status: 'cancelled', updatedAt: nowISO() })
          logActivity(b.id, 'member.invite_cancelled', 'member', inv.id, inv.email)
        }
        persist()
      },
      async updateRole(brandId, memberId, role) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        const m = load().memberships.find((x) => x.id === memberId && x.brandId === b.id && x.status === 'active')
        if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found')
        throwMemberError(roleChangeError(roleIn(b.id)!, m.role, role, ownerCount(b.id)))
        if (m.role !== role) logActivity(b.id, 'member.role_changed', 'member', m.id, load().users.find((x) => x.id === m.userId)?.name ?? null, [{ field: 'role', from: m.role, to: role }])
        Object.assign(m, { role, roleUpdatedAt: nowISO(), updatedAt: nowISO() })
        persist()
        return memberView(m)
      },
      async updatePositions(brandId, memberId, positionKeys) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        const m = load().memberships.find((x) => x.id === memberId && x.brandId === b.id && x.status === 'active')
        if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found')
        const pos = normalizePositions(positionKeys)
        if (pos.error) fieldError({ positionKeys: 'invalid_position' })
        if (!brandPlan(b.id).features.memberPositions) planRequired('Position tags')
        // Same rule as roles: managers only; only an Owner edits an Owner's membership. Role/seats/tasks untouched.
        throwMemberError(roleChangeError(roleIn(b.id)!, m.role, m.role, ownerCount(b.id)))
        if (m.positionKeys.join() !== pos.keys.join()) {
          logActivity(b.id, 'member.positions_changed', 'member', m.id, load().users.find((x) => x.id === m.userId)?.name ?? null, [{ field: 'positions', from: m.positionKeys, to: pos.keys }])
        }
        Object.assign(m, { positionKeys: pos.keys, updatedAt: nowISO() })
        persist()
        return memberView(m)
      },
      async remove(brandId, memberId) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        const m = load().memberships.find((x) => x.id === memberId && x.brandId === b.id && x.status === 'active')
        if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found')
        throwMemberError(m.userId === uidOf() ? leaveError(m.role, ownerCount(b.id)) : removeError(roleIn(b.id)!, m.role, ownerCount(b.id)))
        // Access ends now; their content, images and attribution stay.
        Object.assign(m, { status: 'removed', updatedAt: nowISO() })
        logActivity(b.id, m.userId === uidOf() ? 'member.left' : 'member.removed', 'member', m.id, load().users.find((x) => x.id === m.userId)?.name ?? null, [{ field: 'role', from: m.role, to: null }])
        persist()
      },
      async leave(brandId) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        const m = activeMember(b.id, uidOf())!
        throwMemberError(leaveError(m.role, ownerCount(b.id)))
        Object.assign(m, { status: 'removed', updatedAt: nowISO() })
        logActivity(b.id, 'member.left', 'member', m.id, currentUser().name, [{ field: 'role', from: m.role, to: null }])
        persist()
      },
    },

    invitations: {
      async preview(token) {
        await net({ latency: 200 })
        expireInvites()
        const inv = await byToken(token)
        const d = load()
        const b = d.brands.find((x) => x.id === inv.brandId)
        return {
          status: inv.status, brandName: b?.name ?? '—', brandColor: b?.color ?? '#6C4CF5',
          inviterName: d.users.find((u) => u.id === inv.invitedByUserId)?.name ?? '—', email: inv.email, role: inv.role, positionKeys: inv.positionKeys, expiresAt: inv.expiresAt,
        }
      },
      async accept(token) {
        await net()
        return acceptInvitation(await byToken(token))
      },
      async decline(token) {
        await net()
        declineInvitation(await byToken(token))
      },
      async mine() {
        await net({ latency: 200 })
        expireInvites()
        const d = load()
        const email = currentUser().email
        return d.invitations.filter((i) => i.email === email && i.status === 'pending' && !activeMember(i.brandId, uidOf())).map((i) => {
          const b = d.brands.find((x) => x.id === i.brandId)
          return { id: i.id, brandId: i.brandId, brandName: b?.name ?? '—', brandColor: b?.color ?? '#6C4CF5', inviterName: d.users.find((u) => u.id === i.invitedByUserId)?.name ?? '—', role: i.role, expiresAt: i.expiresAt }
        })
      },
      async acceptMine(id) {
        await net()
        return acceptInvitation(mineById(id))
      },
      async declineMine(id) {
        await net()
        declineInvitation(mineById(id))
      },
    },

    activity: {
      async list(brandId, q = {}) {
        await net({ latency: 200 })
        const b = brandAccess(brandId, 'brand.read') // any member may read
        const rows = load().activity
          .filter((a) => a.brandId === b.id && (!q.entityType || a.entityType === q.entityType) && (!q.entityId || a.entityId === q.entityId))
          .sort((x, y) => y.createdAt.localeCompare(x.createdAt) || y.id.localeCompare(x.id))
        const pageSize = Math.min(50, Math.max(1, q.pageSize ?? 30))
        const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
        const page = Math.min(pageCount, Math.max(1, q.page ?? 1))
        return { data: clone(rows.slice((page - 1) * pageSize, page * pageSize)), meta: { page, pageSize, total: rows.length, pageCount } }
      },
    },

    // --------------------------------------------------------- post images
    contentImages: {
      async upload(contentId, files, onProgress) {
        await net()
        const c = contentAccess(contentId, 'contentImage.upload')
        const current = imagesOf(c.id)
        if (current.length + files.length > limits.maxCount) {
          throw new ApiError(400, 'TOO_MANY_IMAGES', `A post can have up to ${limits.maxCount} images.`)
        }
        const checked = await Promise.all(files.map(checkImage)) // validate everything before saving anything
        let order = current.length ? Math.max(...current.map((i) => i.sortOrder)) + 1 : 0
        for (const [n, f] of checked.entries()) {
          await storeImage(c.id, f, order++)
          onProgress?.(Math.round(((n + 1) / checked.length) * 100))
        }
        logContent(c, 'content.image_added', [{ field: 'images', from: null, to: files.map((f) => f.name) }])
        persist()
        return Promise.all(imagesOf(c.id).map(imageView))
      },
      async replace(contentId, imageId, file) {
        await net()
        const c = contentAccess(contentId, 'contentImage.replace')
        const old = imagesOf(c.id).find((i) => i.id === imageId)
        if (!old) throw new ApiError(404, 'NOT_FOUND', 'This image was already removed')
        const f = await checkImage(file)
        await storeImage(c.id, f, old.sortOrder) // keeps its position
        await dropImage(old)
        logContent(c, 'content.image_replaced', [{ field: 'images', from: old.filename, to: file.name }])
        persist()
        return Promise.all(imagesOf(c.id).map(imageView))
      },
      async remove(contentId, imageId) {
        await net()
        const c = contentAccess(contentId, 'contentImage.delete')
        const img = imagesOf(c.id).find((i) => i.id === imageId)
        if (!img) throw new ApiError(404, 'NOT_FOUND', 'This image was already removed')
        await dropImage(img)
        logContent(c, 'content.image_removed', [{ field: 'images', from: img.filename, to: null }])
        persist()
        return Promise.all(imagesOf(c.id).map(imageView))
      },
      async reorder(contentId, imageIds) {
        await net({ latency: 150 })
        const c = contentAccess(contentId, 'contentImage.replace')
        const imgs = imagesOf(c.id)
        if (imageIds.length !== imgs.length || !imgs.every((i) => imageIds.includes(i.id))) {
          throw new ApiError(409, 'CONFLICT', 'The images changed in the meantime. Reload and try again.')
        }
        const before = imgs.map((i) => i.filename)
        imageIds.forEach((id, n) => { imgs.find((i) => i.id === id)!.sortOrder = n })
        logContent(c, 'content.images_reordered', [{ field: 'images', from: before, to: imagesOf(c.id).map((i) => i.filename) }])
        persist()
        return Promise.all(imagesOf(c.id).map(imageView))
      },
      async download(contentId, imageId) {
        await net({ latency: 120 })
        const c = contentAccess(contentId, 'contentImage.read')
        const img = imagesOf(c.id).find((i) => i.id === imageId)
        const blob = img ? await idbDo<Blob | undefined>('readonly', (st) => st.get(img.id)) : undefined
        if (!img || !blob) throw new ApiError(404, 'NOT_FOUND', 'This image is no longer available')
        return blob
      },
    },

    destinations: {
      async list(contentId) {
        await net()
        return destsOf(contentAccess(contentId, 'content.read')).map(destView)
      },
      async replace(contentId, items) {
        await net()
        const c = contentAccess(contentId, 'content.update')
        if (c.archivedAt) throw new ApiError(409, 'CONFLICT', 'This post is archived')
        const own = new Set(imagesOf(c.id).map((i) => i.id))
        const errors: Record<string, string> = {}
        if (!Array.isArray(items) || !items.length) fieldError({ destinations: 'required' })
        const seen = new Set<string>()
        items.forEach((it, i) => {
          if (!PLATFORMS.includes(it.platform)) errors[`destinations.${i}.platform`] = 'invalid'
          else if (seen.has(it.platform)) errors[`destinations.${i}.platform`] = 'duplicate'
          seen.add(it.platform)
          if (typeof it.captionOverride === 'string' && it.captionOverride.length > MAX_CAPTION) errors[`destinations.${i}.captionOverride`] = 'too_long'
          if (it.mediaOverrideIds?.some((id) => !own.has(id))) errors[`destinations.${i}.mediaOverrideIds`] = 'not_this_content'
          if (it.scheduledAt && Number.isNaN(Date.parse(it.scheduledAt))) errors[`destinations.${i}.scheduledAt`] = 'invalid_date'
        })
        if (Object.keys(errors).length) fieldError(errors)
        const d = load()
        const before = destsOf(c)
        const wanted = new Set(items.map((x) => x.platform))
        if (before.some((x) => !wanted.has(x.platform) && (x.status === 'published' || x.status === 'publishing'))) {
          throw new ApiError(409, 'CONFLICT', 'A platform that is already published can’t be removed. Undo “published” first.', { destinations: 'published_cannot_remove' })
        }
        d.destinations = d.destinations.filter((x) => x.contentId !== c.id || wanted.has(x.platform))
        for (const it of items) {
          const fields = { captionOverride: it.captionOverride ?? null, mediaOverrideIds: it.mediaOverrideIds ?? null, scheduledAt: it.scheduledAt ? new Date(it.scheduledAt).toISOString() : null, timezone: it.timezone || DEFAULT_TIMEZONE }
          const cur = d.destinations.find((x) => x.contentId === c.id && x.platform === it.platform)
          if (!cur) d.destinations.push(newDest(c, it.platform, fields))
          else if (JSON.stringify([cur.captionOverride, cur.mediaOverrideIds, cur.scheduledAt, cur.timezone]) !== JSON.stringify([fields.captionOverride, fields.mediaOverrideIds, fields.scheduledAt, fields.timezone])) {
            Object.assign(cur, fields, { revision: cur.revision + 1, updatedAt: nowISO() })
          }
        }
        const from = before.map((x) => x.platform)
        const to = items.map((x) => x.platform)
        const content = rollupFor(c, wanted.has(c.platform) ? {} : { platform: items[0]!.platform })
        if (from.join() !== to.join()) logContent(c, 'content.platforms_changed', [{ field: 'platform', from, to }])
        for (const x of destsOf(c)) if (x.status === 'scheduled') x.dueAt = dueOf(c, x)
        persist()
        return { data: destsOf(c).map(destView), content }
      },
      async markPublished(destinationId, input) {
        await net()
        const dest = load().destinations.find((x) => x.id === destinationId)
        if (!dest) throw new ApiError(404, 'NOT_FOUND', 'Not found')
        const c = contentAccess(dest.contentId, 'content.update')
        if (c.archivedAt) throw new ApiError(409, 'CONFLICT', 'This post is archived')
        const published = input.published !== false
        const url = typeof input.postUrl === 'string' ? input.postUrl.trim() : input.postUrl
        if (url && !/^https?:\/\/\S+$/i.test(url)) fieldError({ postUrl: 'invalid_url' })
        if (published && input.publishedAt && Date.parse(input.publishedAt) > Date.now() + 5 * 60_000) fieldError({ publishedAt: 'in_future' })
        if (published) Object.assign(dest, { status: 'published', publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : nowISO(), ...(url !== undefined ? { externalPostUrl: url || null } : {}) })
        else Object.assign(dest, { status: 'draft', publishedAt: null })
        dest.updatedAt = nowISO()
        const content = rollupFor(c)
        logContent(c, published ? 'content.platform_published' : 'content.platform_unpublished', [{ field: 'platform', from: null, to: dest.platform }])
        persist()
        return { data: destView(dest), content }
      },
      async autopost(contentId) {
        await net({ canFail: false, latency: 120 })
        const c = contentAccess(contentId, 'content.read')
        const plan = brandPlan(c.brandId)
        const accounts: AutopostInfo['accounts'] = {}
        for (const x of conns().filter((k) => k.brandId === c.brandId)) {
          accounts[x.platform] = { id: x.id, status: x.status, displayName: x.displayName, username: x.username, avatarUrl: x.avatarUrl }
        }
        return { available: plan.features.socialConnections && !plan.locked, reason: plan.locked ? 'brand_locked' : plan.features.socialConnections ? null : 'plan_required', platforms: AUTO, accounts, tiktokPrivateOnly: true }
      },
      async tiktokCreator(contentId) {
        await net({ canFail: false })
        const c = contentAccess(contentId, 'content.update')
        const conn = connOf(c.brandId, 'tiktok')
        if (!conn) publishFail('not_connected', 'Connect TikTok in Social channels first')
        return { nickname: conn.displayName, username: conn.username, avatarUrl: null, privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'], commentDisabled: false, privateOnly: true }
      },
      async publish(destinationId, options) {
        await net({ canFail: false, latency: 900 })
        const dest = load().destinations.find((x) => x.id === destinationId)
        if (!dest) throw new ApiError(404, 'NOT_FOUND', 'Not found')
        const c = contentAccess(dest.contentId, 'content.update')
        if (c.archivedAt) throw new ApiError(409, 'CONFLICT', 'This post is archived')
        if (dest.status === 'published') publishFail('already_published', 'Already posted on this platform')
        if (dest.status === 'publishing') publishFail('in_progress', 'Already posting')
        const conn = preflightMock(c, dest)
        if (dest.platform === 'tiktok') {
          Object.assign(dest, { status: 'publishing', mode: 'auto', options: tiktokOpts(options ?? dest.options), dueAt: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: nowISO() })
          persist()
          return { data: destView(dest), content: null, result: { state: 'publishing' } }
        }
        goLive(c, dest, conn)
        persist()
        return { data: destView(dest), content: { status: c.status, version: c.version, publishedAt: c.publishedAt, postUrl: c.postUrl, platform: c.platform }, result: { state: 'published' } }
      },
      async schedule(destinationId, options) {
        await net({ canFail: false })
        const dest = load().destinations.find((x) => x.id === destinationId)
        if (!dest) throw new ApiError(404, 'NOT_FOUND', 'Not found')
        const c = contentAccess(dest.contentId, 'content.update')
        if (c.archivedAt) throw new ApiError(409, 'CONFLICT', 'This post is archived')
        if (dest.status === 'published' || dest.status === 'publishing') publishFail('already_published', 'Already posted on this platform')
        const due = dueOf(c, dest)
        if (!due) publishFail('needs_time', 'Set a date and time first', 400)
        if (Date.parse(due) <= Date.now() + 60_000) publishFail('time_passed', 'That time has passed — post now instead', 400)
        preflightMock(c, dest)
        Object.assign(dest, { status: 'scheduled', mode: 'auto', dueAt: due, options: dest.platform === 'tiktok' ? tiktokOpts(options ?? dest.options) : dest.options ?? null, lastErrorCode: null, lastErrorMessage: null, updatedAt: nowISO() })
        logContent(c, 'content.autopost_scheduled', [{ field: 'platform', from: null, to: dest.platform }])
        persist()
        return { data: destView(dest), content: null }
      },
      async unschedule(destinationId) {
        await net({ canFail: false })
        const dest = load().destinations.find((x) => x.id === destinationId)
        if (!dest) throw new ApiError(404, 'NOT_FOUND', 'Not found')
        const c = contentAccess(dest.contentId, 'content.update')
        if (!['scheduled', 'failed', 'paused'].includes(dest.status)) publishFail('not_scheduled', 'This platform isn’t scheduled')
        Object.assign(dest, { status: 'draft', mode: 'manual', dueAt: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: nowISO() })
        logContent(c, 'content.autopost_cancelled', [{ field: 'platform', from: dest.platform, to: null }])
        persist()
        return { data: destView(dest), content: null }
      },
    },

    // The in-browser demo has no Meta/TikTok apps: "Connect" adds demo accounts at once
    // (Meta → the brand's Facebook Page + Instagram; TikTok → a creator account). Nothing leaves the browser.
    social: {
      async list(brandId) {
        await net()
        brandAccess(brandId, 'brand.read')
        const connections = conns().filter((x) => x.brandId === brandId).map(({ brandId: _b, ...x }) => clone(x))
        return { connections, settings: { meta: true, tiktok: true, fake: true, tiktokPrivateOnly: true } }
      },
      async connect(brandId, provider) {
        await net()
        const b = brandAccess(brandId, 'brand.update')
        const plan = brandPlan(brandId)
        if (plan.locked) throw new ApiError(403, 'FORBIDDEN', 'This brand is locked until its plan is renewed', { brand: 'locked' })
        if (!plan.features.socialConnections) throw new ApiError(403, 'PLAN_REQUIRED', 'Connecting accounts is part of Team and Studio', { plan: 'plan_required' })
        const me = load().users.find((u) => u.id === uidOf())
        const handle = slug(b.name)
        const make = (platform: SocialPlatform, extra: Partial<SocialConnection>) => {
          const list = conns()
          const i = list.findIndex((x) => x.brandId === brandId && x.platform === platform)
          const row = {
            id: `sc_${nextSeq()}`, brandId, platform, provider: platform === 'tiktok' ? 'tiktok' : 'meta', externalAccountId: `${Date.now()}${list.length}`,
            displayName: b.name, username: null, avatarUrl: null, status: 'connected', connectedAt: nowISO(), connectedBy: { id: uidOf(), name: me?.name ?? null },
            lastCheckedAt: null, lastCheckOk: null, lastCheckError: null, lastCheck: null, ...extra,
          } as SocialConnection & { brandId: string }
          if (i >= 0) list[i] = row
          else list.push(row)
        }
        if (provider === 'meta') { make('facebook', {}); make('instagram', { username: handle }) }
        else make('tiktok', { username: handle })
        persist()
        return { url: `/app/brands/${brandId}/channels?social=connected&platform=${provider === 'meta' ? 'facebook' : 'tiktok'}` }
      },
      async pages() { await net(); throw new ApiError(404, 'NOT_FOUND', 'Not found') },
      async choosePage() { await net(); throw new ApiError(404, 'NOT_FOUND', 'Not found') },
      async test(connectionId) {
        await net()
        const x = conns().find((k) => k.id === connectionId)
        if (!x) throw new ApiError(404, 'NOT_FOUND', 'Connection not found')
        brandAccess(x.brandId, 'brand.update')
        const checks = [{ key: 'token', ok: true }, { key: 'permissions', ok: true, missing: [] }, { key: 'account', ok: true, name: x.username ? `@${x.username}` : x.displayName ?? '' }] as SocialConnection['lastCheck'] & object
        Object.assign(x, { status: 'connected', lastCheckedAt: nowISO(), lastCheckOk: true, lastCheckError: null, lastCheck: checks })
        persist()
        const { brandId: _b, ...connection } = x
        return { ok: true, errorKind: null, errorCode: null, checks, connection: clone(connection) }
      },
      async disconnect(connectionId) {
        await net()
        const list = conns()
        const x = list.find((k) => k.id === connectionId)
        if (!x) throw new ApiError(404, 'NOT_FOUND', 'Connection not found')
        brandAccess(x.brandId, 'brand.update')
        load().socialConnections = list.filter((k) => k.id !== connectionId)
        persist()
        return conns().filter((k) => k.brandId === x.brandId).map(({ brandId: _b, ...k }) => clone(k))
      },
    },

    calendar: {
      async range(from, to, brandId, opts = {}) {
        await net()
        const mineBrands = myBrandIds()
        const withTray = opts.includeUnscheduled !== false
        const d = load()
        const archivedBrands = new Set(d.brands.filter((b) => b.archivedAt).map((b) => b.id))
        return d.contents
          .filter((c) => mineBrands.has(c.brandId) && !c.archivedAt && !archivedBrands.has(c.brandId) && (!brandId || c.brandId === brandId)
            && (c.scheduledDate === null ? withTray : c.scheduledDate >= from && c.scheduledDate <= to))
          .map(contentView)
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
        const brand = brandAccess(input.brandId, 'content.create')
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
        return load().orders.filter((o) => o.ownerId === uidOf()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(orderView)
      },
      async createOrder(raw) {
        await net()
        const input: OrderInput = typeof raw === 'number' ? { kind: 'credits', credits: raw } : raw
        // The amount always comes from the price list, never from the page.
        let amountSatang = 0
        let credits = 0
        if (input.kind === 'credits') {
          credits = input.credits
          if (!Number.isInteger(credits) || credits < 1 || credits > 500) fieldError({ credits: 'invalid_credits' })
          amountSatang = credits * PRICE_SATANG
        } else if (input.kind === 'plan') {
          if (input.planKey !== 'team' && input.planKey !== 'studio') fieldError({ planKey: 'invalid' })
          amountSatang = DEFAULT_PRICING.plans[input.planKey].monthlySatang
        } else if (input.kind === 'renewal') {
          // One payment for everything: an optional plan month + a month for each listed extra brand.
          const plan = planOf(uidOf())
          const extra = new Set(plan.coverage.brands.filter((b) => b.kind !== 'included').map((b) => b.id))
          const ids = input.brandIds ?? []
          if (ids.some((x) => !extra.has(x)) || new Set(ids).size !== ids.length) fieldError({ brandIds: 'invalid' })
          if (input.planKey && input.planKey !== 'team' && input.planKey !== 'studio') fieldError({ planKey: 'invalid' })
          if (input.planKey === 'studio' && ids.length) fieldError({ brandIds: 'invalid' }) // Studio covers every brand
          if (!input.planKey && !ids.length) fieldError({ brandIds: 'required' })
          amountSatang = (input.planKey ? DEFAULT_PRICING.plans[input.planKey].monthlySatang : 0) + ids.length * DEFAULT_PRICING.additionalBrandMonthlySatang
        } else {
          if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 20) fieldError({ quantity: 'invalid' })
          if (planOf(uidOf()).planKey === 'studio') throw new ApiError(409, 'CONFLICT', 'Studio already includes unlimited brands.')
          amountSatang = DEFAULT_PRICING.additionalBrandMonthlySatang * input.quantity
        }
        // Never reuse an id (older demo data seeded po_1001/po_1002 while the counter started at 1000).
        let id = `po_${nextSeq()}`
        while (load().orders.some((o) => o.id === id)) id = `po_${nextSeq()}`
        const now = Date.now()
        // Short, unambiguous code (no 0/O/1/I) the payer can type into the transfer note.
        const ref = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 32]).join('')
        const order: Owned<PaymentOrder> = {
          id, ownerId: uidOf(), kind: input.kind, credits, planKey: input.kind === 'plan' || input.kind === 'renewal' ? input.planKey : null,
          quantity: input.kind === 'brand_addon' ? input.quantity : input.kind === 'renewal' ? input.brandIds.length : null,
          brandIds: input.kind === 'renewal' ? [...input.brandIds] : undefined,
          amountSatang, currency: 'THB', status: 'pending',
          provider: 'promptpay', providerRef: `pp_${ref.toLowerCase()}`, reference: `PLN-${ref}`,
          payee: { promptpayId: payment.promptpayId, name: payment.name }, slipUploadedAt: null, reviewNote: null,
          expiresAt: new Date(now + payment.ttlHours * 3600_000).toISOString(), createdAt: new Date(now).toISOString(), paidAt: null,
        }
        load().orders.push(order)
        persist()
        return orderView(order)
      },
      async getOrder(id) {
        await net({ latency: 200 })
        expireOrders(uidOf())
        const o = load().orders.find((x) => x.id === id && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        return orderView(o)
      },
      async uploadSlip(orderId, file) {
        await net({ latency: 700 })
        expireOrders(uidOf())
        const o = load().orders.find((x) => x.id === orderId && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        return acceptSlip(o, file)
      },
      async createHandoff(orderId) {
        await net({ latency: 200 })
        expireOrders(uidOf())
        const o = load().orders.find((x) => x.id === orderId && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        if (!['pending', 'rejected', 'verifying', 'expired'].includes(o.status)) throw new ApiError(409, 'CONFLICT', `This order is ${o.status}.`)
        // Demo: the "token" just names the order and only works in this browser (data lives in localStorage).
        const expiresAt = new Date(Date.now() + 45 * 60_000).toISOString()
        const token = `demo.${o.id}.${Date.parse(expiresAt).toString(36)}`
        return { token, url: `${location.origin}/pay/${token}`, expiresAt }
      },
      async simulateReview(orderId, outcome) {
        // Demo stand-in for the slip check (staff review now, Slip2Go later).
        await net({ canFail: false, latency: 900 })
        const d = load()
        const o = d.orders.find((x) => x.id === orderId && x.ownerId === uidOf())
        if (!o) throw new ApiError(404, 'NOT_FOUND', 'Order not found')
        if (o.status !== 'awaiting_review') return
        if (outcome === 'paid') {
          o.status = 'paid'
          o.paidAt = nowISO()
          fulfill(o) // idempotent: once per order
        } else {
          Object.assign(o, { status: 'rejected', resultCode: 'amount_mismatch', reviewNote: null })
        }
        persist()
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

    handoff: {
      async get(token) {
        await net({ latency: 200 })
        const o = handoffOrder(token)
        expireOrders(o.ownerId)
        return orderView(o)
      },
      async uploadSlip(token, file) {
        await net({ latency: 700 })
        const o = handoffOrder(token)
        expireOrders(o.ownerId)
        return acceptSlip(o, file)
      },
    },

    billing: {
      async me() {
        await net({ latency: 200 })
        const me = uidOf()
        const plan = planOf(me)
        const now = nowISO()
        const owned = load().brands.filter((b) => b.ownerId === me)
        persist() // planOf may have given free slots to locked brands
        return {
          planKey: plan.planKey, periodEnd: plan.periodEnd, lastPlanKey: plan.lastPlanKey, lastPlanEnd: plan.lastPlanEnd,
          brandAddons: plan.planKey === 'studio' ? 0 : plan.addonUnits, freeSlots: plan.coverage.freeSlots,
          brandLimit: plan.planKey === 'studio' ? null : FREE_BRANDS + plan.coverage.brands.filter((b) => b.kind === 'slot').length + plan.coverage.freeSlots,
          brandsOwned: owned.length,
          brands: plan.coverage.brands.map((c) => {
            const b = owned.find((x) => x.id === c.id)!
            return { ...c, name: b.name, color: b.color, archivedAt: b.archivedAt, createdAt: b.createdAt }
          }),
          seatLimit: DEFAULT_PRICING.plans[plan.planKey].maxMembers, seatsUsed: seatUsage(me).used, features: featureFlags(plan.planKey),
          upcoming: plan.subs.filter((x) => x.status === 'active' && x.periodStart > now).map((x) => ({ planKey: x.planKey, periodStart: x.periodStart, periodEnd: x.periodEnd })),
          pricing: clone(DEFAULT_PRICING),
        }
      },
      async simulateExpire() {
        // Demo: end the current plan and add-ons now, to see what a lapsed plan does (nothing is deleted).
        await net({ canFail: false })
        const d = load()
        const me = uidOf()
        const now = nowISO()
        for (const r of [...d.subscriptions, ...d.addons]) if (r.ownerId === me && r.periodEnd > now) r.periodEnd = now
        persist()
      },
    },

    tasks: {
      async forContent(contentId) {
        await net({ latency: 200 })
        const c = contentAccess(contentId, 'content.read')
        return load().tasks.filter((t) => t.contentId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => taskView(t, true))
      },
      async mine() {
        await net()
        const d = load()
        const me = uidOf()
        const myMembers = new Set(d.memberships.filter((m) => m.userId === me && m.status === 'active').map((m) => m.id))
        const today = todayISO()
        return d.tasks.filter((t) => t.assigneeMemberId && myMembers.has(t.assigneeMemberId) && roleIn(t.brandId)).map((t) => taskView(t))
          .sort((a, b) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      },
      async forBrand(brandId) {
        await net()
        const b = brandAccess(brandId, 'brand.read')
        return load().tasks.filter((t) => t.brandId === b.id).sort((a, c) => c.updatedAt.localeCompare(a.updatedAt)).map((t) => taskView(t))
      },
      async create(contentId, input) {
        await net()
        const d = load()
        const c = contentAccess(contentId, 'content.read')
        if (!brandPlan(c.brandId).features.taskAssignment) planRequired('Task assignment')
        if (!actorCapabilities(roleIn(c.brandId), false, false).assign) throw new ApiError(403, 'FORBIDDEN', 'Your role does not allow this.')
        checkTaskFields(input)
        const member = d.memberships.find((m) => m.id === input.assigneeId && m.brandId === c.brandId)
        taskFail(assigneeError(input.positionKey, member))
        if (d.tasks.some((t) => t.activeKey === `${c.id}:design`)) throw new ApiError(409, 'CONFLICT', 'This post already has an open design task. Reassign or finish it first.')
        const now = nowISO()
        const t: MockTask = {
          id: `t_${nextSeq()}`, brandId: c.brandId, contentId: c.id, type: 'design', positionKey: input.positionKey, assigneeMemberId: member!.id, assignedByUserId: uidOf(),
          dueDate: input.dueDate || null, priority: input.priority || 'normal', note: input.note?.trim() || null, status: 'todo', reviewNote: null, completedAt: null,
          briefVersion: c.version, briefSnapshot: c.visualBrief, version: 1, createdAt: now, updatedAt: now, activeKey: `${c.id}:design`,
        }
        d.tasks.push(t)
        taskEvent(t, 'assigned', null, 'todo', t.note)
        logContent(c, 'task.assigned', [{ field: 'assignee', from: null, to: memberName(member!.id) }, { field: 'dueDate', from: null, to: t.dueDate }])
        persist()
        return taskView(t, true)
      },
      async updateAssignment(taskId, input) {
        await net()
        const d = load()
        const t = taskAccess(taskId)
        if (!brandPlan(t.brandId).features.taskAssignment) planRequired('Task assignment')
        const caps = actorCapabilities(roleIn(t.brandId), isAssignee(t), t.assignedByUserId === uidOf())
        if (!caps.manager) throw new ApiError(403, 'FORBIDDEN', 'Your role does not allow this.')
        if (!OPEN_TASK_STATUSES.includes(t.status)) throw new ApiError(409, 'CONFLICT', 'This task is already finished.')
        if (input.version !== t.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Someone else changed this task. Reload and try again.')
        checkTaskFields(input)
        const reassign = input.assigneeId !== undefined && input.assigneeId !== t.assigneeMemberId
        const positionKey = input.positionKey ?? t.positionKey
        if (reassign || input.positionKey) taskFail(assigneeError(positionKey, d.memberships.find((m) => m.id === (input.assigneeId ?? t.assigneeMemberId) && m.brandId === t.brandId)))
        const from = t.status
        const before = t.assigneeMemberId
        Object.assign(t, { positionKey, version: t.version + 1, updatedAt: nowISO() })
        if (input.dueDate !== undefined) t.dueDate = input.dueDate || null
        if (input.priority !== undefined) t.priority = input.priority
        if (input.note !== undefined) t.note = input.note?.trim() || null
        if (reassign) {
          Object.assign(t, { assigneeMemberId: input.assigneeId, status: 'todo', reviewNote: null })
          taskEvent(t, 'reassigned', from, 'todo', input.note?.trim() || null)
          const c = d.contents.find((x) => x.id === t.contentId)
          if (c) logContent(c, 'task.reassigned', [{ field: 'assignee', from: before ? memberName(before) : null, to: memberName(input.assigneeId!) }])
        } else {
          taskEvent(t, 'updated', from, from, null)
        }
        persist()
        return taskView(t, true)
      },
      async transition(taskId, action, input) {
        await net()
        const d = load()
        const t = taskAccess(taskId)
        if (!brandPlan(t.brandId).features.taskAssignment) planRequired('Task assignment')
        if (input.version !== t.version) throw new ApiError(409, 'VERSION_CONFLICT', 'Someone else changed this task. Reload and try again.')
        const caps = actorCapabilities(roleIn(t.brandId), isAssignee(t), t.assignedByUserId === uidOf())
        taskFail(transitionError(action, t.status, caps, imagesOf(t.contentId).length, input.note ?? ''))
        const from = t.status
        const to = TASK_TRANSITIONS[action].to
        Object.assign(t, { status: to, version: t.version + 1, updatedAt: nowISO() })
        if (action === 'request_changes') t.reviewNote = input.note!.trim().slice(0, 1000)
        if (to === 'completed') t.completedAt = nowISO()
        if (to === 'completed' || to === 'cancelled') t.activeKey = null
        taskEvent(t, action, from, to, input.note?.trim() || null)
        const c = d.contents.find((x) => x.id === t.contentId)
        const verb: Record<TaskAction, string> = { start: 'started', submit: 'submitted', approve: 'approved', request_changes: 'changes_requested', cancel: 'cancelled' }
        if (c) logContent(c, `task.${verb[action]}`, [{ field: 'taskStatus', from, to }])
        persist()
        return taskView(t, true)
      },
    },

    promotions: {
      async list() {
        await net()
        return load().inquiries.filter((i) => i.ownerId === uidOf()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(strip)
      },
      async create(input) {
        await net()
        brandAccess(input.brandId, 'brand.read')
        if (input.contentId) contentAccess(input.contentId, 'content.read')
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

  function validateGeneration(i: GenerationInput, brand: MockBrand) {
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

  function planItems(i: GenerationInput, brand: MockBrand): MockJob['plan'] {
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
    const mine = myBrandIds()
    const rows = d.contents.filter((c) => mine.has(c.brandId)
      && (q.includeArchived || (!c.archivedAt && !archivedBrands.has(c.brandId)))
      && (!q.brandId || c.brandId === q.brandId)
      && (!s || c.title.toLowerCase().includes(s) || c.caption.toLowerCase().includes(s))
      && (!q.platform || platformsOf({ platform: c.platform, destinations: destsOf(c) }).includes(q.platform))
      && (!q.pillar || c.pillar === q.pillar)
      && (!q.status || (q.status === 'unscheduled' ? !c.scheduledDate : c.status === q.status))
      && (!q.from || (c.scheduledDate !== null && c.scheduledDate >= q.from))
      && (!q.to || (c.scheduledDate !== null && c.scheduledDate <= q.to)))
    rows.sort(q.sort === 'date'
      ? (a, b) => (a.scheduledDate ?? '9999').localeCompare(b.scheduledDate ?? '9999')
      : (a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return rows.map(contentView)
  }

  // ---- activity log (append-only, written here only) ----------------------
  function logActivity(brandId: string, action: string | null, entityType: 'brand' | 'content' | 'member', entityId: string, entityTitle: string | null, changes: ActivityChange[] = []) {
    if (!action) return
    const u = currentUser()
    load().activity.push({ id: `a_${nextSeq()}`, brandId, actorId: u.id, actorName: u.name, action, entityType, entityId, entityTitle, changes, createdAt: nowISO() })
  }
  const logContent = (c: Content, action: string | null, changes: ActivityChange[] = []) => logActivity(c.brandId, action, 'content', c.id, c.title, changes)

  // ---- Team Workspace helpers -------------------------------------------
  const ROLE_ORDER: Record<BrandRole, number> = { owner: 0, admin: 1, editor: 2, viewer: 3 }
  function ownerCount(brandId: string) {
    return load().memberships.filter((m) => m.brandId === brandId && m.status === 'active' && m.role === 'owner').length
  }
  function expireInvites() {
    const now = nowISO()
    for (const i of load().invitations) if (i.status === 'pending' && i.expiresAt < now) Object.assign(i, { status: 'expired', updatedAt: now })
  }
  function memberView(m: MockDB['memberships'][number]): BrandMember {
    const u = load().users.find((x) => x.id === m.userId)
    return { id: m.id, userId: m.userId, name: u?.name ?? '—', email: u?.email ?? '', role: m.role, positionKeys: [...m.positionKeys], joinedAt: m.joinedAt, isYou: m.userId === uidOf() }
  }
  function inviteView(i: MockInvitation): BrandInvitation {
    const by = load().users.find((u) => u.id === i.invitedByUserId)
    return { id: i.id, email: i.email, role: i.role, positionKeys: [...i.positionKeys], status: i.status, invitedByName: by?.name ?? '—', createdAt: i.createdAt, expiresAt: i.expiresAt }
  }
  function inviteUrl(token: string) {
    return `${typeof location !== 'undefined' ? location.origin : ''}/invite/${token}`
  }
  function throwMemberError(code: string | null) {
    if (!code) return
    if (code === 'last_owner') throw new ApiError(409, 'LAST_OWNER', 'A brand must always keep at least one Owner.')
    if (code === 'invalid_role') fieldError({ role: 'invalid_role' })
    throw new ApiError(403, 'FORBIDDEN', code === 'owner_only' ? 'Only an Owner can change ownership.' : 'Your role in this brand does not allow this')
  }
  async function byToken(token: string): Promise<MockInvitation> {
    const hash = await sha256(token)
    const inv = load().invitations.find((i) => i.tokenHash === hash)
    if (!inv) throw new ApiError(404, 'INVITE_INVALID', 'This invitation link is not valid.')
    return inv
  }
  function mineById(id: string): MockInvitation {
    const inv = load().invitations.find((i) => i.id === id && i.email === currentUser().email)
    if (!inv) throw new ApiError(404, 'INVITE_INVALID', 'This invitation is no longer available.')
    return inv
  }
  function checkPending(inv: MockInvitation) {
    expireInvites()
    if (inv.status === 'expired') throw new ApiError(410, 'INVITE_EXPIRED', 'This invitation has expired. Ask for a new one.')
    if (inv.status !== 'pending') throw new ApiError(409, 'INVITE_INVALID', `This invitation was already ${inv.status}.`)
    // The signed-in account must be the invited email.
    if (currentUser().email !== inv.email) throw new ApiError(403, 'EMAIL_MISMATCH', `This invitation was sent to ${inv.email}.`)
  }
  function acceptInvitation(inv: MockInvitation) {
    checkPending(inv)
    const d = load()
    const b = d.brands.find((x) => x.id === inv.brandId)
    if (!b) throw new ApiError(404, 'NOT_FOUND', 'Brand not found')
    // Re-check the owner's plan at acceptance (this invitation already reserves its seat).
    const plan = brandPlan(b.id)
    if (!plan.features.collaboration) planRequired('Joining this team')
    if (seatUsage(b.ownerId).used > DEFAULT_PRICING.plans[plan.planKey].maxMembers) throw new ApiError(409, 'SEAT_LIMIT', 'All seats on this plan are in use.')
    const me = uidOf()
    const now = nowISO()
    const prev = d.memberships.find((m) => m.brandId === b.id && m.userId === me) // one row per brand+user
    // Positions are saved together with the membership.
    if (prev) Object.assign(prev, { role: inv.role, positionKeys: [...inv.positionKeys], status: 'active', joinedAt: now, updatedAt: now, roleUpdatedAt: now })
    else d.memberships.push(membership(b.id, me, inv.role, now, [...inv.positionKeys]))
    Object.assign(inv, { status: 'accepted', acceptedByUserId: me, acceptedAt: now, updatedAt: now })
    logActivity(b.id, 'member.joined', 'member', inv.id, currentUser().name, [{ field: 'role', from: null, to: inv.role }])
    persist()
    return { brandId: b.id }
  }
  function declineInvitation(inv: MockInvitation) {
    checkPending(inv)
    Object.assign(inv, { status: 'declined', updatedAt: nowISO() })
    logActivity(inv.brandId, 'member.invite_declined', 'member', inv.id, inv.email)
    persist()
  }

  // ---- task helpers -------------------------------------------------------------
  function memberName(memberId: string) {
    const d = load()
    const m = d.memberships.find((x) => x.id === memberId)
    return d.users.find((u) => u.id === m?.userId)?.name ?? '—'
  }
  function isAssignee(t: MockTask) {
    const m = load().memberships.find((x) => x.id === t.assigneeMemberId)
    return !!m && m.status === 'active' && m.userId === uidOf()
  }
  /** Re-checks the caller's current membership; same 404 for "missing" and "not yours". */
  function taskAccess(id: string): MockTask {
    const t = load().tasks.find((x) => x.id === id)
    if (!t || !roleIn(t.brandId)) throw new ApiError(404, 'NOT_FOUND', 'Task not found')
    return t
  }
  const TASK_ERRORS: Record<string, [number, 'FORBIDDEN' | 'CONFLICT' | 'INVALID_INPUT', string, Record<string, string>?]> = {
    forbidden: [403, 'FORBIDDEN', 'Your role does not allow this.'],
    invalid_transition: [409, 'CONFLICT', 'This task has moved on. Reload to see its current status.'],
    needs_image: [400, 'INVALID_INPUT', 'Attach at least one final image to the post before submitting.', { images: 'needs_image' }],
    note_required: [400, 'INVALID_INPUT', 'Say what needs to change.', { note: 'required' }],
    invalid_position: [400, 'INVALID_INPUT', 'Pick a design position.', { positionKey: 'invalid_position' }],
    invalid_assignee: [400, 'INVALID_INPUT', 'That person is not an active member of this brand.', { assigneeId: 'invalid_assignee' }],
    assignee_cannot_edit: [400, 'INVALID_INPUT', "Viewers can't take tasks — they can't edit posts.", { assigneeId: 'assignee_cannot_edit' }],
    position_mismatch: [400, 'INVALID_INPUT', "That member doesn't have this position in this brand.", { assigneeId: 'position_mismatch' }],
  }
  function taskFail(code: string | null) {
    if (!code) return
    const [status, c, msg, fields] = TASK_ERRORS[code] ?? [400, 'INVALID_INPUT', code]
    throw new ApiError(status, c, msg, fields ?? {})
  }
  function checkTaskFields(i: { dueDate?: string | null; priority?: string; note?: string }) {
    const e: Record<string, string> = {}
    if (i.dueDate && !isValidISODate(i.dueDate)) e.dueDate = 'invalid_date'
    if (i.priority !== undefined && i.priority !== 'normal' && i.priority !== 'high') e.priority = 'invalid'
    if (i.note && i.note.length > 1000) e.note = 'too_long'
    if (Object.keys(e).length) fieldError(e)
  }
  function taskEvent(t: MockTask, action: string, fromStatus: Task['status'] | null, toStatus: Task['status'] | null, note: string | null) {
    const u = currentUser()
    load().taskEvents.push({ id: `te_${nextSeq()}`, taskId: t.id, actorId: u.id, actorName: u.name, action: action as never, fromStatus, toStatus, note, createdAt: nowISO() })
  }
  function taskView(t: MockTask, withEvents = false): Task {
    const d = load()
    const b = d.brands.find((x) => x.id === t.brandId)
    const c = d.contents.find((x) => x.id === t.contentId)
    const m = d.memberships.find((x) => x.id === t.assigneeMemberId)
    const u = d.users.find((x) => x.id === m?.userId)
    const { assigneeMemberId: _a, assignedByUserId, activeKey: _k, ...rest } = clone(t)
    return {
      ...rest, brandName: b?.name ?? '—', brandColor: b?.color ?? '#6C4CF5', contentTitle: c?.title ?? '—', contentScheduledDate: c?.scheduledDate ?? null,
      imageCount: imagesOf(t.contentId).length,
      assignee: m ? { memberId: m.id, userId: m.userId, name: u?.name ?? '—', positionKeys: [...m.positionKeys], active: m.status === 'active' } : null,
      assignedByName: d.users.find((x) => x.id === assignedByUserId)?.name ?? '—',
      briefChanged: t.briefSnapshot !== null && !!c && c.visualBrief !== t.briefSnapshot,
      isMine: !!m && m.status === 'active' && m.userId === uidOf(), suspended: !brandPlan(t.brandId).features.taskAssignment,
      caps: (({ assignee, reviewer, manager }) => brandPlan(t.brandId).features.taskAssignment ? { assignee, reviewer, manager } : { assignee: false, reviewer: false, manager: false })(
        actorCapabilities(roleIn(t.brandId), !!m && m.status === 'active' && m.userId === uidOf(), assignedByUserId === uidOf())),
      events: withEvents ? d.taskEvents.filter((e) => e.taskId === t.id).map(({ taskId: _t, actorId: _x, ...e }) => clone(e)) : undefined,
    }
  }

  // ---- post image helpers -------------------------------------------------
  async function checkImage(file: File) {
    const type = await sniffFile(file) // real content, not the extension
    if (!type || !(IMAGE_MIME_TYPES as readonly string[]).includes(type)) {
      throw new ApiError(400, 'FILE_TYPE', `"${file.name}" isn't a JPG, PNG, WEBP or GIF image.`)
    }
    if (file.size > limits.maxBytes) throw new ApiError(400, 'FILE_TOO_LARGE', `"${file.name}" is larger than ${Math.round(limits.maxBytes / 1048576)} MB.`)
    return { file, type }
  }
  async function storeImage(contentId: string, f: { file: File; type: string }, sortOrder: number) {
    let width: number | null = null
    let height: number | null = null
    try { const bmp = await createImageBitmap(f.file); width = bmp.width; height = bmp.height; bmp.close() } catch { /* dimensions are optional */ }
    const id = `img_${nextSeq()}`
    try {
      await idbDo('readwrite', (st) => st.put(f.file.slice(0, f.file.size, f.type), id))
    } catch {
      throw new ApiError(507, 'STORAGE', 'Could not save the image (browser storage is full or unavailable).')
    }
    const now = nowISO()
    load().contentImages.push({ id, contentId, filename: f.file.name, mimeType: f.type, size: f.file.size, width, height, sortOrder, uploadedBy: uidOf(), createdAt: now, updatedAt: now })
  }
  async function dropImage(img: MockContentImage) {
    const d = load()
    d.contentImages = d.contentImages.filter((i) => i.id !== img.id)
    await idbDo('readwrite', (st) => st.delete(img.id)).catch(() => {})
    const url = objectUrls.get(img.id)
    if (url) { URL.revokeObjectURL(url); objectUrls.delete(img.id) }
  }
  async function imageView(img: MockContentImage): Promise<ContentImage> {
    let url = objectUrls.get(img.id)
    if (!url) {
      const blob = await idbDo<Blob | undefined>('readonly', (st) => st.get(img.id)).catch(() => undefined)
      url = blob ? URL.createObjectURL(blob) : ''
      if (url) objectUrls.set(img.id, url)
    }
    return { id: img.id, filename: img.filename, mimeType: img.mimeType, size: img.size, width: img.width, height: img.height, url, thumbnailUrl: url, createdAt: img.createdAt }
  }

  function paginate<T>(rows: T[], q: ContentQuery): Paginated<T> {
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20))
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
    const page = Math.min(pageCount, Math.max(1, q.page ?? 1))
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length, pageCount } }
  }

  return source
}
