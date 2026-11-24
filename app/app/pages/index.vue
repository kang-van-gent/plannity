<script setup lang="ts">
import {
  ArrowRight, CalendarCheck, CalendarDays, Check, ChevronDown, Image, Layers, Lightbulb, Megaphone, MousePointerClick,
  Puzzle, Repeat2, ShieldCheck, Store, Target, Type, WandSparkles, Zap,
} from '@lucide/vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const { t, tm, locale } = useLocale()
const config = useRuntimeConfig()
const price = computed(() => formatTHB(config.public.creditPriceSatang, locale.value))

useSeoMeta({
  title: () => t('landing.seoTitle'),
  description: () => t('landing.seoDescription'),
  ogTitle: () => t('landing.seoTitle'),
  ogDescription: () => t('landing.seoDescription'),
})

const pains = computed(() => [
  { icon: Lightbulb, color: '#FFB23F', key: 'ideas' },
  { icon: Layers, color: '#FF6FAE', key: 'brands' },
  { icon: Repeat2, color: '#62C5F4', key: 'repeat' },
  { icon: Puzzle, color: '#A7E66B', key: 'briefs' },
])
const steps = computed(() => [
  { icon: Store, color: '#6C4CF5', key: 'brand' },
  { icon: Target, color: '#FF6FAE', key: 'goal' },
  { icon: WandSparkles, color: '#FFB23F', key: 'plan' },
  { icon: CalendarDays, color: '#62C5F4', key: 'calendar' },
])
const deliverables = computed(() => [
  { icon: Zap, key: 'hook' }, { icon: Lightbulb, key: 'concept' }, { icon: Type, key: 'caption' },
  { icon: MousePointerClick, key: 'cta' }, { icon: Image, key: 'brief' }, { icon: Layers, key: 'pillar' }, { icon: CalendarCheck, key: 'date' },
])
const faqs = computed(() => tm<{ q: string; a: string }[]>('landing.faq.items'))
const openFaq = ref<number | null>(0)
const ctaWords = computed(() => t('landing.final.title').split(' '))
const marquee = computed(() => deliverables.value.map((d) => t(`landing.deliverables.items.${d.key}.title`)))

// Fictional preview data for the hero mock-up (labelled as sample).
const previewDays = Array.from({ length: 35 }, (_, i) => i - 1)
const previewChips: Record<number, { c: string; w: string }[]> = {
  2: [{ c: '#6C4CF5', w: '70%' }], 4: [{ c: '#FF6FAE', w: '85%' }, { c: '#62C5F4', w: '50%' }], 8: [{ c: '#FFB23F', w: '75%' }],
  10: [{ c: '#A7E66B', w: '60%' }], 12: [{ c: '#6C4CF5', w: '90%' }], 15: [{ c: '#FF6FAE', w: '65%' }], 17: [{ c: '#62C5F4', w: '80%' }, { c: '#FFB23F', w: '55%' }],
  19: [{ c: '#6C4CF5', w: '70%' }], 22: [{ c: '#A7E66B', w: '85%' }], 24: [{ c: '#FF6FAE', w: '60%' }], 26: [{ c: '#FFB23F', w: '75%' }], 29: [{ c: '#6C4CF5', w: '65%' }],
}

const root = ref<HTMLElement | null>(null)
let ctx: gsap.Context | null = null
let mm: gsap.MatchMedia | null = null

function toggleFaq(i: number, e: MouseEvent) {
  const panel = (e.currentTarget as HTMLElement).nextElementSibling as HTMLElement | null
  const prev = openFaq.value
  openFaq.value = prev === i ? null : i
  if (!panel || prefersReducedMotion()) return
  nextTick(() => {
    if (openFaq.value === i) gsap.fromTo(panel, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.45, ease: 'power3.out' })
  })
}

