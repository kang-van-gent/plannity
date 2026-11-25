<script setup lang="ts">
// One continuous background for the whole landing page (under the header →
// footer): a single dot texture, a colour wash that flows down the page, and
// scattered triangles / squares / rings / pluses / sparks with depth parallax.
//
// Performance notes (this runs on a ~7,500px page):
// - The backdrop itself never moves, so the dots and glows are painted once.
// - Parallax moves each small shape with the CSS `translate` property; only
//   shapes near the viewport are updated, once per animation frame.
// - Only the largest third of the shapes float (CSS `transform` keyframes, compositor-only).
// - No filters, no blur, no page-sized will-change layers.
// Positions come from a seeded RNG so server and client render the same layout.

type Kind = 'tri' | 'tri-o' | 'sq' | 'sq-o' | 'ring' | 'plus' | 'spark' | 'dot'
interface Shape { kind: Kind; top: number; left: number; size: number; color: string; rot: number; opacity: number; dur: number; delay: number; k: number; float: boolean; phoneHidden: boolean }

const COLORS = ['#6C4CF5', '#FF6FAE', '#FFB23F', '#62C5F4', '#A7E66B']
const KINDS: Kind[] = ['tri', 'tri-o', 'sq', 'sq-o', 'ring', 'plus', 'spark', 'tri', 'sq', 'dot']
const DEPTH_K = [0.08, 0.16, 0.26] // how much slower than the page each depth moves

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COUNT = 44
const shapes: Shape[] = (() => {
  const r = rng(20261125)
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!
  return Array.from({ length: COUNT }, (_, i) => {
    // One shape per vertical band (jittered) → even coverage, no empty stretches.
    const top = ((i + 0.15 + r() * 0.7) / COUNT) * 100
    const edge = r() < 0.75 // mostly in the margins so content stays readable
    const left = edge ? (r() < 0.5 ? 1 + r() * 14 : 85 + r() * 13) : 18 + r() * 64
    const depth = i % 3
    return {
      kind: pick(KINDS),
      top,
      left,
      size: Math.round((depth === 0 ? 14 : depth === 1 ? 22 : 34) + r() * (depth === 2 ? 28 : 16)),
      color: pick(COLORS),
      rot: Math.round(r() * 360),
      opacity: edge ? 0.5 + r() * 0.35 : 0.2 + r() * 0.15,
      dur: 10 + r() * 8,
      delay: -r() * 18,
      k: DEPTH_K[depth]!,
      float: depth === 2,
      phoneHidden: i % 2 === 1,
    }
  })
})()

const glows = Array.from({ length: 6 }, (_, i) => ({ top: i * 17, left: i % 2 ? 76 : 10, color: COLORS[i % COLORS.length]! }))

const root = ref<HTMLElement | null>(null)
let els: HTMLElement[] = []
let centers: number[] = []
let rootTop = 0
let raf = 0
let ro: ResizeObserver | undefined

function measure() {
  if (!root.value) return
  rootTop = root.value.getBoundingClientRect().top + window.scrollY
  centers = els.map((el) => el.offsetTop + el.offsetHeight / 2)
  update()
}
function update() {
  raf = 0
  const mid = window.scrollY + window.innerHeight / 2 - rootTop
  const reach = window.innerHeight * 1.6
  for (let i = 0; i < els.length; i++) {
    const d = centers[i]! - mid
    if (d > reach || d < -reach) continue // far off-screen: leave it alone
    els[i]!.style.translate = `0 ${(-shapes[i]!.k * d).toFixed(1)}px`
  }
}
const onScroll = () => { raf ||= requestAnimationFrame(update) }

onMounted(() => {
  if (!root.value || prefersReducedMotion()) return
  els = Array.from(root.value.querySelectorAll<HTMLElement>('[data-shape]'))
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  ro = new ResizeObserver(() => measure())
  ro.observe(root.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  ro?.disconnect()
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div ref="root" class="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <!-- colour wash (radial gradients, painted once) -->
    <span v-for="(g, i) in glows" :key="`g${i}`" class="absolute size-[44rem] -translate-x-1/2 rounded-full opacity-[0.15] dark:opacity-[0.2]"
      :style="{ top: `${g.top}%`, left: `${g.left}%`, background: `radial-gradient(closest-side, ${g.color}, transparent)` }" />
    <!-- one dot texture for the whole page -->
    <div class="absolute inset-0 bg-dots opacity-40" />

    <span v-for="(s, i) in shapes" :key="i" data-shape class="landing-shape absolute" :class="[s.phoneHidden && 'max-sm:hidden', s.float && 'is-floating']"
      :style="{ top: `${s.top}%`, left: `${s.left}%`, width: `${s.size}px`, height: `${s.size}px`, color: s.color, '--o': s.opacity,
                '--r': `${s.rot}deg`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }">
      <svg viewBox="0 0 40 40" class="size-full overflow-visible">
        <path v-if="s.kind === 'tri'" d="M20 4 37 34H3Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
        <path v-else-if="s.kind === 'tri-o'" d="M20 5 36 33H4Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round" />
        <rect v-else-if="s.kind === 'sq'" x="5" y="5" width="30" height="30" rx="7" fill="currentColor" />
        <rect v-else-if="s.kind === 'sq-o'" x="6" y="6" width="28" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="3.5" />
        <circle v-else-if="s.kind === 'ring'" cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="3.5" />
        <path v-else-if="s.kind === 'plus'" d="M20 6v28M6 20h28" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
        <path v-else-if="s.kind === 'spark'" d="M20 2c1 7.7 4.8 13.2 15.8 17.5C24.8 23.8 21 29.3 20 37c-1-7.7-4.8-13.2-15.8-17.5C15.2 15.2 19 9.7 20 2Z" fill="currentColor" />
        <circle v-else cx="20" cy="20" r="8" fill="currentColor" />
      </svg>
    </span>
  </div>
</template>
