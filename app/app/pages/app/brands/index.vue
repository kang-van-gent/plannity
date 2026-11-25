<script setup lang="ts">
import { Archive, ArchiveRestore, Crosshair, Eye, FileText, Pencil, Plus, Store, Users, WandSparkles } from '@lucide/vue'
import type { Brand } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t } = useLocale()
useSeoMeta({ title: () => t('nav.brands') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const showArchived = ref(false)
const features = useFeatures()
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
      <label class="flex cursor-pointer items-center justify-between gap-2 text-sm font-semibold text-muted max-sm:min-h-11 max-sm:rounded-2xl max-sm:border max-sm:border-line max-sm:bg-surface max-sm:px-3">{{ t('brands.showArchived') }}<input v-model="showArchived" type="checkbox" class="switch"></label>
      <NuxtLink to="/app/brands/new" class="btn-primary"><Plus class="size-4" />{{ t('brands.create') }}</NuxtLink>
    </UiPageHeader>

    <TeamInvitationsBanner @changed="q.refresh({ silent: true })" />

    <UiErrorState v-if="q.error.value" :error="q.error.value" @retry="q.refresh()" />
    <UiSkeletonList v-else-if="!q.loaded.value" grid :rows="3" />
    <UiEmptyState v-else-if="!list.length" :icon="Store" :title="t('brands.emptyTitle')" :message="t('brands.emptyBody')">
      <NuxtLink to="/app/brands/new?onboarding=1" class="btn-primary"><Plus class="size-4" />{{ t('brands.create') }}</NuxtLink>
    </UiEmptyState>
    <div v-else class="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
      <article v-for="(b, i) in list" :key="b.id" v-anim="i"
        class="card group relative flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-pop"
        :class="[b.archivedAt && 'opacity-75 saturate-50', brands.scope.value === b.id && 'ring-2 ring-offset-2 ring-offset-bg']"
        :style="brands.scope.value === b.id ? { '--tw-ring-color': b.color } : undefined">
        <!-- Banner -->
        <div class="relative h-24 overflow-hidden sm:h-28" :style="{ background: `linear-gradient(135deg, ${b.color} 0%, color-mix(in srgb, ${b.color} 55%, white) 100%)` }">
          <div class="absolute inset-0 bg-dots opacity-40 mix-blend-overlay" />
          <Doodle variant="petal" class="absolute -right-8 -top-10 size-36 text-white/25 transition duration-700 group-hover:rotate-45 group-hover:scale-110" />
          <Doodle variant="spark" class="absolute right-28 top-5 size-5 text-white/80 transition duration-500 group-hover:rotate-90" />
          <div class="absolute right-3 top-3 flex gap-1.5">
            <span v-if="b.archivedAt" class="chip bg-white/90 text-slate-600 shadow-sm"><Archive class="size-3" />{{ t('brands.archivedChip') }}</span>
            <span v-else-if="brands.scope.value === b.id" class="chip bg-white/90 text-ink shadow-sm"><Eye class="size-3" />{{ t('brands.inScope') }}</span>
          </div>
        </div>

        <!-- Body (z-10 so the avatar sits above the banner instead of under it) -->
        <div class="relative z-10 -mt-10 flex flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5">
          <div class="flex items-end justify-between gap-3">
            <span class="rounded-[1.6rem] bg-surface p-1.5 shadow-soft transition group-hover:-rotate-3">
              <UiBrandDot :name="b.name" :color="b.color" :size="64" />
            </span>
            <span class="mb-1 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold tabular-nums text-muted">
              <FileText class="size-3.5" />{{ t('brands.contentCount', { n: b.contentCount ?? 0 }) }}
              <span class="mx-0.5 opacity-40">·</span>{{ t(`roles.${b.myRole}`) }}
            </span>
          </div>

          <NuxtLink :to="`/app/brands/${b.id}`" class="mt-3 block min-w-0 after:absolute after:inset-0 after:content-['']">
            <h2 class="truncate font-display text-xl font-bold transition group-hover:text-brand-600 dark:group-hover:text-brand-300">{{ b.name }}</h2>
          </NuxtLink>
          <p class="truncate text-sm font-medium" :style="{ color: `color-mix(in srgb, ${b.color} 70%, var(--fg))` }">{{ b.profile.industry || '—' }}</p>
          <p class="mt-2.5 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-muted">{{ b.profile.description }}</p>

          <div class="mt-3 flex flex-wrap gap-1.5">
            <UiPlatformBadge v-for="p in b.profile.platforms" :key="p" :platform="p" />
          </div>

          <!-- Actions sit above the full-card link (relative z-10) -->
          <div class="relative z-10 mt-auto flex items-center gap-2 pt-5">
            <NuxtLink v-if="!b.archivedAt && features.aiGenerate" :to="`/app/generate?brand=${b.id}`" class="btn-primary btn-sm flex-1"><WandSparkles class="size-4" />{{ t('nav.generate') }}</NuxtLink>
            <NuxtLink :to="`/app/brands/${b.id}`" class="btn-secondary btn-sm flex-1">
              <template v-if="roleCan(b.myRole, 'brand.update')"><Pencil class="size-3.5" />{{ t('common.edit') }}</template>
              <template v-else><Eye class="size-3.5" />{{ t('common.open') }}</template>
            </NuxtLink>
            <NuxtLink :to="`/app/brands/${b.id}/team`" class="btn-icon btn-secondary p-2" :aria-label="t('team.tab')" :title="t('team.tab')"><Users class="size-4" /></NuxtLink>
            <button v-if="!b.archivedAt" type="button" class="btn-icon btn-secondary p-2" :class="brands.scope.value === b.id && 'border-brand-400 text-brand-600 dark:text-brand-300'"
              :aria-label="t('brands.focus')" :title="t('brands.focus')" :aria-pressed="brands.scope.value === b.id" @click="focus(b)">
              <Crosshair class="size-4" />
            </button>
            <button v-if="roleCan(b.myRole, 'brand.delete')" type="button" class="btn-icon btn-ghost p-2" :disabled="busy === b.id"
              :aria-label="b.archivedAt ? t('brands.restore') : t('brands.archive')" :title="b.archivedAt ? t('brands.restore') : t('brands.archive')" @click="toggleArchive(b)">
              <ArchiveRestore v-if="b.archivedAt" class="size-4" /><Archive v-else class="size-4" />
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
