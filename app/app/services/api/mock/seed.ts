// DEVELOPMENT SEED — fictional demo data only (spec §21: seed demo
// brand/content only in development). Dates are relative to "today" in
// Asia/Bangkok so the calendar always looks alive.

import type {
  ActivityEntry, Brand, BrandRole, Content, ContentFormat, GenerationItem, GenerationJob, Holiday, InvitationStatus, LedgerEntry, LedgerType,
  PaymentOrder, PlanKey, Platform, PositionKey, PromotionInquiry, Task, TaskEvent, User,
} from '~/types'
import { addDays, todayISO } from '~/utils/date'
import { mockGenerate, rng } from './llm'

export type Owned<T> = T & { ownerId: string }

/** Stored brand: role/plan fields are computed per viewer, not stored. ownerId = creator = paying account. */
export type MockBrand = Owned<Omit<Brand, 'myRole' | 'myPositionKeys' | 'planKey' | 'features' | 'isBillingOwner' | 'suspended' | 'locked' | 'coverKind' | 'coveredUntil'>>

export interface MockMembership {
  id: string; brandId: string; userId: string; role: BrandRole; status: 'active' | 'removed'
  positionKeys: PositionKey[]
  joinedAt: string; createdAt: string; updatedAt: string; roleUpdatedAt: string | null
}

/** One paid month of a plan / brand add-ons for an account (pricing.md). */
export interface MockSubscription { id: string; ownerId: string; planKey: Exclude<PlanKey, 'solo'>; status: 'active' | 'cancelled'; periodStart: string; periodEnd: string; orderKey: string | null }
/** A brand slot: one month of cover for `brandId`, or unused slots (brandId null) waiting for a brand. */
export interface MockAddon { id: string; ownerId: string; brandId: string | null; quantity: number; status: 'active' | 'cancelled'; periodStart: string; periodEnd: string; orderKey: string | null }

/** Stored task: views are built per viewer (names, image count, brief change). */
export type MockTask = Omit<Task, 'brandName' | 'brandColor' | 'contentTitle' | 'contentScheduledDate' | 'imageCount' | 'assignee' | 'assignedByName' | 'briefChanged' | 'isMine' | 'caps' | 'suspended' | 'events'> & {
  assigneeMemberId: string | null; assignedByUserId: string; activeKey: string | null
}
export type MockTaskEvent = TaskEvent & { taskId: string; actorId: string }

export interface MockInvitation {
  id: string; brandId: string; email: string; role: BrandRole
  positionKeys: PositionKey[]
  /** SHA-256 of the token; the raw token is only ever shown once to the inviter. */
  tokenHash: string
  status: InvitationStatus; invitedByUserId: string; expiresAt: string
  acceptedByUserId: string | null; acceptedAt: string | null; createdAt: string; updatedAt: string
}

/** Image metadata; the file itself lives in IndexedDB under the same id. */
export interface MockContentImage {
  id: string; contentId: string; filename: string; mimeType: string; size: number
  width: number | null; height: number | null; sortOrder: number; uploadedBy: string; createdAt: string; updatedAt: string
}

export interface MockJob extends Owned<GenerationJob> {
  idempotencyKey: string
  startedAt: number
  plan: { pillar: string; platform: Platform; format: ContentFormat; date: string | null }[]
}

export interface MockDB {
  version: 3
  users: (User & { password: string })[]
  brands: MockBrand[]
  memberships: MockMembership[]
  invitations: MockInvitation[]
  contentImages: MockContentImage[]
  activity: ActivityEntry[]
  subscriptions: MockSubscription[]
  addons: MockAddon[]
  tasks: MockTask[]
  taskEvents: MockTaskEvent[]
  contents: Owned<Content>[]
  revisions: Owned<{ id: string; contentId: string; version: number; reason: 'edit' | 'regenerate' | 'create'; snapshot: Content; createdAt: string }>[]
  jobs: MockJob[]
  wallets: Record<string, { available: number; reserved: number }>
  ledger: Owned<LedgerEntry & { operationKey: string }>[]
  orders: Owned<PaymentOrder>[]
  paymentEvents: string[]
  holidays: (Holiday & { ownerId: string | null })[]
  inquiries: Owned<PromotionInquiry>[]
  feedback: Owned<{ id: string; contentId: string | null; rating: number; comment: string; createdAt: string }>[]
  idempotency: Record<string, string>
  loginAttempts: Record<string, number[]>
  seq: number
}

import { DEMO_EMAIL, DEMO_PASSWORD } from './demo'

