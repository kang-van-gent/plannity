// Strapi 5 adapter. All calls go through the Nuxt BFF (server/api/bff) so the
// Strapi JWT lives in an HttpOnly cookie and never reaches browser JS
// (spec §17). Standard collection routes use Strapi's REST conventions;
// business operations (credits, generation, payments, export) call custom
// Strapi controllers listed in README → "Strapi endpoints".

import type { ActivityEntry, Brand, BrandMember, Content, ContentImage, ContentQuery, ContentRevision, DashboardSummary, Entitlements, GenerationJob, Holiday, InvitationPreview, InviteResult, LedgerEntry, MyInvitation, PaymentHandoff, PaymentOrder, PromotionInquiry, Session, Task, TeamSummary, User, Wallet, ContentStatePatch, PublishDestination, MetaPageChoice, SocialConnection, SocialSettings, SocialTestResult, AutopostInfo, TikTokCreator, PublishOutcome } from '~/types'
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
  const err = e as { status?: number; statusCode?: number; data?: StrapiErrorBody & { data?: StrapiErrorBody }; message?: string }
  const status = err.status ?? err.statusCode ?? 0
  // Strapi errors (through the BFF proxy) arrive as { error: {...} }; errors thrown by
  // the app's own server routes (login, register, password…) are wrapped by h3 as
  // { error: true, data: { error: {...} } }.
  const top = err.data?.error
  const body = top && typeof top === 'object' ? top : (typeof err.data?.data?.error === 'object' ? err.data.data.error : undefined)
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
  // Post images: lists populate ids only (count), the single-content call populates the files.
  if (Array.isArray(row.images)) {
    const imgs = row.images as Row[]
    out.imageCount = imgs.length
    out.images = imgs.every((i) => typeof i.url === 'string') ? imgs.map(toImage) : undefined
  }
  return out as T
}

let mediaBase = ''
const absUrl = (u: unknown) => (typeof u === 'string' && u.startsWith('/') ? `${mediaBase}${u}` : String(u ?? ''))
function toImage(f: Row): ContentImage {
  const formats = (f.formats ?? {}) as Record<string, { url?: string } | undefined>
  return {
    id: String(f.id), filename: String(f.name ?? f.filename ?? 'image'), mimeType: String(f.mime ?? f.mimeType ?? ''),
    size: typeof f.size === 'number' ? (f.mime ? Math.round(f.size * 1024) : f.size) : 0, // Strapi media size is in KB
    width: (f.width as number) ?? null, height: (f.height as number) ?? null,
    url: absUrl(f.url), thumbnailUrl: absUrl(f.thumbnailUrl ?? formats.thumbnail?.url ?? formats.small?.url ?? f.url), createdAt: String(f.createdAt ?? ''),
  }
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
    'populate[images][fields][0]': 'id', // count only — lists never load image files
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
  if (q.platform) f.platform = q.platform // any of the post's platforms (resolved by the server)
  if (q.pillar) f['filters[pillar][$eq]'] = q.pillar
  if (q.status === 'unscheduled') f['filters[scheduledDate][$null]'] = true
  else if (q.status) f['filters[status][$eq]'] = q.status
  if (q.from) f['filters[scheduledDate][$gte]'] = q.from
  if (q.to) f['filters[scheduledDate][$lte]'] = q.to
  return f
}

