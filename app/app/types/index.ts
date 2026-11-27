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
  /** The current user's role in this brand (Team Workspace) — effective: read-only while collaboration is suspended. */
  myRole: BrandRole
  /** The current user's position tags in this brand (labels only). */
  myPositionKeys: PositionKey[]
  /** Plan of the account that owns (pays for) this brand, and what it allows here. */
  planKey: PlanKey
  features: FeatureFlags
  /** True when the current user is the paying owner of this brand. */
  isBillingOwner: boolean
  /** The owner's plan no longer includes collaboration, so this member is read-only for now. */
  suspended: boolean
  /** No cover (its brand slot or Studio lapsed): read-only for everyone until renewed. */
  locked: boolean
  /** How the brand is paid for, and until when (null = free / no end). */
  coverKind: BrandCoverKind
  coveredUntil: ISODateTime | null
}

/** included = one of the 2 free brands · plan = covered by Studio · slot = its own monthly slot · none = locked */
export type BrandCoverKind = 'included' | 'plan' | 'slot' | 'none'
export interface BrandCover {
  id: string
  name: string
  color: string
  archivedAt: ISODateTime | null
  createdAt: ISODateTime | null
  kind: BrandCoverKind
  /** When cover ends (Studio end or the slot's paid-until; null for free brands). */
  until: ISODateTime | null
  /** The brand's own slot cover — keeps counting after Studio ends. */
  paidUntil: ISODateTime | null
  locked: boolean
}

// ---- Plans & entitlements (pricing.md v0.2) ---------------------------------
export type PlanKey = 'solo' | 'team' | 'studio'
export interface FeatureFlags {
  collaboration: boolean
  memberPositions: boolean
  taskAssignment: boolean
  taskReview: boolean
  postPreview: boolean
  creativeBrief: boolean
}
export interface PlanConfig { key: PlanKey; monthlySatang: number; includedBrands: number | null; maxMembers: number; collaboration: boolean }
export interface PricingConfig {
  currency: 'THB'
  plans: Record<PlanKey, PlanConfig>
  additionalBrandMonthlySatang: number
  aiContentCreditSatang: number
  aiBriefCreditSatang: number
}
/** The signed-in account's plan, limits and usage. */
export interface Entitlements {
  planKey: PlanKey
  /** End of the paid plan's current coverage (null on Solo). */
  periodEnd: ISODateTime | null
  brandAddons: number
  /** Owned-brand capacity; null = unlimited (Studio). */
  brandLimit: number | null
  brandsOwned: number
  seatLimit: number
  seatsUsed: number
  features: FeatureFlags
  /** Last paid plan and its end (offered as "renew" after it lapses). */
  lastPlanKey: Exclude<PlanKey, 'solo'> | null
  lastPlanEnd: ISODateTime | null
  /** Paid slots not yet used by a brand. */
  freeSlots: number
  /** Every owned brand and its cover, oldest first. */
  brands: BrandCover[]
  /** Paid months that start later (renewals / downgrades at period end). */
  upcoming: { planKey: PlanKey; periodStart: ISODateTime; periodEnd: ISODateTime }[]
  pricing: PricingConfig
}

// ---- Member positions --------------------------------------------------------
export const POSITION_KEYS = [
  'content_creator', 'graphic_designer', 'video_editor', 'marketing_manager', 'project_manager',
  'stock_manager', 'social_media', 'photographer', 'client',
] as const
export type PositionKey = (typeof POSITION_KEYS)[number]

