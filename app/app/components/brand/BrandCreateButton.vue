<script setup lang="ts">
import { Gem, Lock, Plus, Store } from '@lucide/vue'

/**
 * "Create brand" that respects the plan (pricing.md §6): it opens the form
 * only when the account has a free owned-brand slot. Otherwise it explains the
 * limit and offers an extra slot (Solo/Team) or Studio — instead of letting
 * the form fail on save. Archived brands still count.
 */
const props = withDefaults(defineProps<{ onboarding?: boolean; showUsage?: boolean }>(), { onboarding: false, showUsage: false })
const { t, locale } = useLocale()
const { ent, load, brandSlotsLeft, canCreateBrand } = useEntitlements()
onMounted(() => { load() })

const gateOpen = ref(false)
const checking = ref(false)
const to = computed(() => (props.onboarding ? '/app/brands/new?onboarding=1' : '/app/brands/new'))
async function open() {
  checking.value = true
  try { await load(true) } finally { checking.value = false }
  if (canCreateBrand.value) await navigateTo(to.value)
  else gateOpen.value = true
}
const addonPrice = computed(() => formatTHB(ent.value?.pricing.additionalBrandMonthlySatang ?? DEFAULT_PRICING.additionalBrandMonthlySatang, locale.value))
const planName = computed(() => t(`plan.names.${ent.value?.planKey ?? 'solo'}`))
</script>

<template>
  <span class="inline-flex flex-col items-stretch gap-1 sm:items-end">
    <button type="button" class="btn-primary" :disabled="checking" :aria-haspopup="!canCreateBrand ? 'dialog' : undefined" @click="open">
      <Lock v-if="!canCreateBrand" class="size-4" /><Plus v-else class="size-4" />{{ t('brands.create') }}
    </button>
    <span v-if="showUsage && ent && ent.brandLimit !== null" class="text-center text-xs text-muted sm:text-right">
      {{ t('brands.slotsUsed', { used: ent.brands.filter((b) => !b.locked).length, max: ent.brandLimit }) }}<template v-if="ent.brands.some((b) => b.locked)"> · {{ t('brands.lockedCount', { n: ent.brands.filter((b) => b.locked).length }) }}</template>
    </span>

    <SidePanel :open="gateOpen" size="sm" :title="t('brands.limitTitle')" :subtitle="planName" :guard="false" @close="gateOpen = false">
      <div class="flex flex-col items-center rounded-3xl bg-gradient-to-br from-brand-500/10 to-pink/10 p-6 text-center">
        <span class="grid size-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-500"><Store class="size-7" /></span>
        <p class="mt-3 font-display text-3xl font-bold">{{ t('brands.slotsUsed', { used: ent?.brands.filter((b) => !b.locked).length ?? 0, max: ent?.brandLimit ?? 0 }) }}</p>
        <p class="mt-2 text-sm text-muted">{{ t('brands.limitBody', { plan: planName, max: ent?.brandLimit ?? 0 }) }}</p>
      </div>
      <div class="grid gap-2">
        <NuxtLink to="/app/plan#addon" class="btn-primary" @click="gateOpen = false"><Plus class="size-4" />{{ t('brands.addSlot', { price: addonPrice }) }}</NuxtLink>
        <NuxtLink to="/app/plan" class="btn-secondary" @click="gateOpen = false"><Gem class="size-4" />{{ t('brands.upgradeStudio') }}</NuxtLink>
      </div>
      <p v-if="brandSlotsLeft === 0" class="text-xs text-muted">{{ t('brands.limitArchived') }}</p>
    </SidePanel>
  </span>
</template>
