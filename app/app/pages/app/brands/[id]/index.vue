<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowLeft, Eye, Library, WandSparkles } from '@lucide/vue'
import type { BrandInput } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const features = useFeatures()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const route = useRoute()
const id = computed(() => String(route.params.id))
const q = useQuery(() => api.brands.get(id.value), { watch: [id] })
useSeoMeta({ title: () => q.data.value?.name ?? t('nav.brands') })
const saving = ref(false)
const serverErrors = ref<Record<string, string>>()
const formKey = ref(0)
// From this brand's own response (no wait for the brands store).
const canEdit = computed(() => roleCan(q.data.value?.myRole, 'brand.update'))
const canArchive = computed(() => roleCan(q.data.value?.myRole, 'brand.delete'))

async function save(input: BrandInput) {
  saving.value = true
  try {
    q.data.value = await api.brands.update(id.value, input)
    await brands.load(true)
    notify.success(t('common.saved'), q.data.value.name)
  } catch (e) {
    if (isApiError(e)) serverErrors.value = e.fieldErrors
    notify.fromError(e)
  } finally {
    saving.value = false
  }
}

async function toggleArchive() {
  const b = q.data.value
  if (!b) return
  const archiving = !b.archivedAt
  if (archiving && !(await notify.confirm({ title: t('brands.archiveConfirm', { name: b.name }), message: t('brands.archiveConfirmBody'), confirmLabel: t('brands.archive'), tone: 'warning' }))) return
  try {
    q.data.value = await (archiving ? api.brands.archive(b.id) : api.brands.restore(b.id))
    await brands.load(true)
    formKey.value++
    notify.success(archiving ? t('brands.archived') : t('brands.restored'), b.name)
  } catch (e) {
    notify.fromError(e)
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/app/brands" class="btn-ghost btn-sm mb-4 -ml-2"><ArrowLeft class="size-4" />{{ t('nav.brands') }}</NuxtLink>
    <UiErrorState v-if="q.error.value" :error="q.error.value" @retry="q.refresh()" />
    <UiSkeletonList v-else-if="!q.data.value || !q.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-6 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-4 sm:flex sm:flex-row">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="q.data.value.name" :color="q.data.value.color" :size="64" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[26px] font-bold sm:text-3xl">{{ q.data.value.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('brands.updatedAt', { date: formatDateTime(q.data.value.updatedAt, locale) }) }}<span v-if="q.data.value.archivedAt" class="chip ml-2 bg-slate-500/10 text-muted">{{ t('brands.archivedChip') }}</span></p>
        </div>
        <div v-anim="3" class="col-span-2 grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:flex-wrap">
          <span class="chip self-center bg-brand-500/10 text-brand-600 max-sm:hidden dark:text-brand-300">{{ t(`roles.${q.data.value.myRole}`) }}</span>
          <NuxtLink v-if="!q.data.value.archivedAt && features.aiGenerate" :to="`/app/generate?brand=${q.data.value.id}`" class="btn-primary"><WandSparkles class="size-4" />{{ t('nav.generate') }}</NuxtLink>
          <button type="button" class="btn-secondary" @click="brands.setScope(q.data.value.id); navigateTo('/app/content')"><Library class="size-4" />{{ t('nav.library') }}</button>
          <button v-if="canArchive" type="button" class="btn-secondary" @click="toggleArchive">
            <template v-if="q.data.value.archivedAt"><ArchiveRestore class="size-4" />{{ t('brands.restore') }}</template>
            <template v-else><Archive class="size-4" />{{ t('brands.archive') }}</template>
          </button>
        </div>
      </div>
      <BrandTabs :brand-id="q.data.value.id" active="profile" />
      <!-- Only Owners/Admins edit brand settings; everyone else sees them read-only. -->
      <p v-if="!canEdit" class="mb-4 flex items-center gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted"><Eye class="size-4 shrink-0" />{{ t('team.readOnly') }}</p>
      <fieldset :disabled="!canEdit" class="contents [&:disabled_button[type=submit]]:hidden">
        <BrandForm :key="formKey" :initial="{ name: q.data.value.name, color: q.data.value.color, profile: q.data.value.profile }" :saving="saving" :server-errors="serverErrors" @submit="save" />
      </fieldset>
    </template>
  </div>
</template>