// ---- Tasks -------------------------------------------------------------------
export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'changes_requested', 'completed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskAction = 'start' | 'submit' | 'approve' | 'request_changes' | 'cancel'
export type TaskPriority = 'normal' | 'high'
export interface TaskEvent { id: string; action: TaskAction | 'assigned' | 'reassigned' | 'updated'; fromStatus: TaskStatus | null; toStatus: TaskStatus | null; actorName: string; note: string | null; createdAt: ISODateTime }
export interface Task {
  id: string
  brandId: string
  brandName: string
  brandColor: string
  contentId: string
  contentTitle: string
  contentScheduledDate: ISODate | null
  /** Images on the post (the assignee's final artwork lives there). */
  imageCount: number
  type: 'design'
  positionKey: PositionKey
  /** null when nobody is assigned; `active: false` when they were removed from the brand (needs reassignment). */
  assignee: { memberId: string; userId: string; name: string; positionKeys: PositionKey[]; active: boolean } | null
  assignedByName: string
  dueDate: ISODate | null
  priority: TaskPriority
  note: string | null
  status: TaskStatus
  reviewNote: string | null
  completedAt: ISODateTime | null
  /** Post version and visual brief when assigned. */
  briefVersion: number | null
  briefSnapshot: string | null
  /** The brief was edited after assignment. */
  briefChanged: boolean
  version: number
  createdAt: ISODateTime
  updatedAt: ISODateTime
  isMine: boolean
  /** What the current viewer may do (UX; the server re-checks): work on it, review it, or reassign/cancel it. */
  caps: { assignee: boolean; reviewer: boolean; manager: boolean }
  /** The brand owner's plan no longer includes tasks: read-only. */
  suspended: boolean
  /** History — on the per-post endpoint only. */
  events?: TaskEvent[]
}
export interface TaskInput { positionKey: PositionKey; assigneeId: string; dueDate: ISODate | null; priority: TaskPriority; note: string }

// ---- Team Workspace --------------------------------------------------------
export type BrandRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

export interface BrandMember {
  id: string
  userId: string
  name: string
  email: string
  role: BrandRole
  positionKeys: PositionKey[]
  joinedAt: ISODateTime
  isYou: boolean
}

export interface BrandInvitation {
  id: string
  email: string
  role: BrandRole
  positionKeys: PositionKey[]
  status: InvitationStatus
  invitedByName: string
  createdAt: ISODateTime
  expiresAt: ISODateTime
}

export interface TeamSummary {
  brandId: string
  /** The paying account's seat pool (unique people across all its brands, owner included). */
  seatLimit: number
  seatsUsed: number
  planKey: PlanKey
  features: FeatureFlags
  /** The current user pays for this brand (can upgrade). */
  isBillingOwner: boolean
  members: BrandMember[]
  /** Pending invitations only. */
  invitations: BrandInvitation[]
}

export interface InviteResult {
  invitation: BrandInvitation
  /** Shown to the inviter so they can share it if email isn't configured. */
  inviteUrl: string
  emailSent: boolean
}

/** Public view of an invitation link (before/after sign-in). */
export interface InvitationPreview {
  status: InvitationStatus
  brandName: string
  brandColor: string
  inviterName: string
  email: string
  role: BrandRole
  positionKeys?: PositionKey[]
  expiresAt: ISODateTime
}

/** A pending invitation addressed to the signed-in user's email. */
export interface MyInvitation {
  id: string
  brandId: string
  brandName: string
  brandColor: string
  inviterName: string
  role: BrandRole
  expiresAt: ISODateTime
}

// ---- Activity log ------------------------------------------------------------
export type ActivityEntityType = 'brand' | 'content' | 'member'
export interface ActivityChange { field: string; from: unknown; to: unknown }
/** Append-only "who did what, when" entry, written by the server. */
export interface ActivityEntry {
  id: string
  brandId: string
  actorId: string | null
  /** Name at the time of the action (stays readable after renames/removal). */
  actorName: string
  /** e.g. content.updated, content.status_changed, brand.archived, member.role_changed */
  action: string
  entityType: ActivityEntityType
  entityId: string
  /** Content title / brand name / member at the time. */
  entityTitle: string | null
  changes: ActivityChange[]
  createdAt: ISODateTime
}

// ---- Post images -----------------------------------------------------------
export interface ContentImage {
  id: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  /** Full-size file (preview/download). */
  url: string
  /** Small version for grids; falls back to url. */
  thumbnailUrl: string
  createdAt: ISODateTime
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
  /** Number of attached post images (lists/calendar: no image files are loaded). */
  imageCount?: number
  /** Attached images in order — only on the single-content endpoint. */
  images?: ContentImage[]
  /** Where the post goes: one per platform (lists, calendar and the post itself). */
  destinations?: PublishDestination[]
}