export { DEMO_EMAIL, DEMO_PASSWORD }

const at = (iso: string, hh = 10) => `${iso}T${String(hh - 7).padStart(2, '0')}:00:00.000Z` // Bangkok local → UTC

const HOLIDAYS: Omit<Holiday, 'id'>[] = [
  { date: '2026-10-23', title: { th: 'วันปิยมหาราช', en: 'King Chulalongkorn Day' }, kind: 'holiday', country: 'TH', source: 'ปฏิทินวันหยุดราชการ', year: 2026, verified: true },
  { date: '2026-11-11', title: { th: '11.11 วันช้อปออนไลน์', en: '11.11 Shopping Day' }, kind: 'shopping', country: 'TH', source: 'Marketing calendar', year: 2026, verified: true },
  { date: '2026-11-24', title: { th: 'ลอยกระทง (โปรดตรวจสอบ)', en: 'Loy Krathong (please verify)' }, kind: 'observance', country: 'TH', source: 'ปฏิทินจันทรคติ — ยังไม่ยืนยัน', year: 2026, verified: false },
  { date: '2026-12-05', title: { th: 'วันพ่อแห่งชาติ', en: "National Father's Day" }, kind: 'holiday', country: 'TH', source: 'ปฏิทินวันหยุดราชการ', year: 2026, verified: true },
  { date: '2026-12-10', title: { th: 'วันรัฐธรรมนูญ', en: 'Constitution Day' }, kind: 'holiday', country: 'TH', source: 'ปฏิทินวันหยุดราชการ', year: 2026, verified: true },
  { date: '2026-12-12', title: { th: '12.12 วันช้อปออนไลน์', en: '12.12 Shopping Day' }, kind: 'shopping', country: 'TH', source: 'Marketing calendar', year: 2026, verified: true },
  { date: '2026-12-25', title: { th: 'คริสต์มาส', en: 'Christmas Day' }, kind: 'observance', country: 'TH', source: 'Marketing calendar', year: 2026, verified: true },
  { date: '2026-12-31', title: { th: 'วันสิ้นปี', en: "New Year's Eve" }, kind: 'holiday', country: 'TH', source: 'ปฏิทินวันหยุดราชการ', year: 2026, verified: true },
  { date: '2027-01-01', title: { th: 'วันขึ้นปีใหม่', en: "New Year's Day" }, kind: 'holiday', country: 'TH', source: 'ปฏิทินวันหยุดราชการ', year: 2027, verified: true },
  { date: '2027-01-09', title: { th: 'วันเด็กแห่งชาติ', en: "National Children's Day" }, kind: 'observance', country: 'TH', source: 'เสาร์ที่ 2 ของเดือนมกราคม', year: 2027, verified: true },
  { date: '2027-01-16', title: { th: 'วันครู', en: "Teachers' Day" }, kind: 'observance', country: 'TH', source: 'ปฏิทินวันสำคัญ', year: 2027, verified: true },
  { date: '2027-02-06', title: { th: 'ตรุษจีน (โปรดตรวจสอบ)', en: 'Chinese New Year (please verify)' }, kind: 'observance', country: 'TH', source: 'ปฏิทินจันทรคติจีน — ยังไม่ยืนยัน', year: 2027, verified: false },
  { date: '2027-02-14', title: { th: 'วันวาเลนไทน์', en: "Valentine's Day" }, kind: 'observance', country: 'TH', source: 'Marketing calendar', year: 2027, verified: true },
]

