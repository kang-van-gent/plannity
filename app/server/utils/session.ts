import type { H3Event } from 'h3'

/**
 * Strapi session in two HttpOnly cookies (never readable from browser JS):
 *  - plannity_jwt      short-lived access token (Strapi: ~10 min)
 *  - plannity_refresh  refresh token, rotated on every use
 * `accessToken()` renews the access token shortly before it expires. Refresh
 * tokens are single-use, so concurrent requests share one in-flight refresh.
 */
export const JWT_COOKIE = 'plannity_jwt'
export const REFRESH_COOKIE = 'plannity_refresh'
const COOKIE = { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax' as const, path: '/' }

export function setJwtCookie(event: H3Event, jwt: string, refreshToken?: string | null) {
  setCookie(event, JWT_COOKIE, jwt, { ...COOKIE, maxAge: 60 * 60 * 24 * 14 })
  if (refreshToken) setCookie(event, REFRESH_COOKIE, refreshToken, { ...COOKIE, maxAge: 60 * 60 * 24 * 30 })
}

export function clearSessionCookies(event: H3Event) {
  deleteCookie(event, JWT_COOKIE, { path: '/' })
  deleteCookie(event, REFRESH_COOKIE, { path: '/' })
  deleteCookie(event, 'plannity-session', { path: '/' })
}

/** Seconds until the JWT expires (no signature check — Strapi verifies it). */
function expiresIn(jwt: string): number {
  try {
    const seg = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(seg)) as { exp?: number }
    return payload.exp ? payload.exp - Date.now() / 1000 : Infinity
  } catch {
    return 0
  }
}

type Tokens = { jwt: string; refreshToken: string | null }
const inflight = new Map<string, Promise<Tokens | null>>()
/** Results of a rotation, briefly, for requests that still carry the old refresh token. */
const rotated = new Map<string, { at: number; tokens: Tokens }>()

async function refresh(event: H3Event, refreshToken: string): Promise<Tokens | null> {
  const recent = rotated.get(refreshToken)
  if (recent && Date.now() - recent.at < 30_000) return recent.tokens
  let p = inflight.get(refreshToken)
  if (!p) {
    p = $fetch<{ jwt: string; refreshToken?: string }>(`${strapiBase(event)}/api/auth/refresh`, { method: 'POST', body: { refreshToken } })
      .then((r) => {
        const tokens = { jwt: r.jwt, refreshToken: r.refreshToken ?? null }
        rotated.set(refreshToken, { at: Date.now(), tokens })
        return tokens
      })
      .catch(() => null)
      .finally(() => setTimeout(() => inflight.delete(refreshToken), 0))
    inflight.set(refreshToken, p)
  }
  return p
}

/** A valid access token for this request (renewed if needed), or null when signed out. */
export async function accessToken(event: H3Event, opts: { force?: boolean } = {}): Promise<string | null> {
  const jwt = getCookie(event, JWT_COOKIE) ?? null
  if (jwt && !opts.force && expiresIn(jwt) > 60) return jwt
  const rt = getCookie(event, REFRESH_COOKIE)
  if (!rt) return opts.force ? null : jwt
  const tokens = await refresh(event, rt)
  if (!tokens) {
    if (opts.force || !jwt || expiresIn(jwt) <= 0) clearSessionCookies(event)
    return null
  }
  setJwtCookie(event, tokens.jwt, tokens.refreshToken)
  return tokens.jwt
}

export function strapiBase(event: H3Event): string {
  return String(useRuntimeConfig(event).strapiUrl).replace(/\/$/, '')
}

/** Strapi users-permissions user → app User shape. */
export function toAppUser(u: Record<string, unknown>) {
  return {
    id: String(u.documentId ?? u.id),
    email: String(u.email ?? ''),
    name: String(u.name ?? u.username ?? ''),
    verifiedAt: u.confirmed ? String(u.updatedAt ?? u.createdAt ?? '') : null,
    locale: (u.locale === 'en' ? 'en' : 'th') as 'th' | 'en',
    timezone: 'Asia/Bangkok' as const,
    createdAt: String(u.createdAt ?? ''),
    avatarUrl: typeof u.avatarUrl === 'string' && u.avatarUrl ? u.avatarUrl : null,
    avatarSource: (['upload', 'gravatar', 'google'].includes(String(u.avatarSource)) ? u.avatarSource : null) as 'upload' | 'gravatar' | 'google' | null,
    signInMethod: String(u.provider ?? 'local'),
  }
}

/** Re-throws an upstream Strapi error keeping its status and body. */
export function rethrow(e: unknown): never {
  const err = e as { status?: number; statusCode?: number; data?: unknown }
  throw createError({ statusCode: err.status ?? err.statusCode ?? 502, data: err.data ?? { error: { message: 'Upstream unavailable' } } })
}

/** Social sign-in providers the app offers (must match Strapi's provider names). */
// Facebook and Apple are switched off for now (later release); their Strapi
// side stays in place, so re-adding them here turns the routes back on.
export const SOCIAL_PROVIDERS = ['google'] as const
export type SocialProvider = 'google' | 'facebook' | 'apple'
export const isSocialProvider = (p: unknown): p is SocialProvider => (SOCIAL_PROVIDERS as readonly unknown[]).includes(p)

/** Short-lived cookie remembering where to land after the provider round-trip. */
export const OAUTH_NEXT_COOKIE = 'plannity_oauth_next'

/** Only same-app paths are allowed as post-login destinations (no open redirects). */
export function safeNext(v: unknown): string {
  return typeof v === 'string' && !v.startsWith('//') && (v.startsWith('/app') || /^\/invite\/[\w-]+$/.test(v)) ? v : '/app'
}

/** Readable routing hint the client middleware checks (the JWT itself stays HttpOnly). */
export function setSessionHint(event: H3Event) {
  setCookie(event, 'plannity-session', '1', { sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 14 })
}
