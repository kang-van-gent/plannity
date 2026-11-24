<script setup lang="ts">
import { gsap } from 'gsap'
import { isNavigationFailure, NavigationFailureType, type RouteLocationNormalized } from 'vue-router'

// Brand-coloured curtain that sweeps up between public pages and when
// entering/leaving the user panel. Inside /app a lighter content transition
// is used instead (see app.vue).
//
// Only transforms are animated (GPU-composited), never clip-path, so it stays
// at 60fps on phones. Each layer is taller than the screen with curved top and
// bottom edges; it slides up from below to cover, then on up and out to reveal.
const curtain = useCurtain()
const root = ref<HTMLElement | null>(null)
const COLORS = ['#FFB23F', '#FF6FAE', '#62C5F4', '#6C4CF5']

function kind(to: RouteLocationNormalized, from: RouteLocationNormalized): 'curtain' | 'none' {
  if (!from.matched.length || to.path === from.path) return 'none'
  const toApp = to.path.startsWith('/app')
  const fromApp = from.path.startsWith('/app')
  return toApp && fromApp ? 'none' : 'curtain'
}

let tl: gsap.core.Timeline | null = null
const parts = () => {
  const el = root.value!
  return { el, layers: Array.from(el.querySelectorAll<HTMLElement>('[data-layer]')), mark: el.querySelector<HTMLElement>('[data-mark]')! }
}
// Curve depth matches the CSS: --curve = 18vh, capped at 160px.
const curve = () => Math.min(window.innerHeight * 0.18, 160)

function cover(): Promise<void> {
  if (!root.value) return Promise.resolve()
  const { el, layers, mark } = parts()
  const vh = window.innerHeight
  const resuming = curtain.value.active // navigating again while the curtain is still lifting
  tl?.kill()
  curtain.value.active = true
  curtain.value.covering = true
  document.documentElement.dataset.transitioning = '1'
  return new Promise((resolve) => {
    tl = gsap.timeline({ onComplete: resolve, defaults: { overwrite: 'auto' } })
      .set(el, { visibility: 'visible' })
      .set(layers, { willChange: 'transform' })
    if (!resuming) tl.set(layers, { y: vh + curve() })
    tl.to(layers, { y: -curve(), duration: resuming ? 0.4 : 0.6, stagger: 0.06, ease: 'power3.inOut' })
      .fromTo(mark, { scale: 0.4, rotate: -20, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.42, ease: 'back.out(2)' }, '-=0.22')
  })
}

function reveal() {
  if (!root.value || !curtain.value.active || !curtain.value.covering) return
  const { el, layers, mark } = parts()
  const vh = window.innerHeight
  curtain.value.covering = false // page entrance animations start as the curtain lifts
  tl?.kill()
  tl = gsap.timeline({
    defaults: { overwrite: 'auto' },
    onComplete: () => {
      gsap.set(el, { visibility: 'hidden' })
      gsap.set(layers, { clearProps: 'willChange' })
      curtain.value.active = false
      delete document.documentElement.dataset.transitioning
    },
  })
    .to(mark, { scale: 0.7, rotate: 15, opacity: 0, duration: 0.26, ease: 'power2.in' })
    .to(layers.slice().reverse(), { y: -(vh + curve() * 3), duration: 0.62, stagger: 0.06, ease: 'power3.inOut' }, 0.08)
}

if (import.meta.client) {
  const router = useRouter()
  const nuxtApp = useNuxtApp()
  let safety: ReturnType<typeof setTimeout> | undefined
  const offBefore = router.beforeEach(async (to, from) => {
    if (prefersReducedMotion() || kind(to, from) === 'none') return
    if (curtain.value.active && curtain.value.covering) return // already down; let this navigation through
    await cover()
    clearTimeout(safety)
    safety = setTimeout(reveal, 3000) // never leave the curtain down
  })
  const offAfter = router.afterEach((_to, _from, failure) => {
    // A newer navigation superseded this one; that navigation reveals instead.
    if (failure && !isNavigationFailure(failure, NavigationFailureType.cancelled)) reveal()
  })
  router.onError(() => reveal())
  const offHook = nuxtApp.hook('page:finish', () => {
    if (!curtain.value.covering) return
    clearTimeout(safety)
    // Two frames: the new page has painted before the curtain starts moving.
    requestAnimationFrame(() => requestAnimationFrame(reveal))
  })
  onBeforeUnmount(() => { offBefore(); offAfter(); offHook(); clearTimeout(safety); tl?.kill() })
}
</script>

<template>
  <div ref="root" class="curtain pointer-events-none invisible fixed inset-0 z-[200] overflow-hidden" aria-hidden="true">
    <div v-for="(c, i) in COLORS" :key="c" data-layer class="curtain-layer" :style="{ background: c, zIndex: i }" />
    <div class="absolute inset-0 z-10 grid place-items-center">
      <div data-mark class="flex flex-col items-center gap-3 px-6 text-center opacity-0">
        <img src="/brand/logo-mark.png" alt="" width="96" height="96" class="size-20 drop-shadow-xl sm:size-24">
        <span class="font-display text-base font-semibold text-white/90 sm:text-lg">Less planning. More creating.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.curtain { --curve: min(18vh, 160px); }
.curtain-layer {
  position: absolute;
  left: -15%;
  width: 130%;
  top: 0;
  height: calc(100% + var(--curve) * 2);
  border-radius: 50% 50% 50% 50% / var(--curve) var(--curve) var(--curve) var(--curve);
  transform: translate3d(0, 120vh, 0);
  backface-visibility: hidden;
}
</style>