const BRANDS: Omit<Brand, 'createdAt' | 'updatedAt' | 'myRole' | 'myPositionKeys' | 'planKey' | 'features' | 'isBillingOwner' | 'suspended' | 'locked' | 'coverKind' | 'coveredUntil'>[] = [
  {
    id: 'b_doidee', name: 'บ้านกาแฟดอยดี', color: '#FFB23F', archivedAt: null,
    profile: {
      industry: 'ร้านกาแฟ / คาเฟ่', description: 'คาเฟ่เล็ก ๆ ในเชียงใหม่ คั่วเมล็ดกาแฟจากดอยทางภาคเหนือเอง เน้นบรรยากาศอบอุ่นและเมนูตามฤดูกาล',
      products: 'กาแฟดริป, ลาเต้เย็น, เมล็ดกาแฟคั่วอ่อน, ครัวซองต์', usp: 'คั่วเองทุกสัปดาห์ รู้แหล่งที่มาของเมล็ดทุกถุง',
      audience: 'คนทำงานรุ่นใหม่ในเชียงใหม่, นักท่องเที่ยวสายคาเฟ่', painPoints: 'อยากได้กาแฟคุณภาพในราคาที่จับต้องได้, หาที่นั่งทำงานเงียบ ๆ',
      tone: 'อบอุ่น เป็นกันเอง', language: 'th', platforms: ['facebook', 'instagram', 'tiktok'],
      guidelines: 'ใช้ภาษาพูดสุภาพ ลงท้าย “นะคะ/นะครับ” ได้, ภาพโทนอุ่น', forbiddenWords: 'ดีที่สุดในประเทศ, รักษาโรค',
      competitors: '', pillars: ['Education', 'Behind the scenes', 'Promotion', 'Community'],
      ctaPreferences: 'แวะมาชิมที่ร้าน, สั่งผ่าน LINE OA, กดติดตามเพจ', goals: 'เพิ่มลูกค้าประจำ',
    },
  },
  {
    id: 'b_glowlab', name: 'GlowLab Skincare', color: '#FF6FAE', archivedAt: null,
    profile: {
      industry: 'สกินแคร์ออนไลน์', description: 'แบรนด์สกินแคร์ขายออนไลน์ สูตรอ่อนโยนสำหรับผิวแพ้ง่าย ผลิตในไทย',
      products: 'เซรั่มไนอะซินาไมด์, ครีมกันแดด SPF50, คลีนเซอร์สูตรอ่อนโยน', usp: 'สูตรอ่อนโยน ทดสอบการระคายเคืองแล้ว ข้อมูลส่วนผสมโปร่งใส',
      audience: 'ผู้หญิงวัยทำงาน 22–35 ปี ผิวแพ้ง่าย', painPoints: 'กลัวแพ้, ไม่รู้จะเลือกสูตรไหน, ข้อมูลในโซเชียลขัดกัน',
      tone: 'สดใส มั่นใจ ให้ข้อมูลจริง', language: 'th-en', platforms: ['instagram', 'tiktok', 'facebook'],
      guidelines: 'ห้ามอ้างผลลัพธ์ทางการแพทย์ อ้างอิงส่วนผสมตามฉลาก', forbiddenWords: 'รักษาสิว 100%, ขาวใน 7 วัน, ไม่มีสารเคมี',
      competitors: '', pillars: ['Education', 'Entertainment', 'Promotion', 'Community'],
      ctaPreferences: 'ดูรายละเอียดที่ลิงก์ในไบโอ, ทักแชทปรึกษาสภาพผิว', goals: 'เพิ่มยอดขายออนไลน์',
    },
  },
  {
    id: 'b_fitbuddy', name: 'FitBuddy Studio', color: '#62C5F4', archivedAt: null,
    profile: {
      industry: 'Fitness studio', description: 'Small-group fitness studio in Bangkok with beginner-friendly strength and mobility classes.',
      products: 'beginner strength class, mobility session, 1:1 coaching', usp: 'Max 8 people per class, coaches who explain every move',
      audience: 'office workers in Bangkok new to the gym', painPoints: 'intimidated by big gyms, no time, back pain from desk work',
      tone: 'Encouraging, upbeat, no jargon', language: 'en', platforms: ['instagram', 'youtube', 'line'],
      guidelines: 'No body shaming, no before/after promises', forbiddenWords: 'lose 10kg fast, guaranteed results',
      competitors: '', pillars: ['Education', 'Inspiration', 'Behind the scenes', 'Promotion'],
      ctaPreferences: 'Book a free trial class, Add us on LINE', goals: 'More trial bookings',
    },
  },
  {
    id: 'b_popup', name: 'Pop-up Market 2025', color: '#A7E66B', archivedAt: '2026-01-15T03:00:00.000Z',
    profile: {
      industry: 'Event', description: 'ตลาดนัดป๊อปอัปช่วงปลายปี 2025 (จบแคมเปญแล้ว)', products: 'บูธร้านค้า, เวิร์กช็อป', usp: '', audience: 'ครอบครัวในกรุงเทพฯ',
      painPoints: '', tone: 'สนุกสนาน', language: 'th', platforms: ['facebook'], guidelines: '', forbiddenWords: '', competitors: '',
      pillars: ['Promotion', 'Community'], ctaPreferences: 'ชวนเพื่อนมาเที่ยว', goals: '',
    },
  },
]

