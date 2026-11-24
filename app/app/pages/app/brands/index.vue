<script setup lang="ts">
import { Archive, ArchiveRestore, Crosshair, Pencil, Plus, Store, WandSparkles } from '@lucide/vue'
import type { Brand } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t } = useLocale()
useSeoMeta({ title: () => t('nav.brands') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const showArchived = ref(false)
const q = useQuery(async () => { await brands.load(true); return brands.brands.value })
const list = computed(() => (q.data.value ?? []).filter((b) => showArchived.value || !b.archivedAt))
const busy = ref<string | null>(null)

async function toggleArchive(b: Brand) {
  const archiving = !b.archivedAt
  if (archiving) {
    const ok = await notify.confirm({ title: t('brands.archiveConfirm', { name: b.name }), message: t('brands.archiveConfirmBody'), confirmLabel: t('brands.archive'), tone: 'warning' })
    if (!ok) return
  }
  busy.value = b.id
  try {
    await (archiving ? api.brands.archive(b.id) : api.brands.restore(b.id))
    await q.refresh({ silent: true })
    notify.success(archiving ? t('brands.archived') : t('brands.restored'), b.name)
  } catch (e) {
    notify.fromError(e, { retry: () => toggleArchive(b) })
  } finally {
    busy.value = null
  }
}

function focus(b: Brand) {
  brands.setScope(b.id)
  notify.info(t('brands.switched'), b.name)
}
</script>

<template>
  <div>
    <UiPageHeader :title="t('nav.brands')" :subtitle="t('brands.subtitle')">
      <label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted"><input v-model="showArchived" type="checkbox" class="size-4 accent-brand-500">{{ t('brands.showArchived') }}</label>
      <NuxtLink to="/app/brands/new" class="btn-primary"><Plus class="size-4" />{{ t('brands.create') }}</NuxtLink>
    </UiPageHeader>

    <UiErrorState v-if="q.error.value" :error="q.error.value" @retry="q.refresh()" />
    <UiSkeletonList v-else-if="!q.loaded.value" grid :rows="3" />
    <UiEmptyState v-else-if="!list.length" :icon="Store" :title="t('brands.emptyTitle')" :message="t('brands.emptyBody')">
      <NuxtLink to="/app/brands/new?onboarding=1" class="btn-primary"><Plus class="size-4" />{{ t('brands.create') }}</NuxtLink>
    </UiEmptyState>
    <div v-else class="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <article v-for="(b, i) in list" :key="b.id" v-anim="i" class="card group relative overflow-hidden transition hover:-translate-y-1 hover:shadow-pop" :class="b.archivedAt ? 'opacity-70' : ''">
        <div class="relative h-20 overflow-hidden" :style="{ background: `linear-gradient(120deg, ${b.color}, ${b.color}88)` }">
          <Doodle variant="petal" class="absolute -right-6 -top-8 size-28 text-white/25 transition duration-500 group-hover:rotate-45" />
          <Doodle variant="spark" class="absolute bottom-3 right-24 size-5 text-white/70" />
        </div>
        <div class="-mt-8 px-5 pb-5">
          <UiBrandDot :name="b.name" :color="b.color" :size="56" class="ring-4 ring-surface" />
          <div class="mt-3 flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <h2 class="truncate font-display text-xl font-bold">{{ b.name }}</h2>
              <p class="truncate text-sm text-muted">{{ b.profile.industry || '—' }}</p>
            </div>
            <span v-if="b.archivedAt" class="chip bg-slate-500/10 text-muted">{{ t('brands.archivedChip') }}</span>
            <span v-else-if="brands.scope.value === b.id" class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">{{ t('brands.inScope') }}</span>
          </div>
          <p class="mt-3 line-clamp-2 text-sm text-muted">{{ b.profile.description }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-1.5">
            <UiPlatformBadge v-for="p in b.profile.platforms" :key="p" :platform="p" />
            <span class="ml-auto text-xs font-semibold text-muted">{{ t('brands.contentCount', { n: b.contentCount ?? 0 }) }}</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <NuxtLink :to="`/app/brands/${b.id}`" class="btn-secondary btn-sm"><Pencil class="size-3.5" />{{ t('common.edit') }}</NuxtLink>
            <template v-if="!b.archivedAt">
              <button type="button" class="btn-ghost btn-sm" @click="focus(b)"><Crosshair class="size-3.5" />{{ t('brands.focus') }}</button>
              <NuxtLink :to="`/app/generate?brand=${b.id}`" class="btn-ghost btn-sm"><WandSparkles class="size-3.5" />{{ t('nav.generate') }}</NuxtLink>
            </template>
            <button type="button" class="btn-ghost btn-sm ml-auto" :disabled="busy === b.id" :aria-label="b.archivedAt ? t('brands.restore') : t('brands.archive')" @click="toggleArchive(b)">
              <ArchiveRestore v-if="b.archivedAt" class="size-3.5" /><Archive v-else class="size-3.5" />
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