onMounted(() => {
  if (!root.value) return
  ctx = gsap.context(() => {
    // Hero underline doodle draws itself.
    const underline = root.value!.querySelector<SVGPathElement>('[data-underline] path')
    if (underline && !prefersReducedMotion()) {
      const len = underline.getTotalLength()
      gsap.fromTo(underline, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.1, delay: 0.7, ease: 'power2.inOut' })
    }
  }, root.value)

  mm = gsap.matchMedia()
  mm.add({ motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 1024px)' }, (c) => {
    const { motion, desktop } = c.conditions as { motion: boolean; desktop: boolean }
    if (!motion) return
    const q = gsap.utils.selector(root.value)

    // Product preview flattens and grows into place as you scroll (scrub).
    gsap.fromTo(q('[data-preview]'), { rotateX: 18, scale: 0.88, y: 40 }, {
      rotateX: 0, scale: 1, y: 0, ease: 'none',
      scrollTrigger: { trigger: q('[data-preview-wrap]')[0], start: 'top 85%', end: 'top 15%', scrub: true },
    })

    // Marquee rows drift in opposite directions with scroll.
    gsap.to(q('[data-marquee="a"]'), { xPercent: -30, ease: 'none', scrollTrigger: { trigger: q('[data-marquee-wrap]')[0], start: 'top bottom', end: 'bottom top', scrub: true } })
    gsap.fromTo(q('[data-marquee="b"]'), { xPercent: -30 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: q('[data-marquee-wrap]')[0], start: 'top bottom', end: 'bottom top', scrub: true } })

    // Pain cards settle from tilted stickers into a tidy grid.
    q('[data-pain]').forEach((el, i) => {
      gsap.fromTo(el, { rotate: i % 2 ? 7 : -7, y: 90 + i * 25 }, {
        rotate: 0, y: 0, ease: 'none',
        scrollTrigger: { trigger: q('[data-pains]')[0], start: 'top 95%', end: 'top 35%', scrub: true },
      })
    })

    // How it works: pinned horizontal track on desktop, line fill on mobile.
    const track = q('[data-how-track]')[0] as HTMLElement | undefined
    const pin = q('[data-how-pin]')[0] as HTMLElement | undefined
    if (track && pin && desktop) {
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth)
      const st = { trigger: pin, start: 'top top+=72', end: () => `+=${distance()}`, scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true }
      gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: st })
      gsap.fromTo(q('[data-how-progress]'), { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { ...st, pin: false } })
    } else {
      gsap.fromTo(q('[data-how-line]'), { scaleY: 0 }, { scaleY: 1, ease: 'none', transformOrigin: 'top', scrollTrigger: { trigger: track, start: 'top 70%', end: 'bottom 60%', scrub: true } })
    }

    // Deliverables light up one by one while the sample card highlights the matching field.
    const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-deliver]')[0], start: 'top 65%', end: 'bottom 70%', scrub: true } })
    q('[data-deliver-item]').forEach((el, i) => {
      tl.fromTo(el, { opacity: 0.28, x: 18 }, { opacity: 1, x: 0, duration: 1 }, i)
      const field = q(`[data-field="${(el as HTMLElement).dataset.deliverItem}"]`)
      if (field.length) tl.fromTo(field, { backgroundColor: 'rgba(108,76,245,0)' }, { backgroundColor: 'rgba(108,76,245,0.12)', duration: 0.5, yoyo: true, repeat: 1 }, i)
    })

    // Pricing: the middle card rises above its neighbours.
    gsap.fromTo(q('[data-price-hero]'), { y: 40, scale: 0.96 }, { y: -12, scale: 1.03, ease: 'none', scrollTrigger: { trigger: q('[data-pricing]')[0], start: 'top 90%', end: 'center 50%', scrub: true } })

    // Upstify: circular reveal of the dark panel.
    gsap.fromTo(q('[data-upstify]'), { clipPath: 'circle(12% at 50% 60%)' }, { clipPath: 'circle(85% at 50% 50%)', ease: 'none', scrollTrigger: { trigger: q('[data-upstify]')[0], start: 'top 95%', end: 'top 25%', scrub: true } })

    // Final CTA: words fill in as you scroll.
    gsap.fromTo(q('[data-word]'), { opacity: 0.12, y: 20 }, { opacity: 1, y: 0, stagger: 0.25, ease: 'none', scrollTrigger: { trigger: q('[data-final]')[0], start: 'top 80%', end: 'top 30%', scrub: true } })
  })
  requestAnimationFrame(() => ScrollTrigger.refresh())
})

onBeforeUnmount(() => {
  mm?.revert()
  ctx?.revert()
})
</script>

