import type {
  Brand, BrandInput, Content, ContentInput, ContentPatch, ContentQuery, ContentRevision, DashboardSummary,
  FeedbackInput, GenerationInput, GenerationJob, Holiday, ISODate, LedgerEntry, Paginated, PaymentOrder,
  PromotionInput, PromotionInquiry, RegisterInput, Session, User, Wallet,
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
    /** Verifies email and grants trial credits exactly once (idempotent). */
    verifyEmail(): Promise<{ granted: number; user: User }>
    forgot(email: string): Promise<void>
    logout(): Promise<void>
    me(): Promise<User>
    updateProfile(input: Partial<Pick<User, 'name' | 'locale'>>): Promise<User>
  }

  dashboard(brandId: string | null): Promise<DashboardSummary>

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
    createOrder(credits: number): Promise<PaymentOrder>
    getOrder(id: string): Promise<PaymentOrder>
    /** Sandbox only: asks the backend to emit a signed provider webhook. */
    simulateWebhook?(orderId: string, outcome: 'paid' | 'failed'): Promise<void>
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
