<script setup lang="ts">
import { gsap } from 'gsap'

/**
 * Landing page intro — shown when the landing page is loaded or refreshed
 * (not on in-app navigation, which uses PageCurtain).
 *
 * It's part of the server-rendered HTML, so it covers the page before the
 * first paint: no flash of half-styled content. The opening (logo, petals,
 * tagline, loading bar) runs on CSS alone, even before the app has hydrated.
 * Once the page is really ready — hydrated, fonts and hero images loaded —
 * GSAP lifts it in the same four brand-coloured layers as PageCurtain, and the
 * hero's entrance animations start exactly as it lifts (via the curtain state).
 *
 * Never in the way: hidden for reduced motion and without JS (no `js-anim`
 * on <html>), hidden by the boot script's 3.5s fallback if hydration fails,
 * at most ~3s on a slow connection, and quicker on repeat visits this session.
 */
const curtain = useCurtain()
const done = useState('landing-intro-done', () => false)
const root = ref<HTMLElement | null>(null)
const COLORS = ['#FFB23F', '#FF6FAE', '#62C5F4', '#6C4CF5']
const PETALS = [
  { c: '#FFB23F', r: 0 }, { c: '#FF6FAE', r: 90 }, { c: '#62C5F4', r: 180 }, { c: '#A7E66B', r: 270 },
]

// Hold the page's entrance animations until the intro lifts (server and client agree).
if (!done.value) curtain.value = { ...curtain.value, active: true, covering: true, intro: true }

function finish() {
  done.value = true
  curtain.value = { ...curtain.value, active: false, covering: false, intro: false }
}

/** Resolves when hydration, web fonts and above-the-fold images are ready. */
async function pageReady(): Promise<void> {
  const imgs = [...document.querySelectorAll<HTMLImageElement>('header img, #main img')].filter((i) => i.getBoundingClientRect().top < window.innerHeight)
  await Promise.all([
    document.fonts?.ready.catch(() => {}),
    ...imgs.map((i) => (i.complete ? null : i.decode().catch(() => {}))),
  ])
}

onMounted(async () => {
  if (done.value) return
  const el = root.value
  if (!el || prefersReducedMotion() || document.documentElement.classList.contains('anim-fallback')) { finish(); return }

  // Quicker on a repeat visit in the same session — the brand moment, not a wait.
  const seen = sessionStorage.getItem('plannity-intro') === '1'
  sessionStorage.setItem('plannity-intro', '1')
  const minMs = seen ? 650 : 1250
  const maxMs = 3000

  const bar = el.querySelector<HTMLElement>('[data-bar]')!
  const stage = el.querySelector<HTMLElement>('[data-stage]')!
  const layers = [...el.querySelectorAll<HTMLElement>('[data-layer]')]

  // Real progress: the CSS bar crawls to ~70%; readiness drives the rest.
  await Promise.race([pageReady(), new Promise((r) => setTimeout(r, maxMs))])
  const wait = Math.max(0, minMs - performance.now())
  gsap.to(bar, { scaleX: 1, duration: Math.max(0.25, wait / 1000), ease: 'power2.out', overwrite: true })
  await new Promise((r) => setTimeout(r, wait + 120))

  const vh = window.innerHeight
  const curve = Math.min(vh * 0.18, 160)
  gsap.timeline({ onComplete: () => { gsap.set(el, { display: 'none' }); done.value = true } })
    // The mark gathers itself, then the colour layers sweep up and away.
    .to(stage, { scale: 0.92, opacity: 0, y: -24, duration: 0.38, ease: 'power2.in' })
    .to(el.querySelectorAll('.intro-blob'), { opacity: 0, duration: 0.4 }, 0)
    .set(el, { backgroundColor: 'transparent' })
    .to(layers.slice().reverse(), { y: -(vh + curve * 3), duration: 0.8, stagger: 0.07, ease: 'power3.inOut' }, 0.22)
    // Hero entrance begins while the last layer is still leaving: one continuous motion.
    .add(finish, 0.62)
})
onBeforeUnmount(() => { if (!done.value) finish() })
</script>