<template>
  <div ref="root">
    <!-- HERO -->
    <section class="relative px-5 pb-10 pt-10 sm:px-8 sm:pt-16" data-parallax-root>
      <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div class="absolute inset-0 bg-dots opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <Doodle v-parallax="{ y: -160, rotate: 40 }" variant="petal" class="absolute -left-16 top-24 size-56 text-pink/70 sm:size-72" />
        <Doodle v-parallax="{ y: -90, rotate: -30 }" variant="petal" class="absolute right-[-4rem] top-8 size-64 text-sun/70 sm:size-80" />
        <Doodle v-parallax="{ y: -220, rotate: 25 }" variant="petal" class="absolute bottom-10 left-[12%] size-36 text-sky/60" />
        <Doodle v-parallax="{ y: -120, rotate: -45 }" variant="petal" class="absolute bottom-24 right-[18%] size-28 text-lime/70" />
      </div>
      <div class="mx-auto max-w-5xl text-center">
        <span v-anim="{ from: 'pop' }" class="eyebrow"><Doodle variant="spark" class="size-3.5" />{{ t('landing.hero.eyebrow') }}</span>
        <h1 class="mt-6 font-display text-[2.6rem] font-bold leading-[1.08] sm:text-6xl lg:text-7xl">
          <span v-anim="1" class="block">{{ t('landing.hero.title1') }}</span>
          <span v-anim="2" class="relative inline-block text-gradient">
            {{ t('landing.hero.title2') }}
            <Doodle data-underline variant="underline" class="absolute -bottom-3 left-0 h-4 w-full text-sun sm:-bottom-4" />
          </span>
        </h1>
        <p v-anim="3" class="mx-auto mt-8 max-w-2xl text-lg text-muted sm:text-xl">{{ t('landing.hero.subtitle', { price }) }}</p>
        <div v-anim="4" class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <NuxtLink to="/register" class="btn-primary btn-lg group">{{ t('landing.hero.cta') }}<ArrowRight class="size-5 transition group-hover:translate-x-1" /></NuxtLink>
          <NuxtLink to="/#how" class="btn-secondary btn-lg">{{ t('landing.hero.secondary') }}</NuxtLink>
        </div>
        <p v-anim="5" class="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted">
          <span v-for="k in ['trial', 'noSub', 'calendarFree']" :key="k" class="inline-flex items-center gap-1.5"><Check class="size-4 text-success" />{{ t(`landing.hero.points.${k}`, { n: config.public.trialCredits }) }}</span>
        </p>
      </div>

      <!-- Product preview (sample data) -->
      <div data-preview-wrap class="relative mx-auto mt-14 max-w-6xl [perspective:1400px]">
        <div data-preview class="relative rounded-[2rem] border border-line bg-surface p-3 shadow-[0_40px_120px_-40px_rgba(108,76,245,0.55)] sm:p-4 [transform-style:preserve-3d]">
          <div class="flex items-center gap-2 px-2 pb-3">
            <span class="size-3 rounded-full bg-pink" /><span class="size-3 rounded-full bg-sun" /><span class="size-3 rounded-full bg-lime" />
            <span class="ml-3 rounded-full bg-sun/20 px-3 py-1 text-[11px] font-bold text-amber-700 dark:text-sun">{{ t('landing.preview.sample') }}</span>
          </div>
          <div class="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div class="rounded-3xl bg-surface-2 p-4">
              <div class="mb-3 flex items-center justify-between">
                <p class="font-display text-lg font-bold">{{ t('landing.preview.month') }}</p>
                <div class="flex gap-1.5"><span class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">{{ t('calendar.month') }}</span><span class="chip bg-surface text-muted">{{ t('calendar.list') }}</span></div>
              </div>
              <div class="grid grid-cols-7 gap-1.5 text-[10px] sm:text-xs">
                <div v-for="d in previewDays" :key="d" class="aspect-[1/0.9] rounded-xl bg-surface p-1.5" :class="d < 1 || d > 31 ? 'opacity-40' : ''">
                  <span class="font-semibold text-muted">{{ d < 1 ? 30 + d : d > 31 ? d - 31 : d }}</span>
                  <div class="mt-1 space-y-1">
                    <span v-for="(c, i) in previewChips[d] ?? []" :key="i" class="block h-1.5 rounded-full sm:h-2" :style="{ background: c.c, width: c.w }" />
                  </div>
                </div>
              </div>
            </div>
            <div class="rounded-3xl border border-line bg-surface p-4">
              <div class="flex items-center gap-2"><UiPlatformBadge platform="instagram" /><span class="chip bg-pink/15 text-pink">Education</span><UiStatusBadge status="approved" class="ml-auto" small /></div>
              <p class="mt-3 font-display text-lg font-bold leading-snug">{{ t('landing.preview.title') }}</p>
              <dl class="mt-3 space-y-2 text-sm">
                <div data-field="hook" class="rounded-xl p-2 transition"><dt class="text-[11px] font-bold uppercase tracking-wider text-muted">Hook</dt><dd>{{ t('landing.preview.hook') }}</dd></div>
                <div data-field="caption" class="rounded-xl p-2 transition"><dt class="text-[11px] font-bold uppercase tracking-wider text-muted">Caption</dt><dd class="line-clamp-2">{{ t('landing.preview.caption') }}</dd></div>
                <div data-field="cta" class="rounded-xl p-2 transition"><dt class="text-[11px] font-bold uppercase tracking-wider text-muted">CTA</dt><dd>{{ t('landing.preview.cta') }}</dd></div>
              </dl>
            </div>
          </div>
        </div>
        <div v-parallax="-70" class="absolute -left-4 top-1/3 hidden rotate-[-6deg] rounded-2xl border border-line bg-surface px-4 py-3 shadow-pop md:block">
          <p class="text-xs text-muted">{{ t('landing.preview.floatA') }}</p>
          <p class="font-display text-xl font-bold text-brand-500">30 / 30 ✓</p>
        </div>
        <div v-parallax="-130" class="absolute -right-3 bottom-10 hidden rotate-[5deg] rounded-2xl bg-ink px-4 py-3 text-white shadow-pop md:block">
          <p class="text-xs text-white/70">{{ t('landing.preview.floatB') }}</p>
          <p class="font-display text-xl font-bold">{{ price }} <span class="text-sm font-medium text-white/70">/ {{ t('credits.perContent') }}</span></p>
        </div>
      </div>
    </section>

    <!-- MARQUEE -->
    <section data-marquee-wrap class="relative my-16 -rotate-2 overflow-hidden border-y border-line bg-brand-500 py-4 text-white" aria-hidden="true">
      <div data-marquee="a" class="flex w-max gap-8 whitespace-nowrap font-display text-2xl font-bold sm:text-3xl">
        <span v-for="n in 3" :key="n" class="flex gap-8"><span v-for="m in marquee" :key="m" class="flex items-center gap-8">{{ m }}<Doodle variant="spark" class="size-5 text-sun" /></span></span>
      </div>
      <div data-marquee="b" class="mt-3 flex w-max gap-8 whitespace-nowrap font-display text-2xl font-bold text-white/45 sm:text-3xl">
        <span v-for="n in 3" :key="n" class="flex gap-8"><span v-for="m in marquee" :key="m" class="flex items-center gap-8">{{ m }}<Doodle variant="spark" class="size-5 text-pink" /></span></span>
      </div>
    </section>

    <!-- PAIN POINTS -->
    <section class="mx-auto max-w-7xl px-5 py-16 sm:px-8">
      <div class="max-w-2xl">
        <span v-anim class="eyebrow">{{ t('landing.pains.eyebrow') }}</span>
        <h2 v-anim="1" class="section-title mt-4">{{ t('landing.pains.title') }}</h2>
      </div>
      <div data-pains class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <article v-for="p in pains" :key="p.key" data-pain class="card card-pad relative overflow-hidden">
          <span class="absolute -right-6 -top-6 size-24 rounded-full opacity-30" :style="{ background: p.color }" />
          <span class="relative grid size-12 place-items-center rounded-2xl" :style="{ background: `${p.color}26`, color: p.color }"><component :is="p.icon" class="size-6" /></span>
          <h3 class="relative mt-4 text-xl font-bold">{{ t(`landing.pains.items.${p.key}.title`) }}</h3>
          <p class="relative mt-2 text-sm text-muted">{{ t(`landing.pains.items.${p.key}.body`) }}</p>
        </article>
      </div>
    </section>

    <!-- HOW IT WORKS -->
    <section id="how" class="scroll-mt-24 py-16">
      <div class="mx-auto max-w-7xl px-5 sm:px-8">
        <span v-anim class="eyebrow">{{ t('landing.how.eyebrow') }}</span>
        <h2 v-anim="1" class="section-title mt-4 max-w-3xl">{{ t('landing.how.title') }}</h2>
      </div>
      <div data-how-pin class="relative mt-10 overflow-hidden lg:h-[calc(100dvh-72px)] lg:max-h-[640px]">
        <div data-how-track class="relative flex flex-col gap-5 px-5 sm:px-8 lg:h-full lg:w-max lg:flex-row lg:items-center lg:gap-8 lg:px-[max(2rem,calc((100vw-80rem)/2+2rem))]">
          <span data-how-line class="absolute bottom-8 left-[2.6rem] top-8 w-1 origin-top rounded-full bg-gradient-to-b from-brand-500 via-pink to-sun sm:left-[3.35rem] lg:hidden" />
          <article v-for="(s, i) in steps" :key="s.key" class="card relative ml-10 p-6 sm:ml-12 lg:ml-0 lg:h-[26rem] lg:w-[28rem] lg:p-8">
            <span class="absolute -left-[3.05rem] top-6 grid size-9 place-items-center rounded-full font-display font-bold text-white ring-4 ring-bg sm:-left-[3.4rem] lg:static lg:size-12 lg:text-xl" :style="{ background: s.color }">{{ i + 1 }}</span>
            <span class="mt-0 grid size-14 place-items-center rounded-3xl lg:mt-8" :style="{ background: `${s.color}22`, color: s.color }"><component :is="s.icon" class="size-7" /></span>
            <h3 class="mt-5 text-2xl font-bold lg:text-3xl">{{ t(`landing.how.steps.${s.key}.title`) }}</h3>
            <p class="mt-2 text-muted lg:text-lg">{{ t(`landing.how.steps.${s.key}.body`) }}</p>
          </article>
          <article class="ml-10 flex flex-col justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-pink p-8 text-white sm:ml-12 lg:ml-0 lg:h-[26rem] lg:w-[24rem]">
            <Doodle variant="spark" class="size-10 text-sun" />
            <p class="mt-4 font-display text-3xl font-bold">{{ t('landing.how.done') }}</p>
            <NuxtLink to="/register" class="mt-6 inline-flex w-fit items-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-brand-600">{{ t('landing.hero.cta') }}<ArrowRight class="size-4" /></NuxtLink>
          </article>
        </div>
        <div class="absolute inset-x-0 bottom-4 hidden px-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:block">
          <div class="h-1.5 overflow-hidden rounded-full bg-line"><div data-how-progress class="h-full origin-left rounded-full bg-gradient-to-r from-brand-500 via-pink to-sun" /></div>
        </div>
      </div>
    </section>

    <!-- DELIVERABLES -->
    <section data-deliver class="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
      <div class="lg:sticky lg:top-28">
        <span v-anim class="eyebrow">{{ t('landing.deliverables.eyebrow') }}</span>
        <h2 v-anim="1" class="section-title mt-4">{{ t('landing.deliverables.title') }}</h2>
        <p v-anim="2" class="mt-4 text-lg text-muted">{{ t('landing.deliverables.body') }}</p>
      </div>
      <ul class="space-y-3">
        <li v-for="d in deliverables" :key="d.key" :data-deliver-item="d.key" class="card flex items-start gap-4 p-4 sm:p-5">
          <span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-500"><component :is="d.icon" class="size-5" /></span>
          <div>
            <p class="font-display text-lg font-bold">{{ t(`landing.deliverables.items.${d.key}.title`) }}</p>
            <p class="text-sm text-muted">{{ t(`landing.deliverables.items.${d.key}.body`) }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- PRICING -->
    <section id="pricing" data-pricing class="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 sm:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <span v-anim class="eyebrow">{{ t('landing.pricing.eyebrow') }}</span>
        <h2 v-anim="1" class="section-title mt-4">{{ t('landing.pricing.title') }}</h2>
      </div>
      <div class="mt-12 grid items-center gap-5 md:grid-cols-3">
        <article v-anim="0" class="card card-pad">
          <CalendarDays class="size-8 text-sky" />
          <p class="mt-4 font-display text-xl font-bold">{{ t('landing.pricing.calendar.title') }}</p>
          <p class="mt-1 font-display text-4xl font-bold">{{ t('landing.pricing.free') }}</p>
          <p class="mt-3 text-sm text-muted">{{ t('landing.pricing.calendar.body') }}</p>
        </article>
        <article data-price-hero class="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-pop sm:p-8">
          <Doodle variant="burst" class="absolute right-5 top-4 size-10 text-sun" />
          <WandSparkles class="size-8 text-sun" />
          <p class="mt-4 font-display text-xl font-bold">{{ t('landing.pricing.ai.title') }}</p>
          <p class="mt-1 font-display text-5xl font-bold">{{ price }}<span class="text-lg font-medium text-white/60"> / {{ t('credits.perContent') }}</span></p>
          <p class="mt-3 text-sm text-white/70">{{ t('landing.pricing.ai.body') }}</p>
          <NuxtLink to="/pricing" class="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-ink">{{ t('landing.pricing.details') }}<ArrowRight class="size-4" /></NuxtLink>
        </article>
        <article v-anim="2" class="card card-pad">
          <Zap class="size-8 text-pink" />
          <p class="mt-4 font-display text-xl font-bold">{{ t('landing.pricing.trial.title') }}</p>
          <p class="mt-1 font-display text-4xl font-bold">{{ t('landing.pricing.trial.value', { n: config.public.trialCredits }) }}</p>
          <p class="mt-3 text-sm text-muted">{{ t('landing.pricing.trial.body') }}</p>
        </article>
      </div>
      <ul v-anim class="mx-auto mt-8 grid max-w-4xl gap-2 text-sm text-muted sm:grid-cols-2">
        <li v-for="(c, i) in tm<string[]>('landing.pricing.conditions')" :key="i" class="flex gap-2"><ShieldCheck class="mt-0.5 size-4 shrink-0 text-success" />{{ c }}</li>
      </ul>
    </section>

    <!-- UPSTIFY -->
    <section id="upstify" class="scroll-mt-24 px-3 py-16 sm:px-6">
      <div data-upstify class="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-ink px-6 py-16 text-white sm:px-12">
        <div class="absolute -right-24 -top-24 size-80 rounded-full bg-brand-500/50 blur-3xl" />
        <div class="absolute -bottom-24 -left-10 size-72 rounded-full bg-pink/40 blur-3xl" />
        <div class="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <span class="eyebrow bg-white/10 text-sun"><Megaphone class="size-3.5" />Upstify</span>
            <h2 class="mt-4 font-display text-3xl font-bold sm:text-5xl">{{ t('landing.upstify.title') }}</h2>
            <p class="mt-4 max-w-xl text-lg text-white/75">{{ t('landing.upstify.body') }}</p>
          </div>
          <ul class="space-y-3">
            <li v-for="(c, i) in tm<string[]>('landing.upstify.points')" :key="i" class="flex gap-3 rounded-2xl bg-white/8 p-4 backdrop-blur"><Check class="mt-0.5 size-5 shrink-0 text-lime" /><span>{{ c }}</span></li>
            <li class="rounded-2xl border border-white/15 p-4 text-sm text-white/70">{{ t('landing.upstify.disclaimer') }}</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="mx-auto max-w-3xl scroll-mt-24 px-5 py-16 sm:px-8">
      <h2 v-anim class="section-title text-center">{{ t('landing.faq.title') }}</h2>
      <div class="mt-10 space-y-3">
        <div v-for="(f, i) in faqs" :key="i" v-anim="i" class="card overflow-hidden">
          <button type="button" class="flex w-full items-center gap-4 px-5 py-4 text-left font-display text-lg font-semibold" :aria-expanded="openFaq === i" @click="toggleFaq(i, $event)">
            <span class="flex-1">{{ f.q }}</span>
            <ChevronDown class="size-5 shrink-0 text-muted transition-transform duration-300" :class="openFaq === i ? 'rotate-180 text-brand-500' : ''" />
          </button>
          <div v-show="openFaq === i" class="overflow-hidden">
            <p class="px-5 pb-5 text-muted">{{ f.a }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- FINAL CTA -->
    <section data-final class="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
      <p class="font-display text-5xl font-bold leading-tight sm:text-7xl">
        <span v-for="(w, i) in ctaWords" :key="i" data-word class="inline-block pr-[0.25em]" :class="i >= 2 ? 'text-brand-500' : ''">{{ w }}</span>
      </p>
      <p v-anim class="mx-auto mt-6 max-w-xl text-lg text-muted">{{ t('landing.final.body') }}</p>
      <NuxtLink v-anim="1" to="/register" class="btn-primary btn-lg mt-8">{{ t('landing.hero.cta') }}<ArrowRight class="size-5" /></NuxtLink>
    </section>
  </div>
</template>
