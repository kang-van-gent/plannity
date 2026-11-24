<script setup lang="ts">
import { Coins } from '@lucide/vue'
import type { BrandInput } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t } = useLocale()
useSeoMeta({ title: () => t('brands.create') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const { wallet } = useWallet()
const route = useRoute()
const onboarding = computed(() => route.query.onboarding === '1')
const saving = ref(false)
const serverErrors = ref<Record<string, string>>()

async function save(input: BrandInput) {
  saving.value = true
  try {
    const b = await api.brands.create(input)
    await brands.load(true)
    brands.setScope(b.id)
    notify.success(t('brands.created'), onboarding.value ? t('brands.createdOnboarding') : b.name)
    await navigateTo(onboarding.value ? `/app/generate?brand=${b.id}` : `/app/brands/${b.id}`)
  } catch (e) {
    if (isApiError(e)) serverErrors.value = e.fieldErrors
    notify.fromError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <UiPageHeader :title="onboarding ? t('brands.onboardingTitle') : t('brands.create')" :subtitle="onboarding ? t('brands.onboardingSubtitle') : t('brands.createSubtitle')" />
    <div v-if="onboarding && wallet" v-anim class="mb-6 flex items-center gap-3 rounded-3xl bg-gradient-to-r from-sun/25 to-pink/20 p-4">
      <span class="grid size-10 place-items-center rounded-2xl bg-white/70 text-amber-600 dark:bg-surface"><Coins class="size-5" /></span>
      <p class="text-sm"><b>{{ t('brands.trialReady', { n: wallet.available }) }}</b><br><span class="text-muted">{{ t('brands.trialReadyBody') }}</span></p>
    </div>
    <BrandForm :stepped="onboarding" :saving="saving" :server-errors="serverErrors" :submit-label="onboarding ? t('brands.saveAndGenerate') : t('brands.create')" @submit="save" />
  </div>
</template>