let memberSeq = 0
export function membership(brandId: string, userId: string, role: BrandRole, when: string, positionKeys: PositionKey[] = []): MockMembership {
  return { id: `m_${brandId}_${userId}_${++memberSeq}`, brandId, userId, role, status: 'active', positionKeys, joinedAt: when, createdAt: when, updatedAt: when, roleUpdatedAt: null }
}

/**
 * Demo plans: the demo account is on Team with 2 extra brands (it owns 4,
 * archived included), and Nok runs her studio on Team too — so collaboration,
 * positions and tasks all work out of the box. Also used to migrate older demo data.
 */
export function seedPlans(db: Pick<MockDB, 'subscriptions' | 'addons'>, today: string) {
  const start = at(addDays(today, -12), 9)
  const end = at(addDays(today, 18), 9)
  db.subscriptions.push(
    { id: 'sub_demo', ownerId: 'u_demo', planKey: 'team', status: 'active', periodStart: start, periodEnd: end, orderKey: null },
    { id: 'sub_nok', ownerId: 'u_nok', planKey: 'team', status: 'active', periodStart: start, periodEnd: end, orderKey: null },
  )
  // The demo account's 2 extra brands each have their own slot — one runs out in 3 days, to show renewing.
  db.addons.push(
    { id: 'add_glow', ownerId: 'u_demo', brandId: 'b_glowlab', quantity: 1, status: 'active', periodStart: at(addDays(today, -27), 9), periodEnd: at(addDays(today, 3), 9), orderKey: null },
    { id: 'add_popup', ownerId: 'u_demo', brandId: 'b_popup', quantity: 1, status: 'active', periodStart: start, periodEnd: end, orderKey: null },
  )
}

