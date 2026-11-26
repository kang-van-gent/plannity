import type {
  Brand, BrandInput, Content, ContentInput, ContentPatch, ContentQuery, ContentRevision, DashboardSummary,
  FeedbackInput, GenerationInput, GenerationJob, Holiday, ISODate, LedgerEntry, Paginated, PaymentOrder,
  PromotionInput, PromotionInquiry, RegisterInput, Session, SocialProvider, User, Wallet,
  BrandRole, ContentImage, InvitationPreview, InviteResult, MyInvitation, TeamSummary, BrandMember, ActivityEntityType, ActivityEntry,
  Entitlements, OrderInput, PositionKey, Task, TaskAction, TaskInput,
} from '~/types'

/**
 * The single seam between UI and backend. Pages only talk to this interface,
 * so swapping the in-browser mock for Strapi is a config change
 * (NUXT_PUBLIC_DATA_SOURCE=strapi), not a rewrite.
 * Endpoint mapping lives in ./strapi.ts and follows spec §17.
 */
export interface DataSource {
  readonly kind: 'mock' | 'strapi'

  auth: {
    login(email: string, password: string): Promise<Session>
    register(input: RegisterInput): Promise<Session>
    /** Social sign-in. Real backends return a URL to send the browser to; the mock signs in directly. */
    social(provider: SocialProvider, next?: string): Promise<Session | { redirect: string }>
    /** Verifies email and grants trial credits exactly once (idempotent). */
    verifyEmail(): Promise<{ granted: number; user: User }>
    forgot(email: string): Promise<void>
    logout(): Promise<void>
    me(): Promise<User>
    updateProfile(input: Partial<Pick<User, 'name' | 'locale'>>): Promise<User>
  }

  dashboard(brandId: string | null): Promise<DashboardSummary>

  /** Team Workspace: brand-scoped members and invitations. Backend enforces every rule. */
  team: {
    get(brandId: string): Promise<TeamSummary>
    invite(brandId: string, input: { email: string; role: BrandRole; positionKeys?: PositionKey[] }): Promise<InviteResult>
    resend(brandId: string, invitationId: string): Promise<InviteResult>
    cancel(brandId: string, invitationId: string): Promise<void>
    updateRole(brandId: string, memberId: string, role: BrandRole): Promise<BrandMember>
    /** Position tags only — never changes the role, seats or assignments. */
    updatePositions(brandId: string, memberId: string, positionKeys: PositionKey[]): Promise<BrandMember>
    remove(brandId: string, memberId: string): Promise<void>
    leave(brandId: string): Promise<void>
  }

  invitations: {
    /** Public: what an invitation link is for (works signed out). */
    preview(token: string): Promise<InvitationPreview>
    accept(token: string): Promise<{ brandId: string }>
    decline(token: string): Promise<void>
    /** Pending invitations addressed to the signed-in user's email. */
    mine(): Promise<MyInvitation[]>
    acceptMine(id: string): Promise<{ brandId: string }>
    declineMine(id: string): Promise<void>
  }

  /** Who did what, when, in a brand (any member may read; only the server writes). */
  activity: {
    list(brandId: string, q?: { entityType?: ActivityEntityType; entityId?: string; page?: number; pageSize?: number }): Promise<Paginated<ActivityEntry>>
  }

  /** Post images. Mutations need content-edit permission; returns the content's full, ordered list. */
  contentImages: {
    upload(contentId: string, files: File[], onProgress?: (pct: number) => void): Promise<ContentImage[]>
    replace(contentId: string, imageId: string, file: File): Promise<ContentImage[]>
    remove(contentId: string, imageId: string): Promise<ContentImage[]>
    reorder(contentId: string, imageIds: string[]): Promise<ContentImage[]>
    download(contentId: string, imageId: string): Promise<Blob>
  }

  brands: {
    list(opts?: { includeArchived?: boolean }): Promise<Brand[]>
    get(id: string): Promise<Brand>
    create(input: BrandInput): Promise<Brand>
    update(id: string, input: Partial<BrandInput>): Promise<Brand>
    archive(id: string): Promise<Brand>
    restore(id: string): Promise<Brand>
  }

