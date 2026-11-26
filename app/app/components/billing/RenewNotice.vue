<script setup lang="ts">
import { Lock, RefreshCw, TimerReset } from '@lucide/vue'

/**
 * Tells the paying owner when something needs renewing: locked brands, or the
 * plan / a brand slot ending within a week. Links to "Renew everything".
 */
const props = withDefaults(defineProps<{ onPlanPage?: boolean }>(), { onPlanPage: false })
const { t } = useLocale()
const { ent, load } = useEntitlements()
onMounted(() => { load(props.onPlanPage) })

const days = (iso: string | null) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 864e5) : Infinity)
const locked = computed(() => ent.value?.brands.filter((b) => b.locked) ?? [])
const soonBrands = computed(() => ent.value?.planKey === 'studio' ? [] : (ent.value?.brands.filter((b) => b.kind === 'slot' && days(b.until) <= RENEW_SOON_DAYS) ?? []))
const planSoon = computed(() => !!ent.value && ent.value.planKey !== 'solo' && days(ent.value.periodEnd) <= RENEW_SOON_DAYS && !ent.value.upcoming.length)
const soonest = computed(() => Math.max(0, Math.min(planSoon.value ? days(ent.value!.periodEnd) : Infinity, ...soonBrands.value.map((b) => days(b.until)))))
const what = computed(() => [
  planSoon.value ? t('plan.noticePlan', { plan: t(`plan.names.${ent.value!.planKey}`) }) : '',
  soonBrands.value.length ? t('plan.noticeBrands', { n: soonBrands.value.length }) : '',
].filter(Boolean).join(' + '))
const href = computed(() => (props.onPlanPage ? '#renew' : '/app/plan#renew'))
</script>

<template>
  <div v-if="locked.length || what" class="space-y-2">
    <NuxtLink v-if="locked.length" :to="href" class="flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-danger/30 bg-danger/[0.06] p-4 transition hover:bg-danger/10">
      <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-danger/15 text-danger"><Lock class="size-5" /></span>
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">{{ t('plan.noticeLocked', { n: locked.length }) }} · <span class="font-normal text-muted">{{ locked.map((b) => b.name).join(', ') }}</span></span>
        <span class="text-sm text-muted">{{ t('plan.noticeLockedBody') }}</span>
      </span>
      <span class="btn-primary btn-sm"><RefreshCw class="size-3.5" />{{ t('plan.noticeAction') }}</span>
    </NuxtLink>
    <NuxtLink v-if="what" :to="href" class="flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-sun/40 bg-sun/10 p-4 transition hover:bg-sun/15">
      <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-sun/25 text-amber-700 dark:text-sun"><TimerReset class="size-5" /></span>
      <span class="min-w-0 flex-1">
        <span class="block font-semibold">{{ t('plan.noticeSoon') }}</span>
        <span class="text-sm text-muted">{{ t('plan.noticeSoonBody', { what, n: soonest }) }}</span>
      </span>
      <span class="btn-secondary btn-sm"><RefreshCw class="size-3.5" />{{ t('plan.noticeAction') }}</span>
    </NuxtLink>
  </div>
</template>
