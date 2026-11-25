// Post-image rules shared by the UI and the in-browser mock backend. The Strapi
// backend enforces the same limits server-side (CONTENT_IMAGE_MAX_MB /
// CONTENT_IMAGE_MAX_COUNT); the UI reads them from runtime config.

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

export interface ImageLimits { maxBytes: number; maxCount: number }
export const DEFAULT_IMAGE_LIMITS: ImageLimits = { maxBytes: 10 * 1024 * 1024, maxCount: 10 }

/** Detects the real image type from the file's first bytes (not its name or claimed type). */
export function sniffImageType(b: Uint8Array): (typeof IMAGE_MIME_TYPES)[number] | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (b.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...b.slice(0, 6)))) return 'image/gif'
  return null
}

export async function sniffFile(file: Blob) {
  return sniffImageType(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Triggers a browser download for a Blob. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Safe, readable filename (keeps the extension). */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim()
  return cleaned.slice(-120) || 'image'
}
