// Calendar dates are plain YYYY-MM-DD strings interpreted in Asia/Bangkok
// (spec §11: never use UTC midnight to stand in for a calendar day).
// All arithmetic is done on UTC-noon-free integer dates so DST/offsets
// on the user's machine can never shift a day.

export const TZ = 'Asia/Bangkok'

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function nowISO(): string {
  return new Date().toISOString()
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
}

function fromUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const dt = toUTC(iso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUTC(dt)
}

export function addMonths(iso: string, n: number): string {
  const dt = toUTC(iso)
  const day = dt.getUTCDate()
  dt.setUTCDate(1)
  dt.setUTCMonth(dt.getUTCMonth() + n)
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  dt.setUTCDate(Math.min(day, last))
  return fromUTC(dt)
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000)
}

export function weekday(iso: string): number {
  return toUTC(iso).getUTCDay()
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + '01'
}

export function endOfMonth(iso: string): string {
  const dt = toUTC(startOfMonth(iso))
  return fromUTC(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)))
}

/** Weeks start on Sunday, as on most Thai wall calendars. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekday(iso))
}

/** Whole weeks covering the month of `iso` (4–6 rows × 7), so no trailing row of next month. */
export function monthGrid(iso: string): string[] {
  const first = startOfWeek(startOfMonth(iso))
  const last = addDays(startOfWeek(endOfMonth(iso)), 6)
  const days: string[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d)
  return days
}

export function weekDays(iso: string): string[] {
  const first = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

export function isValidISODate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return fromUTC(toUTC(s)) === s
}

export function intlLocale(locale: string): string {
  return locale === 'th' ? 'th-TH' : 'en-GB'
}

/** Formats a date-only value without timezone drift. */
export function formatDate(iso: string | null | undefined, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: 'UTC' }).format(toUTC(iso))
}

/** Formats a timestamp in Bangkok local time. */
export function formatDateTime(ts: string | null | undefined, locale: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  if (!ts) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: TZ }).format(new Date(ts))
}

export function monthLabel(iso: string, locale: string): string {
  return formatDate(iso, locale, { month: 'long', year: 'numeric' })
}

export function weekdayLabels(locale: string, style: 'short' | 'narrow' = 'short'): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays('2023-01-01', i), locale, { weekday: style }))
}

export function relativeTime(ts: string, locale: string): string {
  const diff = (new Date(ts).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}
