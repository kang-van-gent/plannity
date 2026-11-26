// Minimal QR Code encoder (byte mode, error-correction level M, versions 1–10)
// following ISO/IEC 18004. Enough for payment payloads (PromptPay ≈ 80 chars)
// without a dependency. Structure follows Project Nayuki's reference
// implementation (MIT). Returns a module matrix; `qrSvg` renders it.

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MAX_VERSION = 10

function rawDataModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}
const dataCodewords = (ver: number) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK_M[ver]! * BLOCKS_M[ver]!

// ---- Reed–Solomon over GF(2^8), polynomial 0x11D --------------------------
function gfMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}
function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0)
  r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j]!, root)
      if (j + 1 < r.length) r[j]! ^= r[j + 1]!
    }
    root = gfMul(root, 0x02)
  }
  return r
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const r = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = b ^ r.shift()!
    r.push(0)
    divisor.forEach((coef, i) => { r[i]! ^= gfMul(coef, factor) })
  }
  return r
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  for (; ver <= MAX_VERSION; ver++) {
    const ccBits = ver <= 9 ? 8 : 16
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break
  }
  if (ver > MAX_VERSION) throw new Error('QR payload too long')

  // ---- data bits -----------------------------------------------------------
  const bits: number[] = []
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(0b0100, 4) // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16)
  for (const b of bytes) put(b, 8)
  const capacity = dataCodewords(ver) * 8
  put(0, Math.min(4, capacity - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // ---- error correction + interleave ----------------------------------------
  const numBlocks = BLOCKS_M[ver]!
  const eccLen = ECC_PER_BLOCK_M[ver]!
  const rawCodewords = Math.floor(rawDataModules(ver) / 8)
  const numShort = numBlocks - (rawCodewords % numBlocks)
  const shortLen = Math.floor(rawCodewords / numBlocks)
  const divisor = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(blk[i]!) })
  }

  // ---- function patterns ----------------------------------------------------
  const size = ver * 4 + 17
  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { mod[y]![x] = dark; fn[y]![x] = true }

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      set(x, y, d !== 2 && d !== 4)
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
    const pos = [6]
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p)
    pos.forEach((x, i) => pos.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }))
  }
  const drawFormat = (mask: number) => {
    const d = (0 << 3) | mask // level M = 00
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const b = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0) // reserve
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const b = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) !== 0
      const a = size - 11 + (i % 3), c = Math.floor(i / 3)
      set(a, c, dark); set(c, a, dark)
    }
  }

  // ---- place data (zig-zag) ---------------------------------------------------
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const y = ((right + 1) & 2) === 0 ? size - 1 - v : v
      if (!fn[y]![x] && i < codewords.length * 8) { mod[y]![x] = ((codewords[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0; i++ }
    }
  }

  // ---- mask: pick the lowest penalty --------------------------------------------
  const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const applyMask = (m: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y]![x] && MASKS[m]!(x, y)) mod[y]![x] = !mod[y]![x] }
  let best = 0, bestPenalty = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m)
    const p = penalty(mod)
    if (p < bestPenalty) { best = m; bestPenalty = p }
    applyMask(m) // undo (XOR)
  }
  applyMask(best); drawFormat(best)
  return mod
}

/** Standard penalty rules N1–N4 (used only to choose a readable mask). */
function penalty(m: boolean[][]): number {
  const n = m.length
  let p = 0
  const lines = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < n; a++) {
      let run = 1
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++
        else { if (run >= 5) p += 3 + (run - 5); run = 1 }
      }
      for (let b = 0; b + 7 <= n; b++) {
        const seq = [0, 1, 2, 3, 4, 5, 6].map((k) => get(a, b + k))
        if (seq.join() === 'true,false,true,true,true,false,true') {
          const before = b >= 4 && [1, 2, 3, 4].every((k) => !get(a, b - k))
          const after = b + 11 <= n && [7, 8, 9, 10].every((k) => !get(a, b + k))
          if (before || after) p += 40
        }
      }
    }
  }
  lines((r, c) => m[r]![c]!)
  lines((c, r) => m[r]![c]!)
  let dark = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y]![x]) dark++
    if (x < n - 1 && y < n - 1 && m[y]![x] === m[y]![x + 1] && m[y]![x] === m[y + 1]![x] && m[y]![x] === m[y + 1]![x + 1]) p += 3
  }
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return p
}

/** Crisp SVG (one path) with the standard 4-module quiet zone. */
export function qrSvg(text: string, opts: { dark?: string; light?: string } = {}): string {
  const m = qrMatrix(text)
  const q = 4, size = m.length + q * 2
  let d = ''
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${opts.light ?? '#fff'}"/><path d="${d}" fill="${opts.dark ?? '#000'}"/></svg>`
}
