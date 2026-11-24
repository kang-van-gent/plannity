<script setup lang="ts">
import { gsap } from 'gsap'
import type { RouteLocationNormalized } from 'vue-router'

// Brand-coloured curtain that sweeps up between public pages and when
// entering/leaving the user panel. Inside /app a lighter content transition
// is used instead (see app.vue).
const curtain = useCurtain()
const root = ref<HTMLElement | null>(null)
const COLORS = ['#FFB23F', '#FF6FAE', '#62C5F4', '#6C4CF5']
const CLOSED_BOTTOM = 'inset(100% 0% 0% 0% round 50% 50% 0% 0%)'
const OPEN = 'inset(0% 0% 0% 0% round 0% 0% 0% 0%)'
const CLOSED_TOP = 'inset(0% 0% 100% 0% round 0% 0% 50% 50%)'

function kind(to: RouteLocationNormalized, from: RouteLocationNormalized): 'curtain' | 'none' {
  if (!from.matched.length || to.path === from.path) return 'none'
  const toApp = to.path.startsWith('/app')
  const fromApp = from.path.startsWith('/app')
  return toApp && fromApp ? 'none' : 'curtain'
}

function cover(): Promise<void> {
  const el = root.value
  if (!el) return Promise.resolve()
  curtain.value.active = true
  curtain.value.covering = true
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: resolve })
      .set(el, { visibility: 'visible' })
      .fromTo(el.querySelectorAll('[data-layer]'), { clipPath: CLOSED_BOTTOM }, { clipPath: OPEN, duration: 0.62, stagger: 0.07, ease: 'power4.inOut' })
      .fromTo(el.querySelector('[data-mark]'), { scale: 0.3, rotate: -25, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.45, ease: 'back.out(2)' }, '-=0.25')
  })
}

let revealing = false
function reveal() {
  const el = root.value
  if (!el || !curtain.value.active || revealing) return
  revealing = true
  curtain.value.covering = false // lets page entrance animations start as the curtain lifts
  gsap.timeline({
    onComplete: () => {
      gsap.set(el, { visibility: 'hidden' })
      curtain.value.active = false
      revealing = false
    },
  })
    .to(el.querySelector('[data-mark]'), { scale: 0.6, rotate: 20, opacity: 0, duration: 0.3, ease: 'power2.in' })
    .to(Array.from(el.querySelectorAll('[data-layer]')).reverse(), { clipPath: CLOSED_TOP, duration: 0.62, stagger: 0.07, ease: 'power4.inOut' }, 0.1)
}

if (import.meta.client) {
  const router = useRouter()
  const nuxtApp = useNuxtApp()
  let safety: ReturnType<typeof setTimeout> | undefined
  const offBefore = router.beforeEach(async (to, from) => {
    if (prefersReducedMotion() || kind(to, from) === 'none' || curtain.value.active) return
    await cover()
    clearTimeout(safety)
    safety = setTimeout(reveal, 2500) // never leave the curtain down
  })
  const offAfter = router.afterEach((_to, _from, failure) => { if (failure) reveal() })
  router.onError(() => reveal())
  const offHook = nuxtApp.hook('page:finish', () => {
    if (curtain.value.active) setTimeout(reveal, 80)
  })
  onBeforeUnmount(() => { offBefore(); offAfter(); offHook(); clearTimeout(safety) })
}
</script>

<template>
  <div ref="root" class="pointer-events-none invisible fixed inset-0 z-[200]" aria-hidden="true">
    <div v-for="(c, i) in COLORS" :key="c" data-layer class="absolute inset-0" :style="{ background: c, clipPath: CLOSED_BOTTOM, zIndex: i }" />
    <div class="absolute inset-0 z-10 grid place-items-center">
      <div data-mark class="flex flex-col items-center gap-3 opacity-0">
        <img src="/brand/logo-mark.png" alt="" width="96" height="96" class="size-24 drop-shadow-xl">
        <span class="font-display text-lg font-semibold text-white/90">Less planning. More creating.</span>
      </div>
    </div>
  </div>
</template>
