import type { H3Event } from 'h3'

/** HttpOnly cookie that holds the Strapi JWT. Never readable from browser JS. */
export const JWT_COOKIE = 'plannity_jwt'

export function setJwtCookie(event: H3Event, jwt: string) {
  setCookie(event, JWT_COOKIE, jwt, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  })
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
  }
}

/** Re-throws an upstream Strapi error keeping its status and body. */
export function rethrow(e: unknown): never {
  const err = e as { status?: number; statusCode?: number; data?: unknown }
  throw createError({ statusCode: err.status ?? err.statusCode ?? 502, data: err.data ?? { error: { message: 'Upstream unavailable' } } })
}

/** Social sign-in providers the app offers (must match Strapi's provider names). */
export const SOCIAL_PROVIDERS = ['google', 'facebook', 'apple'] as const
export type SocialProvider = typeof SOCIAL_PROVIDERS[number]
export const isSocialProvider = (p: unknown): p is SocialProvider => SOCIAL_PROVIDERS.includes(p as SocialProvider)

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