export function createStrapiSource(opts0: { mediaBaseUrl?: string } = {}): DataSource {
  const BFF = '/api/bff'
  mediaBase = (opts0.mediaBaseUrl ?? '').replace(/\/$/, '')

  async function call<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
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
      // Full-page redirect through the Nuxt server route → Strapi → provider → back to /auth/callback.
      social: async (provider, next) => ({ redirect: `/auth/connect/${provider}${qs({ next })}` }),
      verifyEmail: () => call<{ granted: number; user: User }>(`${BFF}/auth/verify`, { method: 'POST' }),
      forgot: (email) => call<void>(`${BFF}/auth/forgot-password`, { method: 'POST', body: { email } }),
      resetPassword: (code, password) => call<Session>('/api/auth/reset', { method: 'POST', body: { code, password } }),
      logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
      me: () => call<User>(`${BFF}/me`),
      async uploadAvatar(file) {
        const form = new FormData()
        form.append('file', file, file.name)
        const res = await fetch(`${BFF}/me/avatar`, { method: 'POST', body: form, headers: { 'X-Requested-With': 'plannity' }, credentials: 'same-origin' })
        const body = await res.json().catch(() => ({})) as User & StrapiErrorBody
        if (!res.ok) throw toApiError({ status: res.status, data: body })
        return body
      },
      setAvatar: (source) => call<User>(`${BFF}/me/avatar`, { method: 'PUT', body: { source } }),
      changePassword: async (currentPassword, password) => { await call<unknown>('/api/auth/password', { method: 'POST', body: { currentPassword, password } }) },
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
      get: (id) => one<Content>(`${BFF}/contents/${id}${qs({ 'populate[brand][fields][0]': 'documentId', 'populate[images]': true })}`),
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

    destinations: {
      list: (contentId) => call<{ data: PublishDestination[] }>(`${BFF}/contents/${contentId}/destinations`).then((r) => r.data),
      replace: async (contentId, items) => {
        const r = await call<{ data: PublishDestination[]; meta?: { content?: Row | null } }>(`${BFF}/contents/${contentId}/destinations`, { method: 'PATCH', body: { data: { destinations: items } } })
        return { data: r.data, content: (r.meta?.content as ContentStatePatch | null | undefined) ?? null }
      },
      markPublished: async (id, input) => {
        const r = await call<{ data: PublishDestination; meta?: { content?: Row | null } }>(`${BFF}/destinations/${id}/mark-published`, { method: 'POST', body: { data: input } })
        return { data: r.data, content: (r.meta?.content as ContentStatePatch | null | undefined) ?? null }
      },
      autopost: (contentId) => call<{ data: AutopostInfo }>(`${BFF}/contents/${contentId}/autopost`).then((r) => r.data),
      tiktokCreator: (contentId) => call<{ data: TikTokCreator }>(`${BFF}/contents/${contentId}/tiktok-creator`).then((r) => r.data),
      publish: async (id, options) => {
        const r = await call<{ data: PublishDestination; meta?: { content?: Row | null; result?: PublishOutcome | null } }>(`${BFF}/destinations/${id}/publish`, { method: 'POST', body: { data: options ? { options } : {} } })
        return { data: r.data, content: (r.meta?.content as ContentStatePatch | null | undefined) ?? null, result: r.meta?.result ?? null }
      },
      schedule: async (id, options) => {
        const r = await call<{ data: PublishDestination; meta?: { content?: Row | null } }>(`${BFF}/destinations/${id}/schedule`, { method: 'POST', body: { data: options ? { options } : {} } })
        return { data: r.data, content: (r.meta?.content as ContentStatePatch | null | undefined) ?? null }
      },
      unschedule: async (id) => {
        const r = await call<{ data: PublishDestination; meta?: { content?: Row | null } }>(`${BFF}/destinations/${id}/unschedule`, { method: 'POST', body: { data: {} } })
        return { data: r.data, content: (r.meta?.content as ContentStatePatch | null | undefined) ?? null }
      },
    },

    social: {
      list: async (brandId) => {
        const r = await call<{ data: SocialConnection[]; meta: SocialSettings }>(`${BFF}/brands/${brandId}/social-connections`)
        return { connections: r.data, settings: r.meta }
      },
      connect: (brandId, provider) => call<{ data: { url: string } }>(`${BFF}/brands/${brandId}/social-connections/connect`, { method: 'POST', body: { data: { provider } } }).then((r) => r.data),
      pages: (brandId, requestId) => call<{ data: { pages: MetaPageChoice[] } }>(`${BFF}/brands/${brandId}/social-connections/requests/${requestId}`).then((r) => r.data.pages),
      choosePage: async (brandId, requestId, pageId) => {
        const r = await call<{ data: SocialConnection[]; meta: { connected: SocialConnection['platform'][] } }>(`${BFF}/brands/${brandId}/social-connections/requests/${requestId}/choose`, { method: 'POST', body: { data: { pageId } } })
        return { connections: r.data, connected: r.meta.connected }
      },
      test: (id) => call<{ data: SocialTestResult }>(`${BFF}/social-connections/${id}/test`, { method: 'POST' }).then((r) => r.data),
      disconnect: (id) => call<{ data: SocialConnection[] }>(`${BFF}/social-connections/${id}`, { method: 'DELETE' }).then((r) => r.data),
    },

    calendar: {
      // Scheduled items in range plus (by default) the unscheduled tray (scheduledDate = null).
      // The calendar asks for the tray once and then only for scheduled items as you navigate.
      range: (from, to, brandId, opts = {}) => many<Content>(`${BFF}/contents${qs({
        'populate[brand][fields][0]': 'documentId', 'populate[images][fields][0]': 'id', 'pagination[pageSize]': 100, 'filters[archivedAt][$null]': true,
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
      createOrder: (input) => one<PaymentOrder>(`${BFF}/payments/orders`, { method: 'POST', body: { data: typeof input === 'number' ? { kind: 'credits', credits: input } : input } }),
      getOrder: (id) => one<PaymentOrder>(`${BFF}/payments/orders/${id}`),
      async uploadSlip(orderId, file) {
        const form = new FormData()
        form.append('slip', file, file.name)
        // One key per upload: a retried request is processed once (no second Slip2Go check).
        const res = await fetch(`${BFF}/payments/orders/${orderId}/slip`, { method: 'POST', body: form, headers: { 'X-Requested-With': 'plannity', 'Idempotency-Key': crypto.randomUUID() }, credentials: 'same-origin' })
        const body = await res.json().catch(() => ({})) as { data?: Row } & StrapiErrorBody
        if (!res.ok) throw toApiError({ status: res.status, data: body })
        return norm<PaymentOrder>(body.data)
      },
      createHandoff: (orderId) => call<{ data: PaymentHandoff }>(`${BFF}/payments/orders/${orderId}/handoff`, { method: 'POST' }).then((r) => r.data),
    },

    handoff: {
      get: (token) => one<PaymentOrder>(`${BFF}/payments/handoff/${encodeURIComponent(token)}`),
      async uploadSlip(token, file, idempotencyKey) {
        const form = new FormData()
        form.append('slip', file, file.name)
        const res = await fetch(`${BFF}/payments/handoff/${encodeURIComponent(token)}/slip`, { method: 'POST', body: form, headers: { 'X-Requested-With': 'plannity', 'Idempotency-Key': idempotencyKey }, credentials: 'omit' })
        const body = await res.json().catch(() => ({})) as { data?: Row } & StrapiErrorBody
        if (!res.ok) throw toApiError({ status: res.status, data: body })
        return norm<PaymentOrder>(body.data)
      },
    },

    promotions: {
      list: () => many<PromotionInquiry>(`${BFF}/promotion-inquiries`),
      create: ({ brandId, contentId, ...rest }) => one<PromotionInquiry>(`${BFF}/promotion-inquiries`, { method: 'POST', body: { data: { ...rest, brand: brandId, content: contentId } } }),
    },

    feedback: {
      submit: ({ contentId, ...rest }) => call<void>(`${BFF}/feedbacks`, { method: 'POST', body: { data: { ...rest, content: contentId } } }),
    },

    team: {
      get: (brandId) => data<TeamSummary>(`${BFF}/brands/${brandId}/team`),
      invite: (brandId, input) => data<InviteResult>(`${BFF}/brands/${brandId}/invitations`, { method: 'POST', body: { data: input } }),
      resend: (brandId, id) => data<InviteResult>(`${BFF}/brands/${brandId}/invitations/${id}/resend`, { method: 'POST' }),
      cancel: (brandId, id) => data<void>(`${BFF}/brands/${brandId}/invitations/${id}`, { method: 'DELETE' }),
      updateRole: (brandId, memberId, role) => data<BrandMember>(`${BFF}/brands/${brandId}/members/${memberId}`, { method: 'PATCH', body: { data: { role } } }),
      updatePositions: (brandId, memberId, positionKeys) => data<BrandMember>(`${BFF}/brands/${brandId}/members/${memberId}`, { method: 'PATCH', body: { data: { positionKeys } } }),
      remove: (brandId, memberId) => data<void>(`${BFF}/brands/${brandId}/members/${memberId}`, { method: 'DELETE' }),
      leave: (brandId) => data<void>(`${BFF}/brands/${brandId}/leave`, { method: 'POST' }),
    },

    billing: {
      me: () => data<Entitlements>(`${BFF}/billing/me`),
    },

    tasks: {
      forContent: (contentId) => data<Task[]>(`${BFF}/contents/${contentId}/tasks`),
      mine: () => data<Task[]>(`${BFF}/tasks/my`),
      forBrand: (brandId) => data<Task[]>(`${BFF}/brands/${brandId}/tasks`),
      create: (contentId, input) => data<Task>(`${BFF}/contents/${contentId}/tasks`, { method: 'POST', body: { data: input } }),
      updateAssignment: (taskId, input) => data<Task>(`${BFF}/tasks/${taskId}/assignment`, { method: 'PATCH', body: { data: input } }),
      transition: (taskId, action, input) => data<Task>(`${BFF}/tasks/${taskId}/transition`, { method: 'POST', body: { data: { action, ...input } } }),
    },

    activity: {
      async list(brandId, q = {}) {
        const r = await call<{ data: ActivityEntry[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }>(`${BFF}/brands/${brandId}/activity${qs({ ...q })}`)
        return { data: r.data, meta: r.meta }
      },
    },

    invitations: {
      preview: (token) => data<InvitationPreview>(`${BFF}/invitations/${encodeURIComponent(token)}`),
      accept: (token) => data<{ brandId: string }>(`${BFF}/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
      decline: (token) => data<void>(`${BFF}/invitations/${encodeURIComponent(token)}/decline`, { method: 'POST' }),
      mine: () => data<MyInvitation[]>(`${BFF}/invitations/mine`),
      acceptMine: (id) => data<{ brandId: string }>(`${BFF}/invitations/mine/${id}/accept`, { method: 'POST' }),
      declineMine: (id) => data<void>(`${BFF}/invitations/mine/${id}/decline`, { method: 'POST' }),
    },

    contentImages: {
      upload: (contentId, files, onProgress) => sendFiles(`${BFF}/contents/${contentId}/images`, files, onProgress),
      replace: (contentId, imageId, file) => sendFiles(`${BFF}/contents/${contentId}/images/${imageId}/replace`, [file]),
      remove: async (contentId, imageId) => (await data<Row[]>(`${BFF}/contents/${contentId}/images/${imageId}`, { method: 'DELETE' })).map(toImage),
      reorder: async (contentId, imageIds) => (await data<Row[]>(`${BFF}/contents/${contentId}/images/order`, { method: 'PUT', body: { data: { imageIds } } })).map(toImage),
      async download(contentId, imageId) {
        const res = await fetch(`${BFF}/contents/${contentId}/images/${imageId}/download`, { credentials: 'same-origin' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as StrapiErrorBody
          throw toApiError({ status: res.status, data: body })
        }
        return res.blob()
      },
    },
  }

  /** Custom endpoints answer { data }; unwrap it. */
  async function data<T>(path: string, opts?: Parameters<typeof call>[1]): Promise<T> {
    return (await call<{ data: T }>(path, opts)).data
  }

  /** Multipart upload with progress (fetch can't report upload progress). */
  function sendFiles(url: string, files: File[], onProgress?: (pct: number) => void): Promise<ContentImage[]> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      for (const f of files) form.append('files', f, f.name)
      // Multipart parsing can reorder files; tell the server the order they were picked in.
      form.append('order', JSON.stringify(files.map((f) => ({ name: f.name, size: f.size }))))
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url)
      xhr.setRequestHeader('X-Requested-With', 'plannity')
      xhr.responseType = 'json'
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)) }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(((xhr.response as { data: Row[] }).data ?? []).map(toImage))
        else reject(toApiError({ status: xhr.status, data: xhr.response as StrapiErrorBody }))
      }
      xhr.onerror = () => reject(toApiError({ status: 0 }))
      xhr.send(form)
    })
  }
}