export function buildSeed(): MockDB {
  const today = todayISO()
  const created = at(addDays(today, -32), 9)
  const db: MockDB = {
    version: 3, users: [], brands: [], memberships: [], invitations: [], contentImages: [], activity: [], subscriptions: [], addons: [], tasks: [], taskEvents: [], contents: [], revisions: [], jobs: [], wallets: {}, ledger: [], orders: [],
    paymentEvents: [], holidays: [], inquiries: [], feedback: [], idempotency: {}, loginAttempts: {}, seq: 1000,
  }
  const demo = 'u_demo'
  db.users.push(
    { id: demo, email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'มิ้นท์ ครีเอเตอร์', verifiedAt: created, locale: 'th', timezone: 'Asia/Bangkok', createdAt: created },
    // A second tenant whose data must never be visible to the demo user.
    { id: 'u_other', email: 'other@example.com', password: 'other12345', name: 'Other Tenant', verifiedAt: created, locale: 'en', timezone: 'Asia/Bangkok', createdAt: created },
  )
  db.wallets[demo] = { available: 0, reserved: 0 }
  db.wallets.u_other = { available: 5, reserved: 0 }
  db.holidays = HOLIDAYS.map((h, i) => ({ ...h, id: `h_${i}`, ownerId: null }))

  for (const b of BRANDS) db.brands.push({ ...b, ownerId: demo, createdAt: created, updatedAt: created })
  db.brands.push({ ...BRANDS[0]!, id: 'b_other', name: 'Other Tenant Brand', ownerId: 'u_other', createdAt: created, updatedAt: created })

  // ---- Team Workspace showcase ------------------------------------------
  // Every brand's creator is its Owner. Nok (a designer) is an Editor on the
  // demo user's coffee brand, and Nok has invited the demo user to her own
  // studio brand (pending) so the accept flow can be tried right away.
  db.users.push({ id: 'u_nok', email: 'nok@example.com', password: 'nok12345', name: 'Nok (Graphic)', verifiedAt: created, locale: 'th', timezone: 'Asia/Bangkok', createdAt: created })
  db.wallets.u_nok = { available: 0, reserved: 0 }
  db.brands.push({ ...BRANDS[2]!, id: 'b_nokstudio', name: 'Nok Design Studio', color: '#6C4CF5', ownerId: 'u_nok', createdAt: created, updatedAt: created })
  for (const b of db.brands) db.memberships.push(membership(b.id, b.ownerId, 'owner', created))
  db.memberships.push(membership('b_doidee', 'u_nok', 'editor', at(addDays(today, -20), 10), ['graphic_designer', 'photographer']))
  db.memberships.find((m) => m.brandId === 'b_doidee' && m.userId === demo)!.positionKeys = ['content_creator', 'marketing_manager']
  seedPlans(db, today)
  db.invitations.push({
    id: 'inv_seed', brandId: 'b_nokstudio', email: DEMO_EMAIL, role: 'editor', positionKeys: ['content_creator'], tokenHash: 'seed-no-link',
    status: 'pending', invitedByUserId: 'u_nok', expiresAt: at(addDays(today, 5), 10), acceptedByUserId: null, acceptedAt: null,
    createdAt: at(addDays(today, -2), 10), updatedAt: at(addDays(today, -2), 10),
  })

  // ---- ledger helper keeps availableAfter consistent -------------------
  const wallet = db.wallets[demo]!
  let ledgerSeq = 0
  const ledger = (type: LedgerType, dA: number, dR: number, day: number, refType: LedgerEntry['refType'], refId: string | null, op: string) => {
    wallet.available += dA
    wallet.reserved += dR
    db.ledger.push({
      id: `l_${++ledgerSeq}`, ownerId: demo, type, deltaAvailable: dA, deltaReserved: dR, availableAfter: wallet.available,
      refType, refId, operationKey: op, createdAt: new Date(Date.parse(at(addDays(today, day), 9)) + ledgerSeq * 60_000).toISOString(),
    })
  }
  const order = (id: string, credits: number, day: number) => {
    db.orders.push({ id, ownerId: demo, kind: 'credits', planKey: null, quantity: null, credits, amountSatang: credits * 1000, currency: 'THB', status: 'paid', provider: 'sandbox', providerRef: `sbx_${id}`, reference: `PLN-${id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6)}`, payee: null, slipUploadedAt: null, reviewNote: null, expiresAt: null, createdAt: at(addDays(today, day), 11), paidAt: at(addDays(today, day), 11) })
    ledger('purchase', credits, 0, day, 'payment', id, `purchase:${id}`)
  }

  ledger('trial_grant', 3, 0, -31, null, null, `trial:${demo}`)
  order('po_seed1', 30, -29)

  // ---- contents + jobs per brand ---------------------------------------
  const FORMATS: ContentFormat[] = ['carousel', 'static', 'short_video', 'text']
  const jobSpecs: Record<string, { jobId: string; requested: number; failed: number; day: number }> = {
    b_doidee: { jobId: 'j_seed1', requested: 10, failed: 0, day: -20 },
    b_glowlab: { jobId: 'j_seed2', requested: 6, failed: 1, day: -2 },
    b_fitbuddy: { jobId: 'j_seed3', requested: 4, failed: 0, day: -1 },
  }
  let cSeq = 0
  for (const b of db.brands.filter((x) => x.ownerId === demo && !x.archivedAt)) {
    const r = rng(b.id.length * 7919)
    const spec = jobSpecs[b.id]!
    const titles = new Set<string>()
    const items: GenerationItem[] = []
    const plan: MockJob['plan'] = []
    const N = 14
    for (let i = 0; i < N; i++) {
      const unscheduled = i >= N - 2
      const date = unscheduled ? null : addDays(today, -16 + i * 3 + Math.floor(r() * 2))
      const pillar = b.profile.pillars[i % b.profile.pillars.length]!
      const platform = b.profile.platforms[i % b.profile.platforms.length]!
      const format = FORMATS[i % FORMATS.length]!
      const draft = mockGenerate({ brand: b, ordinal: i, pillar, objective: (['awareness', 'engagement', 'consideration', 'conversion'] as const)[i % 4]!, platform, format, date: date ?? addDays(today, 5 + i), existingTitles: titles, seed: `${b.id}-${i}` })
      let status: Content['status'] = 'draft'
      if (date) {
        if (date < today) status = 'published'
        else if (date <= addDays(today, 3)) status = 'scheduled'
        else if (date <= addDays(today, 8)) status = i % 2 ? 'approved' : 'in_review'
        else status = i % 3 === 0 ? 'in_review' : 'draft'
      }
      const id = `c_${++cSeq}`
      const fromJob = i < spec.requested - spec.failed
      const itemId = fromJob ? `${spec.jobId}_i${i}` : null
      const ts = at(addDays(today, fromJob ? spec.day : -10 + (i % 9)), 10 + (i % 6))
      db.contents.push({
        ...draft, id, ownerId: demo, brandId: b.id, jobItemId: itemId, source: fromJob ? 'ai' : 'manual', status,
        scheduledDate: date, scheduledTime: date ? ['09:00', '12:00', '18:30', '20:00'][i % 4]! : null,
        publishedAt: status === 'published' ? at(date!, 18) : null,
        postUrl: status === 'published' && i % 2 === 0 ? `https://example.com/${b.id}/post-${i}` : null,
        archivedAt: null, version: 1, createdAt: ts, updatedAt: ts,
      })
      if (fromJob) {
        items.push({ id: itemId!, jobId: spec.jobId, ordinal: i, status: 'succeeded', attempts: 1, errorCode: null, contentId: id })
        plan.push({ pillar, platform, format, date: draft.suggestedDate })
      }
    }
    for (let f = 0; f < spec.failed; f++) {
      const ord = items.length
      items.push({ id: `${spec.jobId}_i${ord}`, jobId: spec.jobId, ordinal: ord, status: 'failed', attempts: 3, errorCode: 'INVALID_JSON', contentId: null })
      plan.push({ pillar: b.profile.pillars[0]!, platform: b.profile.platforms[0]!, format: 'static', date: null })
    }
    const ts = at(addDays(today, spec.day), 14)
    db.jobs.push({
      id: spec.jobId, ownerId: demo, brandId: b.id, brandName: b.name, requestedCount: spec.requested,
      status: spec.failed ? 'partial' : 'completed', completedCount: spec.requested - spec.failed, failedCount: spec.failed, cancelledCount: 0,
      createdAt: ts, updatedAt: ts, items, idempotencyKey: `seed-${spec.jobId}`, startedAt: Date.parse(ts), plan,
      input: {
        brandId: b.id, dateFrom: addDays(today, -16), dateTo: addDays(today, 24), objective: 'engagement', campaign: '', promotion: '',
        keyDates: [], platforms: b.profile.platforms, count: spec.requested, formats: FORMATS, pillarMix: null, notes: '',
      },
    })
    if (b.id === 'b_glowlab') order('po_seed2', 20, -10)
    ledger('reserve', -spec.requested, spec.requested, spec.day, 'job', spec.jobId, `reserve:${spec.jobId}`)
    for (const it of items) {
      if (it.status === 'succeeded') ledger('consume', 0, -1, spec.day, 'item', it.id, `consume:${it.id}`)
      else ledger('release', 1, -1, spec.day, 'item', it.id, `release:${it.id}`)
    }
  }

  // ---- Task assignment showcase: Nok is designing artwork for an upcoming coffee post.
  const post = db.contents.find((c) => c.brandId === 'b_doidee' && c.scheduledDate && c.scheduledDate > addDays(today, 3))
  if (post) {
    const nokM = db.memberships.find((m) => m.brandId === 'b_doidee' && m.userId === 'u_nok')!
    const assigned = at(addDays(today, -1), 10)
    db.tasks.push({
      id: 't_seed1', brandId: 'b_doidee', contentId: post.id, type: 'design', positionKey: 'graphic_designer', assigneeMemberId: nokM.id, assignedByUserId: demo,
      dueDate: addDays(post.scheduledDate!, -2), priority: 'high', note: 'Warm tones, show the beans close-up. 1:1 for IG + 4:5 crop.', status: 'in_progress',
      reviewNote: null, completedAt: null, briefVersion: post.version, briefSnapshot: post.visualBrief, version: 2, createdAt: assigned, updatedAt: at(today, 9),
      activeKey: `${post.id}:design`,
    })
    db.taskEvents.push(
      { id: 'te_1', taskId: 't_seed1', actorId: demo, actorName: 'มิ้นท์ ครีเอเตอร์', action: 'assigned', fromStatus: null, toStatus: 'todo', note: null, createdAt: assigned },
      { id: 'te_2', taskId: 't_seed1', actorId: 'u_nok', actorName: 'Nok (Graphic)', action: 'start', fromStatus: 'todo', toStatus: 'in_progress', note: null, createdAt: at(today, 9) },
    )
  }

  db.inquiries.push({
    id: 'pi_1', ownerId: demo, reference: 'UPS-2026-0007', brandId: 'b_glowlab', contentId: null, serviceType: 'creator_collab',
    platform: 'tiktok', postUrl: null, objective: 'awareness', budgetSatang: 1500000,
    brief: 'หา micro creator สายสกินแคร์ 3–5 คน รีวิวกันแดดแบบเปิดเผยว่าเป็นงานร่วมกับแบรนด์', contactConsentAt: at(addDays(today, -6), 15),
    status: 'quoted', createdAt: at(addDays(today, -6), 15),
  })
  db.ledger.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // Re-derive running balances after sorting by time.
  let avail = 0
  for (const l of db.ledger) { avail += l.deltaAvailable; l.availableAfter = avail }
  return db
}