// ---- Multi-platform content (plannity-context-social-publishing.md) -------
/** Manual publishing uses draft → published; the rest belong to automatic publishing (later). */
export const DESTINATION_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'reconciling', 'cancelled', 'paused'] as const
export type DestinationStatus = (typeof DESTINATION_STATUSES)[number]

export interface PublishDestination {
  id: string
  contentId: string
  platform: Platform
  /** null = the post's caption; '' = deliberately no caption on this platform. */
  captionOverride: string | null
  /** null = all of the post's images in order; otherwise these image ids, in this order. */
  mediaOverrideIds: string[] | null
  /** UTC; null = the post's date and time. */
  scheduledAt: ISODateTime | null
  timezone: string
  mode: 'manual' | 'auto'
  status: DestinationStatus
  revision: number
  externalPostUrl: string | null
  publishedAt: ISODateTime | null
  lastErrorCode: string | null
  updatedAt: ISODateTime
}

export type DestinationInput = Pick<PublishDestination, 'platform'> & Partial<Pick<PublishDestination, 'captionOverride' | 'mediaOverrideIds' | 'scheduledAt' | 'timezone'>>

/** Content fields that move when a destination change changes the whole post (status, version…). */
export type ContentStatePatch = Pick<Content, 'status' | 'version' | 'publishedAt' | 'postUrl' | 'platform'>

export interface DestinationResult<T> {
  data: T
  /** Present when the post itself changed (e.g. every platform is now published). */
  content: ContentStatePatch | null
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

/**
 * pending = waiting for the transfer · awaiting_review = slip uploaded, being checked
 * paid = verified, credits added · rejected = slip didn't match (upload a new one)
 */
export type PaymentStatus = 'pending' | 'verifying' | 'awaiting_review' | 'paid' | 'rejected' | 'failed' | 'expired' | 'refunded'
/** Why the last slip check ended the way it did (Slip2Go), shown to the customer. */
export type SlipResult = 'paid' | 'receiver_mismatch' | 'amount_mismatch' | 'date_mismatch' | 'not_found' | 'invalid_slip' | 'duplicate' | 'unavailable' | 'unclear' | 'manual'

export type OrderKind = 'credits' | 'plan' | 'brand_addon' | 'renewal'
/** What to buy: AI credits, a plan month, new brand slots, or a renewal (plan month + a month for each listed brand) in one payment. */
export type OrderInput = { kind: 'credits'; credits: number } | { kind: 'plan'; planKey: Exclude<PlanKey, 'solo'> } | { kind: 'brand_addon'; quantity: number }
  | { kind: 'renewal'; planKey: Exclude<PlanKey, 'solo'> | null; brandIds: string[] }

/** Mobile payment hand-off: a short-lived link (shown as a QR on the computer) that opens one order on a phone, no sign-in. */
export interface PaymentHandoff {
  token: string
  url: string
  expiresAt: ISODateTime
}

export interface PaymentOrder {
  id: string
  kind: OrderKind
  credits: number
  planKey: Exclude<PlanKey, 'solo'> | null
  quantity: number | null
  /** kind = renewal: brands renewed for a month each. */
  brandIds?: string[]
  amountSatang: number
  currency: 'THB'
  status: PaymentStatus
  provider: 'promptpay' | 'sandbox' | string
  providerRef: string
  /** Short code to put in the transfer note, e.g. PLN-7KQ3XZ. */
  reference: string
  /** Who to pay (from server config, never from the client). */
  payee: { promptpayId: string; name: string } | null
  slipUploadedAt: ISODateTime | null
  /** Why a slip was rejected (shown to the user). */
  reviewNote: string | null
  /** Pending orders stop accepting payment after this. */
  expiresAt: ISODateTime | null
  /** Last slip check result (null before any slip). */
  resultCode?: SlipResult | null
  /** Paid and what was bought has been delivered. Paid but not yet fulfilled = activating. */
  fulfilled?: boolean
  /** PromptPay payload generated by Slip2Go (server-checked). Null → build the QR locally from payee + amount. */
  qrPayload?: string | null
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
