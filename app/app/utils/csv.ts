import type { Brand, Content } from '~/types'
import { platformsOf } from './destinations'

/**
 * Neutralises spreadsheet formula injection (spec §10): any cell that a
 * spreadsheet would evaluate is prefixed with an apostrophe.
 */
export function safeCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export const CSV_COLUMNS = ['date', 'brand', 'platform', 'format', 'pillar', 'title', 'hook', 'caption', 'CTA', 'brief', 'status', 'post URL'] as const

/** UTF-8 with BOM so Excel opens Thai text correctly. */
export function buildContentCsv(rows: Content[], brands: Pick<Brand, 'id' | 'name'>[]): string {
  const brandName = new Map(brands.map((b) => [b.id, b.name]))
  const lines = [CSV_COLUMNS.map(safeCell).join(',')]
  for (const c of rows) {
    lines.push([
      c.scheduledDate ?? c.suggestedDate ?? '',
      brandName.get(c.brandId) ?? '',
      platformsOf(c).join(' + '), c.format, c.pillar, c.title, c.hook, c.caption, c.cta, c.visualBrief, c.status, c.postUrl ?? '',
    ].map(safeCell).join(','))
  }
  return '﻿' + lines.join('\r\n')
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
