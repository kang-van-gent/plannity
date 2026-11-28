<script setup lang="ts">
import { Check, Info, Minus, ShieldCheck, Sparkles, Store, WandSparkles } from '@lucide/vue'
import { gsap } from 'gsap'
import type { PlanKey } from '~/types'

// Public pricing (pricing.md v0.2 §2, §7, §10). Numbers come from the shared
// price list; the server applies the same list to every order.
const { t, tm, locale } = useLocale()
const features = useFeatures()
const cfg = DEFAULT_PRICING
const money = (satang: number) => formatTHB(satang, locale.value)
useSeoMeta({ title: () => t('pricing.seoTitle'), description: () => t('pricing.seoDescription'), ogTitle: () => t('pricing.seoTitle'), ogDescription: () => t('pricing.seoDescription') })

// ---- monthly estimate ----------------------------------------------------------
const calc = reactive({ brands: 3, ai: 30, briefs: 0, team: true })
function monthly(k: PlanKey): number | null {
  if (calc.team && !cfg.plans[k].collaboration) return null
  const inc = cfg.plans[k].includedBrands
  const extra = inc === null ? 0 : Math.max(0, calc.brands - inc)
  return cfg.plans[k].monthlySatang + extra * cfg.additionalBrandMonthlySatang + calc.ai * cfg.aiContentCreditSatang + calc.briefs * cfg.aiBriefCreditSatang
}
const best = computed<PlanKey>(() => PLAN_KEYS.filter((k) => monthly(k) !== null).sort((a, b) => monthly(a)! - monthly(b)!)[0] ?? 'studio')
const total = computed(() => monthly(best.value) ?? 0)
const extraBrands = computed(() => (cfg.plans[best.value].includedBrands === null ? 0 : Math.max(0, calc.brands - cfg.plans[best.value].includedBrands!)))
const shown = ref(total.value)
watch(total, (v) => {
  if (prefersReducedMotion()) { shown.value = v; return }
  const o = { n: shown.value }
  gsap.to(o, { n: v, duration: 0.5, ease: 'power2.out', onUpdate: () => { shown.value = Math.round(o.n / 100) * 100 } })
})

