import { intlLocale } from './date'

/** Money is always integer satang (spec §14). */
export function formatTHB(satang: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: satang % 100 === 0 ? 0 : 2,
  }).format(satang / 100)
}

export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(n)
}

export function uid(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${rnd}` : rnd
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

/** Post-login destination from ?next= — only in-app pages and invitation links (no open redirects). */
export function safeNextPath(v: unknown, fallback = '/app'): string {
  return typeof v === 'string' && !v.startsWith('//') && (v.startsWith('/app') || /^\/invite\/[\w-]+$/.test(v)) ? v : fallback
}
