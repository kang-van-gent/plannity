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
