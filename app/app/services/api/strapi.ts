// Strapi 5 adapter. All calls go through the Nuxt BFF (server/api/bff) so the
// Strapi JWT lives in an HttpOnly cookie and never reaches browser JS
// (spec §17). Standard collection routes use Strapi's REST conventions;
// business operations (credits, generation, payments, export) call custom
// Strapi controllers listed in README → "Strapi endpoints".

import type {
  Brand, Content, ContentQuery, ContentRevision, DashboardSummary, GenerationJob, Holiday, LedgerEntry,
  PaymentOrder, PromotionInquiry, Session, User, Wallet,
} from '~/types'
import { ApiError, type ApiErrorCode, type DataSource } from './contract'

type Row = Record<string, unknown> & { id?: number | string; documentId?: string }
type Query = Record<string, string | number | boolean | undefined | null>

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: 'INVALID_INPUT', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'RATE_LIMITED', 503: 'PROVIDER_UNAVAILABLE',
}

interface StrapiErrorBody {
  error?: {
    status?: number; name?: string; code?: ApiErrorCode; message?: string; requestId?: string
    fieldErrors?: Record<string, string>
    details?: { errors?: { path?: string[]; message?: string }[] }
  }
}

function toApiError(e: unknown): ApiError {
  const err = e as { status?: number; statusCode?: number; data?: StrapiErrorBody; message?: string }
  const status = err.status ?? err.statusCode ?? 0
  const body = err.data?.error
  if (!status) return new ApiError(0, 'NETWORK', 'Network error — check your connection')
  const fieldErrors: Record<string, string> = { ...(body?.fieldErrors ?? {}) }
  for (const fe of body?.details?.errors ?? []) if (fe.path?.length) fieldErrors[fe.path.join('.')] = fe.message ?? 'invalid'
  return new ApiError(status, body?.code ?? CODE_BY_STATUS[status] ?? 'UNKNOWN', body?.message ?? err.message ?? 'Request failed', fieldErrors, body?.requestId)
}

/** Strapi 5 returns flat rows with `documentId`; expose it as our public `id`. */
function norm<T>(row: Row | null | undefined): T {
  if (!row) return row as T
  const out: Row = { ...row, id: row.documentId ?? row.id }
  delete out.documentId
  const brand = row.brand as Row | undefined
  if (brand && typeof brand === 'object') out.brandId = brand.documentId ?? brand.id
  // Strapi reserves `publishedAt`; content stores the user-confirmed publish time as `postedAt`.
  if ('postedAt' in row) { out.publishedAt = row.postedAt; delete out.postedAt }
  return out as T
}

/** App field names → Strapi field names for content writes. */
function toStrapiContent<T extends { publishedAt?: string | null; brandId?: string }>(input: T): Record<string, unknown> {
  const { publishedAt, brandId, ...rest } = input
  return { ...rest, ...(publishedAt !== undefined ? { postedAt: publishedAt } : {}), ...(brandId ? { brand: brandId } : {}) }
}

/** Builds Strapi's bracketed query string, e.g. filters[status][$eq]=draft. */
function qs(q: Query): string {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(String(v))}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

function contentFilters(q: ContentQuery): Query {
  const f: Query = {
    'populate[brand][fields][0]': 'documentId',
    'sort[0]': q.sort === 'date' ? 'scheduledDate:asc' : 'updatedAt:desc',
    'pagination[page]': q.page ?? 1,
    'pagination[pageSize]': Math.min(100, q.pageSize ?? 20),
  }
  if (!q.includeArchived) f['filters[archivedAt][$null]'] = true
  if (q.brandId) f['filters[brand][documentId][$eq]'] = q.brandId
  if (q.search) {
    f['filters[$or][0][title][$containsi]'] = q.search
    f['filters[$or][1][caption][$containsi]'] = q.search
  }
  if (q.platform) f['filters[platform][$eq]'] = q.platform
  if (q.pillar) f['filters[pillar][$eq]'] = q.pillar
  if (q.status === 'unscheduled') f['filters[scheduledDate][$null]'] = true
  else if (q.status) f['filters[status][$eq]'] = q.status
  if (q.from) f['filters[scheduledDate][$gte]'] = q.from
  if (q.to) f['filters[scheduledDate][$lte]'] = q.to
  return f
}