// ---- comparison table (pricing.md §2) ------------------------------------------
type Cell = string | boolean
const rows = computed<{ key: string; cells: [Cell, Cell, Cell] }[]>(() => [
  { key: 'price', cells: [t('pricing.free'), `${money(cfg.plans.team.monthlySatang)}${t('plan.perMonth')}`, `${money(cfg.plans.studio.monthlySatang)}${t('plan.perMonth')}`] },
  { key: 'brands', cells: ['2', '2', t('pricing.unlimited')] },
  { key: 'addBrand', cells: [t('pricing.perMonthEach', { price: money(cfg.additionalBrandMonthlySatang) }), t('pricing.perMonthEach', { price: money(cfg.additionalBrandMonthlySatang) }), t('pricing.notNeeded')] },
  { key: 'members', cells: ['1', '5', '10'] },
  { key: 'invite', cells: [false, true, true] },
  { key: 'roles', cells: [t('pricing.ownerOnly'), true, true] },
  { key: 'calendar', cells: [true, true, true] },
  { key: 'images', cells: [true, true, true] },
  { key: 'preview', cells: [true, true, true] },
  { key: 'brief', cells: [t('pricing.free'), t('pricing.free'), t('pricing.free')] },
  { key: 'positions', cells: [false, true, true] },
  { key: 'tasks', cells: [false, true, true] },
  { key: 'aiContent', cells: Array(3).fill(t('pricing.perItem', { price: money(cfg.aiContentCreditSatang) })) as [Cell, Cell, Cell] },
  { key: 'aiBrief', cells: Array(3).fill(t('pricing.perItem', { price: money(cfg.aiBriefCreditSatang) })) as [Cell, Cell, Cell] },
  { key: 'autopost', cells: [false, false, false] },
])
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 pb-10 pt-10 sm:px-8 sm:pt-16" data-parallax-root>
    <Doodle v-parallax="{ y: -120, rotate: 30 }" variant="petal" class="pointer-events-none absolute right-0 top-24 -z-10 size-64 text-pink/40" />
    <div class="text-center">
      <span v-anim class="eyebrow">{{ t('nav.pricing') }}</span>
      <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold sm:text-6xl">{{ t('pricing.title') }}</h1>
      <p v-anim="2" class="mx-auto mt-4 max-w-2xl text-lg text-muted">{{ t('pricing.subtitle') }}</p>
    </div>

    <div class="mt-12"><BillingPlanCards /></div>
    <p v-anim class="mt-6 text-center text-sm text-muted">{{ t('plan.sharedNote', { price: money(cfg.aiContentCreditSatang), addon: money(cfg.additionalBrandMonthlySatang) }) }}</p>

    <!-- AI credits: separate from plans, on every plan -->
    <section v-anim class="mt-12 grid items-center gap-6 rounded-[2rem] bg-surface-2 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <span class="eyebrow"><WandSparkles class="size-3.5" />AI</span>
        <h2 class="mt-3 font-display text-2xl font-bold sm:text-3xl">{{ t('pricing.aiTitle') }}</h2>
        <p class="mt-2 text-muted">{{ t('pricing.aiBody') }}</p>
        <p v-if="!features.aiGenerate" class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sun/20 px-3 py-1 text-xs font-bold text-amber-700 dark:text-sun"><Sparkles class="size-3.5" />{{ t('pricing.aiSoon') }}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="card card-pad text-center">
          <p class="text-sm font-semibold text-muted">{{ t('pricing.aiContent') }}</p>
          <p class="mt-1 font-display text-4xl font-bold">{{ money(cfg.aiContentCreditSatang) }}</p>
          <p class="text-sm text-muted">{{ t('pricing.perPiece') }}</p>
        </div>
        <div class="card card-pad text-center">
          <p class="text-sm font-semibold text-muted">{{ t('pricing.aiBrief') }}</p>
          <p class="mt-1 font-display text-4xl font-bold">{{ money(cfg.aiBriefCreditSatang) }}</p>
          <p class="text-sm text-muted">{{ t('pricing.perBrief') }}</p>
        </div>
      </div>
    </section>

    <!-- Monthly estimate -->
    <section v-anim class="card mt-10 overflow-hidden p-6 sm:p-10">
      <div class="grid items-center gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div class="space-y-5">
          <h2 class="font-display text-2xl font-bold sm:text-3xl">{{ t('pricing.calcTitle') }}</h2>
          <div v-for="f in ([['brands', 1, 15], ['ai', 0, 100], ['briefs', 0, 100]] as const)" :key="f[0]">
            <label :for="`calc-${f[0]}`" class="flex items-baseline justify-between text-sm font-semibold">
              {{ t(`pricing.calc${f[0] === 'brands' ? 'Brands' : f[0] === 'ai' ? 'Ai' : 'Briefs'}`) }}<span class="font-display text-2xl font-bold text-brand-500">{{ calc[f[0]] }}</span>
            </label>
            <input :id="`calc-${f[0]}`" v-model.number="calc[f[0]]" type="range" :min="f[1]" :max="f[2]" class="mt-2 w-full accent-brand-500">
          </div>
          <label class="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm font-semibold">
            <input v-model="calc.team" type="checkbox" class="size-5 accent-brand-500">{{ t('pricing.calcTeam') }}
          </label>
        </div>
        <div class="rounded-3xl bg-gradient-to-br from-brand-500 to-pink p-6 text-white" aria-live="polite">
          <p class="text-sm text-white/80">{{ t('pricing.calcTotal') }}</p>
          <p class="font-display text-5xl font-bold tabular-nums">{{ money(shown) }}</p>
          <p class="mt-2 inline-flex rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{{ t('pricing.calcBest', { plan: t(`plan.names.${best}`) }) }}</p>
          <p class="mt-3 text-sm text-white/85">{{ t('pricing.calcBreakdown', {
            plan: t(`plan.names.${best}`), planPrice: money(cfg.plans[best].monthlySatang), n: extraBrands,
            addons: money(extraBrands * cfg.additionalBrandMonthlySatang), ai: money((calc.ai * cfg.aiContentCreditSatang) + (calc.briefs * cfg.aiBriefCreditSatang)),
          }) }}</p>
          <p class="mt-1 text-xs text-white/70">{{ t('pricing.beforeTax') }}</p>
          <NuxtLink to="/register" class="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-brand-600">{{ t(`plan.ctas.${best}`) }}</NuxtLink>
        </div>
      </div>
    </section>

    <!-- Compare -->
    <section class="mt-12">
      <h2 v-anim class="font-display text-2xl font-bold sm:text-3xl">{{ t('pricing.compareTitle') }}</h2>
      <div v-anim class="card mt-5 overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead>
            <tr class="border-b border-line text-left">
              <th class="p-4 font-semibold text-muted" scope="col"><span class="sr-only">{{ t('pricing.compareTitle') }}</span></th>
              <th v-for="k in PLAN_KEYS" :key="k" scope="col" class="p-4 text-center font-display text-lg font-bold" :class="k === 'team' && 'bg-brand-500/5'">{{ t(`plan.names.${k}`) }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="r in rows" :key="r.key">
              <th scope="row" class="p-4 text-left font-medium">{{ t(`pricing.rows.${r.key}`) }}</th>
              <td v-for="(c, i) in r.cells" :key="i" class="p-4 text-center" :class="i === 1 && 'bg-brand-500/5'">
                <Check v-if="c === true" class="mx-auto size-5 text-success" :aria-label="t('pricing.yes')" />
                <Minus v-else-if="c === false" class="mx-auto size-5 text-muted/60" :aria-label="t('pricing.no')" />
                <span v-else class="font-semibold">{{ c }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-anim class="mt-5 flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
        <Store class="mt-0.5 size-4 shrink-0 text-sky" /><span>{{ t('plan.addonBody', { price: money(cfg.additionalBrandMonthlySatang) }) }}</span>
      </div>
      <ul v-anim class="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-2">
        <li v-for="(c, i) in tm<string[]>('pricing.notes')" :key="i" class="flex gap-2"><ShieldCheck class="mt-0.5 size-4 shrink-0 text-success" />{{ c }}</li>
      </ul>
      <p v-anim class="mt-4 flex items-start gap-2 text-xs text-muted"><Info class="mt-0.5 size-3.5 shrink-0" />{{ t('plan.billingNote') }}</p>
    </section>
  </div>
</template>
