<script setup lang="ts">
import { ChevronLeft, ChevronRight, Download, LayoutGrid, Library, List, Plus, Search, X } from '@lucide/vue'
import type { ContentFormModel, ContentQuery } from '~/types'
import { CONTENT_STATUSES, PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const features = useFeatures()
const { t } = useLocale()
const opt = useSelectOptions()
const sortOptions = computed(() => [{ value: 'updated' as const, label: t('content.sortUpdated') }, { value: 'date' as const, label: t('content.sortDate') }])
useSeoMeta({ title: () => t('nav.library') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const route = useRoute()

const filters = reactive({ search: '', platform: '', pillar: '', status: (route.query.status as string) || '', from: '', to: '', sort: 'updated' as 'updated' | 'date', page: 1 })
const view = useCookie<'grid' | 'list'>('plannity-library-view', { default: () => 'grid' })
const debounced = ref('')
let tmr: ReturnType<typeof setTimeout> | undefined
watch(() => filters.search, (v) => { clearTimeout(tmr); tmr = setTimeout(() => { debounced.value = v; filters.page = 1 }, 300) })
watch(() => [filters.platform, filters.pillar, filters.status, filters.from, filters.to, filters.sort, brands.currentBrandId.value], () => { filters.page = 1 })

const query = computed<ContentQuery>(() => ({
  brandId: brands.currentBrandId.value, search: debounced.value, platform: filters.platform as ContentQuery['platform'], pillar: filters.pillar,
  status: filters.status as ContentQuery['status'], from: filters.from, to: filters.to, sort: filters.sort, page: filters.page, pageSize: 18,
}))
const q = useQuery(() => api.contents.list(query.value), { watch: [query] })
const pillars = computed(() => Array.from(new Set(brands.active.value.flatMap((b) => b.profile.pillars))).sort())
const activeFilters = computed(() => [filters.search, filters.platform, filters.pillar, filters.status, filters.from, filters.to].filter(Boolean).length)
function clearFilters() { Object.assign(filters, { search: '', platform: '', pillar: '', status: '', from: '', to: '', page: 1 }); debounced.value = '' }

// Export (UTF-8 BOM CSV with formula-injection protection, spec §10).
const exporting = ref(false)
async function exportCsv() {
  exporting.value = true
  try {
    const csv = await api.contents.exportCsv({ ...query.value, page: 1 })
    downloadText(`plannity-content-${todayISO()}.csv`, csv)
    notify.success(t('content.exported'), t('content.exportedBody'))
  } catch (e) {
    notify.fromError(e, { retry: exportCsv })
  } finally {
    exporting.value = false
  }
}

// Manual create (free, no credits).
const createOpen = ref(false)
const createForm = ref<ContentFormModel>(emptyContentForm(undefined))
const createErrors = ref<Record<string, string>>({})
const creating = ref(false)
// Team Workspace: create only in brands where the user's role allows it.
const perms = usePerms()
const creatableBrands = computed(() => perms.brandsWhere('content.create'))
function openCreate() {
  // A locked brand is in scope: say so instead of quietly creating the post in another brand.
  const scopedLocked = brands.currentBrand.value?.locked ? brands.currentBrand.value : null
  if (scopedLocked) {
    notify.warning(t('brands.lockedTitle'), `${scopedLocked.name} · ${scopedLocked.isBillingOwner ? t('brands.lockedOwner') : t('brands.lockedMember')}`,
      scopedLocked.isBillingOwner ? { action: { label: t('brands.renewBrand'), handler: () => navigateTo('/app/plan#brands') } } : undefined)
    return
  }
  const scoped = brands.currentBrand.value && creatableBrands.value.includes(brands.currentBrand.value) ? brands.currentBrand.value : creatableBrands.value[0]
  createForm.value = emptyContentForm(scoped)
  createErrors.value = {}
  createOpen.value = true
}
async function create() {
  if (!createForm.value.title.trim()) { createErrors.value = { title: t('validation.required') }; return }
  creating.value = true
  try {
    const c = await api.contents.create(formToInput(createForm.value))
    createOpen.value = false
    notify.success(t('content.created'), t('content.createdFree'), { action: { label: t('common.open'), handler: () => navigateTo(`/app/content/${c.id}`) } })
    q.refresh({ silent: true })
  } catch (e) {
    if (isApiError(e)) createErrors.value = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, t(`validation.${v}`)]))
    notify.fromError(e)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <UiPageHeader :title="t('nav.library')" :subtitle="t('content.subtitle')">
      <button type="button" class="btn-secondary" :disabled="exporting" @click="exportCsv"><Download class="size-4" />{{ exporting ? t('common.loading') : t('content.exportCsv') }}</button>
      <button type="button" class="btn-primary" :disabled="!creatableBrands.length" @click="openCreate"><Plus class="size-4" />{{ t('content.newManual') }}</button>
    </UiPageHeader>

    <div v-anim class="mb-5 sm:rounded-3xl sm:border sm:border-line sm:bg-surface sm:p-4 sm:shadow-soft">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-0 flex-1 basis-full sm:basis-[14rem]">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input v-model="filters.search" type="search" class="input pl-10 max-sm:rounded-full max-sm:bg-surface max-sm:shadow-soft" :placeholder="t('content.searchPh')" :aria-label="t('common.search')">
        </div>
        <div class="h-scroll w-full sm:contents">
          <UiSelect v-model="filters.platform" size="pill" :active="!!filters.platform" :aria-label="t('content.fields.platform')" :options="opt.withAll(t('content.allPlatforms'), opt.platforms.value)" />
          <UiSelect v-model="filters.pillar" size="pill" :active="!!filters.pillar" :aria-label="t('content.fields.pillar')" :options="opt.withAll(t('content.allPillars'), pillars.map((p) => ({ value: p, label: p })))" />
          <UiSelect v-model="filters.status" size="pill" :active="!!filters.status" :aria-label="t('content.fields.status')"
            :options="[...opt.withAll(t('content.allStatuses'), opt.statuses.value), { value: 'unscheduled', label: t('content.unscheduled'), color: '#CBD5E1' }]" />
          <UiSelect v-model="filters.sort" class="sm:hidden" size="pill" :aria-label="t('content.sort')" :options="sortOptions" />
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <label class="flex items-center gap-2 text-xs font-semibold text-muted">{{ t('generate.from') }}<input v-model="filters.from" type="date" class="input pill sm:h-auto sm:rounded-2xl sm:py-1.5"></label>
        <label class="flex items-center gap-2 text-xs font-semibold text-muted">{{ t('generate.to') }}<input v-model="filters.to" type="date" class="input pill sm:h-auto sm:rounded-2xl sm:py-1.5"></label>
        <UiSelect v-model="filters.sort" class="hidden sm:block" size="sm" :aria-label="t('content.sort')" :options="sortOptions" />
        <button v-if="activeFilters" type="button" class="btn-ghost btn-sm" @click="clearFilters"><X class="size-3.5" />{{ t('content.clearFilters', { n: activeFilters }) }}</button>
        <div class="segmented ml-auto">
          <button type="button" :aria-pressed="view === 'grid'" :aria-label="t('content.gridView')" @click="view = 'grid'"><LayoutGrid class="size-4" /></button>
          <button type="button" :aria-pressed="view === 'list'" :aria-label="t('content.listView')" @click="view = 'list'"><List class="size-4" /></button>
        </div>
      </div>
    </div>

    <UiErrorState v-if="q.error.value" :error="q.error.value" @retry="q.refresh()" />
    <!-- Skeleton while filters/page reload: cards mount once with fresh data (no stale cards dimming then swapping). -->
    <UiSkeletonList v-else-if="!q.data.value || !q.ready.value" grid :rows="6" />
    <UiEmptyState v-else-if="!q.data.value.data.length" :icon="Library" :title="activeFilters ? t('content.noMatch') : t('content.emptyTitle')" :message="activeFilters ? t('content.noMatchBody') : t('content.emptyBody')">
      <button v-if="activeFilters" type="button" class="btn-secondary" @click="clearFilters">{{ t('content.clearFilters', { n: activeFilters }) }}</button>
      <NuxtLink v-else-if="features.aiGenerate" to="/app/generate" class="btn-primary">{{ t('nav.generate') }}</NuxtLink>
      <button v-else type="button" class="btn-primary" :disabled="!creatableBrands.length" @click="openCreate"><Plus class="size-4" />{{ t('content.newManual') }}</button>
    </UiEmptyState>
    <template v-else>
      <div>
        <div v-if="view === 'grid'" class="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          <ContentCard v-for="(c, i) in q.data.value.data" :key="c.id" v-anim="i" :content="c" />
        </div>
        <div v-else class="card divide-y divide-line overflow-hidden">
          <ContentCard v-for="(c, i) in q.data.value.data" :key="c.id" v-anim="{ delay: i * 0.03, from: 'right' }" :content="c" layout="row" />
        </div>
      </div>
      <nav class="mt-6 flex items-center justify-between gap-3 text-sm" :aria-label="t('common.pagination')">
        <p class="text-muted">{{ t('content.showing', { from: (q.data.value.meta.page - 1) * q.data.value.meta.pageSize + 1, to: Math.min(q.data.value.meta.total, q.data.value.meta.page * q.data.value.meta.pageSize), total: q.data.value.meta.total }) }}</p>
        <div class="flex items-center gap-2">
          <button type="button" class="btn-secondary btn-sm" :disabled="filters.page <= 1" @click="filters.page--"><ChevronLeft class="size-4" /></button>
          <span class="font-semibold">{{ q.data.value.meta.page }} / {{ q.data.value.meta.pageCount }}</span>
          <button type="button" class="btn-secondary btn-sm" :disabled="filters.page >= q.data.value.meta.pageCount" @click="filters.page++"><ChevronRight class="size-4" /></button>
        </div>
      </nav>
    </template>

    <SidePanel :open="createOpen" size="lg" :title="t('content.newManual')" :subtitle="t('content.newManualHint')" @close="createOpen = false">
      <ContentForm v-model="createForm" :brands="creatableBrands" :errors="createErrors" compact />
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="creating" @click="create">{{ creating ? t('common.saving') : t('content.createFree') }}</button>
      </template>
    </SidePanel>
  </div>
</template>