  contents: {
    list(query: ContentQuery): Promise<Paginated<Content>>
    get(id: string): Promise<Content>
    create(input: ContentInput): Promise<Content>
    update(id: string, patch: ContentPatch): Promise<Content>
    archive(id: string): Promise<Content>
    duplicate(id: string): Promise<Content>
    revisions(id: string): Promise<ContentRevision[]>
    /** Paid: creates a 1-credit job and a new revision; the original is kept. */
    regenerate(id: string, idempotencyKey: string): Promise<Content>
    exportCsv(query: ContentQuery): Promise<string>
  }

  calendar: {
    /** Scheduled items in [from, to]; plus the unscheduled tray unless `includeUnscheduled` is false. */
    range(from: ISODate, to: ISODate, brandId: string | null, opts?: { includeUnscheduled?: boolean }): Promise<Content[]>
    holidays(from: ISODate, to: ISODate): Promise<Holiday[]>
    addHoliday(input: Pick<Holiday, 'date' | 'title'>): Promise<Holiday>
    removeHoliday(id: string): Promise<void>
  }

  generation: {
    create(input: GenerationInput, idempotencyKey: string): Promise<GenerationJob>
    get(id: string): Promise<GenerationJob>
    list(brandId: string | null): Promise<GenerationJob[]>
    cancel(id: string): Promise<GenerationJob>
  }

  credits: {
    balance(): Promise<Wallet>
    ledger(): Promise<LedgerEntry[]>
    orders(): Promise<PaymentOrder[]>
    /** A number buys AI credits (back-compat); plans and brand add-ons pass an OrderInput. */
    createOrder(input: number | OrderInput): Promise<PaymentOrder>
    getOrder(id: string): Promise<PaymentOrder>
    /** Attach the transfer slip to a PromptPay order → status awaiting_review. */
    uploadSlip(orderId: string, file: File): Promise<PaymentOrder>
    /** Sandbox only: asks the backend to emit a signed provider webhook. */
    simulateWebhook?(orderId: string, outcome: 'paid' | 'failed'): Promise<void>
    /** Demo only: stands in for the slip check (staff review today, Slip2Go later). */
    simulateReview?(orderId: string, outcome: 'paid' | 'rejected'): Promise<void>
  }

  /** Plans & brand add-ons (pricing.md). Purchases use credits.createOrder / uploadSlip like credit top-ups. */
  billing: {
    me(): Promise<Entitlements>
    /** Demo only: stands in for a plan period ending (to try the downgrade/suspension behaviour). */
    simulateExpire?(): Promise<void>
  }

  /** Task assignment & My Tasks. Every call re-checks membership, role and the brand owner's plan. */
  tasks: {
    forContent(contentId: string): Promise<Task[]>
    mine(): Promise<Task[]>
    forBrand(brandId: string): Promise<Task[]>
    create(contentId: string, input: TaskInput): Promise<Task>
    /** Reassign (restarts at To do) or change due date / priority / note. */
    updateAssignment(taskId: string, input: Partial<TaskInput> & { version: number }): Promise<Task>
    transition(taskId: string, action: TaskAction, input: { version: number; note?: string }): Promise<Task>
  }

  promotions: {
    list(): Promise<PromotionInquiry[]>
    create(input: PromotionInput): Promise<PromotionInquiry>
  }

  feedback: {
    submit(input: FeedbackInput): Promise<void>
  }
}

export type ApiErrorCode =
  | 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'
  | 'INSUFFICIENT_CREDITS' | 'VERSION_CONFLICT' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'NETWORK' | 'UNKNOWN'
  // Team Workspace
  | 'SEAT_LIMIT' | 'PLAN_REQUIRED' | 'BRAND_LIMIT' | 'ALREADY_MEMBER' | 'DUPLICATE_INVITE' | 'INVITE_EXPIRED' | 'INVITE_INVALID' | 'EMAIL_MISMATCH' | 'LAST_OWNER'
  // Post images
  | 'FILE_TYPE' | 'FILE_TOO_LARGE' | 'TOO_MANY_IMAGES' | 'STORAGE'

/** Mirrors the error envelope in spec §17: {error:{code,message,fieldErrors,requestId}}. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public fieldErrors: Record<string, string> = {},
    public requestId: string = Math.random().toString(36).slice(2, 10),
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ApiError')
}