export function createStrapiSource(): DataSource {
  const BFF = '/api/bff'

  async function call<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
    try {
      return await $fetch<T>(path, {
        method: opts.method ?? 'GET',
        body: opts.body as Record<string, unknown> | undefined,
        // Custom header + SameSite cookie = CSRF mitigation for cookie-authenticated mutations.
        headers: { 'X-Requested-With': 'plannity', ...opts.headers },
        responseType: opts.raw ? 'text' : 'json',
      })
    } catch (e) {
      throw toApiError(e)
    }
  }
  const one = async <T>(path: string, opts?: Parameters<typeof call>[1]) => norm<T>((await call<{ data: Row }>(path, opts)).data)
  const many = async <T>(path: string) => (await call<{ data: Row[] }>(path)).data.map((r) => norm<T>(r))

  return {
    kind: 'strapi',

    auth: {
      login: (email, password) => call<Session>('/api/auth/login', { method: 'POST', body: { email, password } }),
      register: (input) => call<Session>('/api/auth/register', { method: 'POST', body: input }),
      verifyEmail: () => call<{ granted: number; user: User }>(`${BFF}/auth/verify`, { method: 'POST' }),
      forgot: (email) => call<void>(`${BFF}/auth/forgot-password`, { method: 'POST', body: { email } }),
      logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
      me: () => call<User>(`${BFF}/users/me`),
      updateProfile: (input) => call<User>(`${BFF}/me`, { method: 'PUT', body: input }),
    },

    dashboard: (brandId) => call<{ data: DashboardSummary }>(`${BFF}/dashboard${qs({ brandId })}`).then((r) => r.data),

    brands: {
      list: (opts) => many<Brand>(`${BFF}/brands${qs({ 'sort[0]': 'createdAt:asc', 'pagination[pageSize]': 100, ...(opts?.includeArchived ? {} : { 'filters[archivedAt][$null]': true }) })}`),
      get: (id) => one<Brand>(`${BFF}/brands/${id}`),
      create: (input) => one<Brand>(`${BFF}/brands`, { method: 'POST', body: { data: input } }),
      update: (id, input) => one<Brand>(`${BFF}/brands/${id}`, { method: 'PUT', body: { data: input } }),
      archive: (id) => one<Brand>(`${BFF}/brands/${id}`, { method: 'PUT', body: { data: { archivedAt: new Date().toISOString() } } }),
      restore: (id) => one<Brand>(`${BFF}/brands/${id}`, { method: 'PUT', body: { data: { archivedAt: null } } }),
    },

    contents: {
      async list(q) {
        const r = await call<{ data: Row[]; meta: { pagination: { page: number; pageSize: number; total: number; pageCount: number } } }>(`${BFF}/contents${qs(contentFilters(q))}`)
        return { data: r.data.map((x) => norm<Content>(x)), meta: r.meta.pagination }
      },
      get: (id) => one<Content>(`${BFF}/contents/${id}${qs({ 'populate[brand][fields][0]': 'documentId' })}`),
      create: (input) => one<Content>(`${BFF}/contents`, { method: 'POST', body: { data: toStrapiContent(input) } }),
      update: (id, patch) => one<Content>(`${BFF}/contents/${id}`, { method: 'PUT', body: { data: toStrapiContent(patch) } }),
      async archive(id) {
        const current = await one<Content>(`${BFF}/contents/${id}`)
        return one<Content>(`${BFF}/contents/${id}`, { method: 'PUT', body: { data: { archivedAt: new Date().toISOString(), version: current.version } } })
      },
      async duplicate(id) {
        // Manual duplicates are free, so this composes core routes.
        const src = await one<Content>(`${BFF}/contents/${id}${qs({ 'populate[brand][fields][0]': 'documentId' })}`)
        const { id: _id, createdAt: _c, updatedAt: _u, version: _v, jobItemId: _j, ...rest } = src
        return one<Content>(`${BFF}/contents`, { method: 'POST', body: { data: toStrapiContent({ ...rest, title: `${src.title} (copy)`, source: 'manual', status: 'draft', scheduledDate: null, scheduledTime: null, publishedAt: null, postUrl: null }) } })
      },
      revisions: (id) => many<ContentRevision>(`${BFF}/content-revisions${qs({ 'filters[content][documentId][$eq]': id, 'sort[0]': 'version:desc', 'pagination[pageSize]': 100 })}`),
      regenerate: (id, key) => one<Content>(`${BFF}/contents/${id}/regenerate`, { method: 'POST', headers: { 'Idempotency-Key': key } }),
      exportCsv: (q) => call<string>(`${BFF}/contents/export${qs(contentFilters({ ...q, pageSize: 100 }))}`, { raw: true }),
    },

    calendar: {
      // Scheduled items in range plus (by default) the unscheduled tray (scheduledDate = null).
      // The calendar asks for the tray once and then only for scheduled items as you navigate.
      range: (from, to, brandId, opts = {}) => many<Content>(`${BFF}/contents${qs({
        'populate[brand][fields][0]': 'documentId', 'pagination[pageSize]': 100, 'filters[archivedAt][$null]': true,
        ...(brandId ? { 'filters[brand][documentId][$eq]': brandId } : {}),
        ...(opts.includeUnscheduled === false
          ? { 'filters[scheduledDate][$gte]': from, 'filters[scheduledDate][$lte]': to }
          : {
              'filters[$or][0][scheduledDate][$null]': true,
              'filters[$or][1][$and][0][scheduledDate][$gte]': from,
              'filters[$or][1][$and][1][scheduledDate][$lte]': to,
            }),
      })}`),
      holidays: (from, to) => many<Holiday>(`${BFF}/holidays${qs({ 'filters[date][$gte]': from, 'filters[date][$lte]': to, 'pagination[pageSize]': 100 })}`),
      addHoliday: (input) => one<Holiday>(`${BFF}/holidays`, { method: 'POST', body: { data: input } }),
      removeHoliday: (id) => call<void>(`${BFF}/holidays/${id}`, { method: 'DELETE' }),
    },

    generation: {
      create: (input, key) => one<GenerationJob>(`${BFF}/generation/jobs`, { method: 'POST', body: { data: input }, headers: { 'Idempotency-Key': key } }),
      get: (id) => one<GenerationJob>(`${BFF}/generation/jobs/${id}`),
      list: (brandId) => many<GenerationJob>(`${BFF}/generation/jobs${qs({ brandId })}`),
      cancel: (id) => one<GenerationJob>(`${BFF}/generation/jobs/${id}/cancel`, { method: 'POST' }),
    },

    credits: {
      balance: () => call<{ data: Wallet }>(`${BFF}/credits/balance`).then((r) => r.data),
      ledger: () => many<LedgerEntry>(`${BFF}/credits/ledger`),
      orders: () => many<PaymentOrder>(`${BFF}/payments/orders`),
      createOrder: (credits) => one<PaymentOrder>(`${BFF}/payments/orders`, { method: 'POST', body: { data: { credits } } }),
      getOrder: (id) => one<PaymentOrder>(`${BFF}/payments/orders/${id}`),
      // Only available while the backend runs the sandbox payment provider.
      simulateWebhook: (orderId, outcome) => call<void>(`${BFF}/payments/sandbox/${orderId}/${outcome}`, { method: 'POST' }),
    },

    promotions: {
      list: () => many<PromotionInquiry>(`${BFF}/promotion-inquiries`),
      create: ({ brandId, contentId, ...rest }) => one<PromotionInquiry>(`${BFF}/promotion-inquiries`, { method: 'POST', body: { data: { ...rest, brand: brandId, content: contentId } } }),
    },

    feedback: {
      submit: ({ contentId, ...rest }) => call<void>(`${BFF}/feedbacks`, { method: 'POST', body: { data: { ...rest, content: contentId } } }),
    },
  }
}
