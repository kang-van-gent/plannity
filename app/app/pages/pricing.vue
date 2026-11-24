<script setup lang="ts">
import { ArrowRight, CalendarDays, Check, ShieldCheck, WandSparkles, Zap } from '@lucide/vue'
import { gsap } from 'gsap'

const { t, tm, locale } = useLocale()
const config = useRuntimeConfig()
const priceSatang = config.public.creditPriceSatang
const price = computed(() => formatTHB(priceSatang, locale.value))
useSeoMeta({ title: () => t('pricing.seoTitle'), description: () => t('pricing.seoDescription'), ogTitle: () => t('pricing.seoTitle') })

const count = ref(30)
const total = computed(() => count.value * priceSatang)
const shownTotal = ref(total.value)
watch(total, (v) => {
  if (prefersReducedMotion()) { shownTotal.value = v; return }
  const o = { n: shownTotal.value }
  gsap.to(o, { n: v, duration: 0.5, ease: 'power2.out', onUpdate: () => { shownTotal.value = Math.round(o.n / 100) * 100 } })
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:px-8 sm:pt-16" data-parallax-root>
    <Doodle v-parallax="{ y: -120, rotate: 30 }" variant="petal" class="pointer-events-none absolute right-0 top-24 -z-10 size-64 text-pink/40" />
    <div class="text-center">
      <span v-anim class="eyebrow">{{ t('nav.pricing') }}</span>
      <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold sm:text-6xl">{{ t('pricing.title') }}</h1>
      <p v-anim="2" class="mx-auto mt-4 max-w-2xl text-lg text-muted">{{ t('pricing.subtitle', { price }) }}</p>
    </div>

    <div class="mt-12 grid gap-5 md:grid-cols-3">
      <article v-anim="0" class="card card-pad">
        <CalendarDays class="size-8 text-sky" />
        <h2 class="mt-4 text-xl font-bold">{{ t('landing.pricing.calendar.title') }}</h2>
        <p class="mt-1 font-display text-4xl font-bold">{{ t('landing.pricing.free') }}</p>
        <ul class="mt-4 space-y-2 text-sm text-muted">
          <li v-for="(x, i) in tm<string[]>('pricing.freeList')" :key="i" class="flex gap-2"><Check class="mt-0.5 size-4 shrink-0 text-success" />{{ x }}</li>
        </ul>
      </article>
      <article v-anim="1" class="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-pop sm:p-8">
        <WandSparkles class="size-8 text-sun" />
        <h2 class="mt-4 text-xl font-bold">{{ t('landing.pricing.ai.title') }}</h2>
        <p class="mt-1 font-display text-5xl font-bold">{{ price }}<span class="text-lg font-medium text-white/60"> / {{ t('credits.perContent') }}</span></p>
        <ul class="mt-4 space-y-2 text-sm text-white/75">
          <li v-for="(x, i) in tm<string[]>('pricing.aiList')" :key="i" class="flex gap-2"><Check class="mt-0.5 size-4 shrink-0 text-lime" />{{ x }}</li>
        </ul>
      </article>
      <article v-anim="2" class="card card-pad">
        <Zap class="size-8 text-pink" />
        <h2 class="mt-4 text-xl font-bold">{{ t('landing.pricing.trial.title') }}</h2>
        <p class="mt-1 font-display text-4xl font-bold">{{ t('landing.pricing.trial.value', { n: config.public.trialCredits }) }}</p>
        <ul class="mt-4 space-y-2 text-sm text-muted">
          <li v-for="(x, i) in tm<string[]>('pricing.trialList')" :key="i" class="flex gap-2"><Check class="mt-0.5 size-4 shrink-0 text-success" />{{ x }}</li>
        </ul>
      </article>
    </div>

    <section v-anim class="card mt-10 overflow-hidden p-6 sm:p-10">
      <div class="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 class="font-display text-2xl font-bold sm:text-3xl">{{ t('pricing.calcTitle') }}</h2>
          <label for="calc" class="mt-6 flex items-baseline justify-between text-sm font-semibold">
            {{ t('pricing.calcLabel') }}<span class="font-display text-3xl font-bold text-brand-500">{{ count }}</span>
          </label>
          <input id="calc" v-model.number="count" type="range" min="1" max="30" class="mt-3 w-full accent-brand-500">
          <div class="mt-1 flex justify-between text-xs text-muted"><span>1</span><span>30</span></div>
        </div>
        <div class="rounded-3xl bg-gradient-to-br from-brand-500 to-pink p-6 text-white">
          <p class="text-sm text-white/80">{{ t('pricing.calcTotal') }}</p>
          <p class="font-display text-5xl font-bold tabular-nums">{{ formatTHB(shownTotal, locale) }}</p>
          <p class="mt-1 text-sm text-white/80">{{ t('pricing.calcNote', { n: count, price }) }}</p>
          <NuxtLink to="/register" class="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-brand-600">{{ t('landing.hero.cta') }}<ArrowRight class="size-4" /></NuxtLink>
        </div>
      </div>
    </section>

    <section class="mt-10">
      <h2 v-anim class="font-display text-2xl font-bold">{{ t('pricing.packagesTitle') }}</h2>
      <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="(p, i) in CREDIT_PACKAGES" :key="p" v-anim="i" class="card card-pad text-center transition hover:-translate-y-1 hover:shadow-pop">
          <p class="font-display text-4xl font-bold">{{ p }}</p>
          <p class="text-sm text-muted">{{ t('credits.unit') }}</p>
          <p class="mt-3 text-lg font-semibold">{{ formatTHB(p * priceSatang, locale) }}</p>
        </div>
      </div>
      <ul v-anim class="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-2">
        <li v-for="(c, i) in tm<string[]>('landing.pricing.conditions')" :key="i" class="flex gap-2"><ShieldCheck class="mt-0.5 size-4 shrink-0 text-success" />{{ c }}</li>
      </ul>
    </section>
  </div>
</template>
