<script setup lang="ts">
import { ArrowRight, Check, Crown, Sparkles, Users } from '@lucide/vue'
import type { PlanKey, PricingConfig } from '~/types'

/**
 * Solo / Team / Studio cards (pricing.md §2–3, §10). Public pages link to
 * sign-up; inside the app each paid card buys / renews / switches the plan.
 * Prices come from the server's config when available (`pricing`).
 */
const props = withDefaults(defineProps<{
  pricing?: PricingConfig
  mode?: 'public' | 'app'
  current?: PlanKey
  busy?: PlanKey | null
}>(), { mode: 'public', current: undefined, busy: null })
const emit = defineEmits<{ choose: [Exclude<PlanKey, 'solo'>] }>()
const { t, tm, locale } = useLocale()

const cfg = computed(() => props.pricing ?? DEFAULT_PRICING)
const ICON = { solo: Sparkles, team: Users, studio: Crown } as const
const rank = (k: PlanKey) => PLAN_KEYS.indexOf(k)
const addon = computed(() => formatTHB(cfg.value.additionalBrandMonthlySatang, locale.value))
const price = (k: PlanKey) => formatTHB(cfg.value.plans[k].monthlySatang, locale.value)

function cta(k: PlanKey): string {
  if (props.mode === 'public') return t(`plan.ctas.${k}`)
  if (k === props.current) return t('plan.renew')
  return rank(k) > rank(props.current ?? 'solo') ? t('plan.upgrade', { plan: t(`plan.names.${k}`) }) : t('plan.downgrade', { plan: t(`plan.names.${k}`) })
}
</script>

<template>
  <div class="grid items-stretch gap-5 md:grid-cols-3">
    <article v-for="(k, i) in PLAN_KEYS" :key="k" v-anim="i"
      class="relative flex flex-col overflow-hidden rounded-3xl p-6 sm:p-7"
      :class="k === 'team' ? 'bg-ink text-white shadow-pop md:-my-3 md:py-9' : 'card'">
      <Doodle v-if="k === 'team'" variant="burst" class="absolute right-5 top-4 size-10 text-sun" />
      <div class="flex items-center gap-2">
        <component :is="ICON[k]" class="size-7" :class="k === 'team' ? 'text-sun' : k === 'studio' ? 'text-pink' : 'text-sky'" />
        <span v-if="mode === 'app' && current === k" class="chip ml-auto py-0.5 text-xs" :class="k === 'team' ? 'bg-white/15 text-white' : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'">{{ t('plan.currentBadge') }}</span>
        <span v-else-if="k === 'team'" class="chip ml-auto mr-10 bg-sun/20 py-0.5 text-xs text-sun">{{ t('plan.popular') }}</span>
      </div>
      <h3 class="mt-4 font-display text-2xl font-bold">{{ t(`plan.names.${k}`) }}</h3>
      <p class="mt-1 font-display text-4xl font-bold tabular-nums">
        {{ cfg.plans[k].monthlySatang ? price(k) : t('pricing.free') }}<span v-if="cfg.plans[k].monthlySatang" class="text-base font-medium opacity-60">{{ t('plan.perMonth') }}</span>
      </p>
      <p class="mt-3 text-sm" :class="k === 'team' ? 'text-white/75' : 'text-muted'">{{ t(`plan.taglines.${k}`) }}</p>
      <ul class="mt-5 flex-1 space-y-2.5 text-sm">
        <li v-for="(f, j) in tm<string[]>(`plan.features.${k}`)" :key="j" class="flex gap-2">
          <Check class="mt-0.5 size-4 shrink-0" :class="k === 'team' ? 'text-lime' : 'text-success'" />{{ f.replace('{addon}', addon) }}
        </li>
      </ul>
      <NuxtLink v-if="mode === 'public'" to="/register"
        class="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5"
        :class="k === 'team' ? 'bg-white text-ink' : 'bg-brand-500 text-white'">{{ cta(k) }}<ArrowRight class="size-4" /></NuxtLink>
      <template v-else-if="k !== 'solo'">
        <button type="button" class="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition hover:-translate-y-0.5 disabled:opacity-60"
          :class="k === 'team' ? 'bg-white text-ink' : 'bg-brand-500 text-white'" :disabled="!!busy" @click="emit('choose', k)">{{ cta(k) }} · {{ price(k) }}</button>
        <p v-if="rank(k) < rank(current ?? 'solo')" class="mt-2 text-xs" :class="k === 'team' ? 'text-white/60' : 'text-muted'">{{ t('plan.downgradeNote', { plan: t(`plan.names.${current}`) }) }}</p>
      </template>
      <p v-else-if="mode === 'app'" class="mt-6 text-xs text-muted">{{ t('plan.soloNote') }}</p>
    </article>
  </div>
</template>