<template>
  <div v-if="!done" ref="root" class="landing-intro fixed inset-0 z-[210] overflow-hidden" role="status" aria-live="polite" aria-label="Loading Plannity">
    <!-- Same layered sweep as the page curtain; the top (purple) one is in front. -->
    <div v-for="(c, i) in COLORS" :key="c" data-layer class="intro-layer" :style="{ background: c, zIndex: i }" />
    <div class="intro-blob intro-blob-a" aria-hidden="true" />
    <div class="intro-blob intro-blob-b" aria-hidden="true" />

    <div data-stage class="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
      <div class="relative grid size-36 place-items-center sm:size-44" aria-hidden="true">
        <!-- Four petals in the brand colours orbit in, then settle around the mark -->
        <span v-for="(p, i) in PETALS" :key="p.c" class="intro-petal" :style="{ '--rot': `${p.r}deg`, '--c': p.c, '--d': `${i * 70}ms` }" />
        <span class="intro-ring" />
        <img src="/brand/logo-mark.png" alt="" width="256" height="256" class="intro-mark relative size-20 drop-shadow-2xl sm:size-24" fetchpriority="high">
      </div>
      <img src="/brand/logo-wordmark-dark.png" alt="Plannity" width="560" height="155" class="intro-word mt-5 h-10 w-auto sm:h-12" fetchpriority="high">
      <p class="intro-tag mt-3 font-display text-base font-semibold text-white/85 sm:text-lg">Less planning. <span class="text-sun">More creating.</span></p>
      <div class="intro-track mt-7 h-1 w-40 overflow-hidden rounded-full bg-white/20 sm:w-48">
        <span data-bar class="intro-bar block h-full origin-left rounded-full bg-white" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Hiding rules for no-JS / reduced motion / hydration fallback live in main.css:
   Vue compiles `:global(html…) .x` in scoped styles to just `html…`, which would hide the whole page. */
.landing-intro { --curve: min(18vh, 160px); background: #6C4CF5; }
.intro-layer {
  position: absolute; left: -15%; width: 130%; top: calc(var(--curve) * -1);
  height: calc(100% + var(--curve) * 2);
  border-radius: 50% / var(--curve);
  backface-visibility: hidden; will-change: transform;
}
.intro-blob { position: absolute; z-index: 5; border-radius: 9999px; filter: blur(60px); opacity: 0.55; pointer-events: none; }
.intro-blob-a { width: 42vmax; height: 42vmax; left: -12vmax; top: -14vmax; background: #FF6FAE; animation: drift 6s ease-in-out infinite alternate; }
.intro-blob-b { width: 36vmax; height: 36vmax; right: -10vmax; bottom: -12vmax; background: #62C5F4; animation: drift 7s ease-in-out infinite alternate-reverse; }

.intro-mark { animation: pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both, bob 2.4s ease-in-out 0.8s infinite; }
.intro-ring {
  position: absolute; inset: 18%; border-radius: 9999px; border: 2px solid rgb(255 255 255 / 0.35);
  animation: ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.15s infinite;
}
.intro-petal {
  position: absolute; left: 50%; top: 50%; width: 22%; height: 22%; margin: -11% 0 0 -11%;
  border-radius: 60% 0 60% 0; background: var(--c); box-shadow: 0 6px 18px rgb(0 0 0 / 0.15);
  animation: orbit 1s cubic-bezier(0.22, 1, 0.36, 1) var(--d) both, spin 9s linear 1s infinite;
}
.intro-word { animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both; }
.intro-tag { animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.45s both; }
.intro-track { animation: rise 0.5s ease-out 0.55s both; }
.intro-bar { transform: scaleX(0); animation: crawl 2.4s cubic-bezier(0.2, 0.7, 0.3, 1) 0.6s forwards; }

@keyframes pop { from { transform: scale(0.3) rotate(-25deg); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes bob { 50% { transform: translateY(-6px) rotate(3deg); } }
@keyframes ring { from { transform: scale(0.7); opacity: 0.9; } to { transform: scale(1.6); opacity: 0; } }
@keyframes orbit {
  from { transform: rotate(calc(var(--rot) - 140deg)) translateY(-260%) scale(0.2); opacity: 0; }
  to { transform: rotate(var(--rot)) translateY(-170%) scale(1); opacity: 1; }
}
@keyframes spin {
  from { transform: rotate(var(--rot)) translateY(-170%); }
  to { transform: rotate(calc(var(--rot) + 360deg)) translateY(-170%); }
}
@keyframes rise { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes crawl { to { transform: scaleX(0.7); } }
@keyframes drift { to { transform: translate(6vmax, 4vmax) scale(1.08); } }
</style>
