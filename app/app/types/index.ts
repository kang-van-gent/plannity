// Domain types mirror the data model in plannity-spec.md §16 and the AI output
// contract in §9. Public identifiers are strings (Strapi documentId / UUID).

export type ISODate = string // YYYY-MM-DD, a calendar date in Asia/Bangkok
export type ISODateTime = string // full ISO timestamp

export const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'line', 'x', 'linkedin'] as const
export type Platform = (typeof PLATFORMS)[number]

export const FORMATS = ['static', 'carousel', 'short_video', 'text'] as const
export type ContentFormat = (typeof FORMATS)[number]

export const OBJECTIVES = ['awareness', 'engagement', 'consideration', 'conversion'] as const
export type Objective = (typeof OBJECTIVES)[number]

export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const DEFAULT_PILLARS = ['Education', 'Entertainment', 'Promotion', 'Behind the scenes', 'Community', 'Inspiration'] as const

export type ContentLanguage = 'th' | 'en' | 'th-en'

export interface User {
  id: string
  email: string
  name: string
  verifiedAt: ISODateTime | null
  locale: 'th' | 'en'
  timezone: 'Asia/Bangkok'
  createdAt: ISODateTime
}

export interface BrandProfile {
  industry: string
  description: string
  products: string
  usp: string
  audience: string
  painPoints: string
  tone: string
  language: ContentLanguage
  platforms: Platform[]
  guidelines: string
  forbiddenWords: string
  competitors: string
  pillars: string[]
  ctaPreferences: string
  goals: string
}

export interface Brand {
  id: string
  name: string
  color: string
  profile: BrandProfile
  archivedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
  contentCount?: number
}

export type BrandInput = Pick<Brand, 'name' | 'color'> & { profile: BrandProfile }

/** AI output contract (spec §9). */
export interface ContentDraft {
  title: string
  concept: string
  pillar: string
  objective: Objective
  platform: Platform
  format: ContentFormat
  hook: string
  caption: string
  cta: string
  hashtags: string[]
  visualBrief: string
  videoScript: string | null
  suggestedDate: ISODate | null
  rationale: string
}

export interface Content extends ContentDraft {
  id: string
  brandId: string
  jobItemId: string | null
  source: 'ai' | 'manual'
  status: ContentStatus
  scheduledDate: ISODate | null
  scheduledTime: string | null // HH:mm local time (Asia/Bangkok)
  publishedAt: ISODateTime | null
  postUrl: string | null
  archivedAt: ISODateTime | null
  version: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type ContentInput = Partial<Omit<Content, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'jobItemId' | 'source'>> & {
  brandId: string
  title: string
}

export interface ContentPatch extends Partial<Omit<Content, 'id' | 'createdAt' | 'updatedAt' | 'jobItemId' | 'source'>> {
  /** Optimistic concurrency token (spec §17). */
  version: number
}

export interface ContentRevision {
  id: string
  contentId: string
  version: number
  reason: 'edit' | 'regenerate' | 'create'
  snapshot: ContentDraft
  createdAt: ISODateTime
}

export interface ContentQuery {
  brandId?: string | null
  search?: string
  platform?: Platform | ''
  pillar?: string
  status?: ContentStatus | 'unscheduled' | ''
  from?: ISODate | ''
  to?: ISODate | ''
  sort?: 'updated' | 'date'
  includeArchived?: boolean
  page?: number
  pageSize?: number
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; pageSize: number; total: number; pageCount: number }
}

export interface GenerationInput {
  brandId: string
  dateFrom: ISODate
  dateTo: ISODate
  objective: Objective
  campaign: string
  promotion: string
  keyDates: string[]
  platforms: Platform[]
  count: number
  formats: ContentFormat[]
  pillarMix: Record<string, number> | null
  notes: string
}

export type JobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
export type ItemStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface GenerationItem {
  id: string
  jobId: string
  ordinal: number
  status: ItemStatus
  attempts: number
  errorCode: string | null
  contentId: string | null
}

export interface GenerationJob {
  id: string
  brandId: string
  brandName: string
  input: GenerationInput
  requestedCount: number
  status: JobStatus
  completedCount: number
  failedCount: number
  cancelledCount: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  items: GenerationItem[]
}

export interface Wallet {
  available: number
  reserved: number
  creditPriceSatang: number
}

export type LedgerType = 'trial_grant' | 'purchase' | 'reserve' | 'consume' | 'release' | 'adjustment'

export interface LedgerEntry {
  id: string
  type: LedgerType
  deltaAvailable: number
  deltaReserved: number
  availableAfter: number
  refType: 'job' | 'item' | 'payment' | null
  refId: string | null
  createdAt: ISODateTime
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

export interface PaymentOrder {
  id: string
  credits: number
  amountSatang: number
  currency: 'THB'
  status: PaymentStatus
  provider: 'sandbox' | string
  providerRef: string
  createdAt: ISODateTime
  paidAt: ISODateTime | null
}

export interface Holiday {
  id: string
  date: ISODate
  title: { th: string; en: string }
  kind: 'holiday' | 'observance' | 'shopping' | 'custom'
  country: 'TH'
  source: string
  year: number
  verified: boolean
  custom?: boolean
}

export type PromotionService = 'creator_collab' | 'community_promo' | 'campaign_consult'
export type InquiryStatus = 'submitted' | 'contacted' | 'quoted' | 'closed'

export interface PromotionInquiry {
  id: string
  reference: string
  brandId: string
  contentId: string | null
  serviceType: PromotionService
  platform: Platform
  postUrl: string | null
  objective: Objective
  budgetSatang: number
  brief: string
  contactConsentAt: ISODateTime
  status: InquiryStatus
  createdAt: ISODateTime
}

export type PromotionInput = Omit<PromotionInquiry, 'id' | 'reference' | 'status' | 'createdAt' | 'contactConsentAt'> & {
  consent: boolean
}

export interface FeedbackInput {
  contentId: string | null
  rating: number
  comment: string
}

export interface DashboardSummary {
  wallet: Wallet
  brandCount: number
  monthCount: number
  statusCounts: Record<ContentStatus, number>
  upcoming: Content[]
  backlog: Content[]
  recentJobs: GenerationJob[]
}

export interface Session {
  user: User
  token: string
}

export type SocialProvider = 'google' | 'facebook' | 'apple'

export interface RegisterInput {
  name: string
  email: string
  password: string
  acceptTerms: boolean
}

/** Editable string-based form state for content (dates/times as input values). */
export interface ContentFormModel {
  brandId: string
  title: string
  concept: string
  pillar: string
  objective: Objective
  platform: Platform
  format: ContentFormat
  hook: string
  caption: string
  cta: string
  hashtags: string
  visualBrief: string
  videoScript: string
  scheduledDate: string
  scheduledTime: string
}
