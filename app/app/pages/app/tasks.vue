<script setup lang="ts">
import { ArrowRight, ClipboardList, Flag, ImageUp, PauseCircle, ScrollText } from '@lucide/vue'
import type { Task } from '~/types'

// My Tasks: everything assigned to me, across every brand I can still access
// (access is re-checked by the server on each load). Overdue first.
definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('tasks.title') })
const api = useApi()
const myTasks = useMyTasks()

const q = useQuery(() => api.tasks.mine().then((list) => { myTasks.set(list.length); return list }))
const today = todayISO()

type Filter = 'all' | 'todo' | 'working' | 'review' | 'done'
const FILTERS: Filter[] = ['all', 'todo', 'working', 'review', 'done']
const filter = ref<Filter>('all')
const brandFilter = ref('all')
const brandsInList = computed(() => [...new Map((q.data.value ?? []).map((x) => [x.brandId, { id: x.brandId, name: x.brandName, color: x.brandColor }])).values()])
const count = (f: Filter) => (q.data.value ?? []).filter((x) => f === 'all' || TASK_GROUP[x.status] === f).length
const shown = computed(() => (q.data.value ?? []).filter((x) => (filter.value === 'all' || TASK_GROUP[x.status] === filter.value) && (brandFilter.value === 'all' || x.brandId === brandFilter.value)))

const dueText = (x: Task) => !x.dueDate ? t('tasks.noDue')
  : isOverdue(x, today) ? t('tasks.overdue', { date: formatDate(x.dueDate, locale.value) }) : t('tasks.due', { date: formatDate(x.dueDate, locale.value) })
const canUpload = (x: Task) => x.caps.assignee && ['todo', 'in_progress', 'changes_requested'].includes(x.status)
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <UiPageHeader :title="t('tasks.title')" :subtitle="t('tasks.subtitle')" />

    <div v-anim class="mb-4 flex flex-wrap items-center gap-2">
      <div class="h-scroll flex-1" role="tablist" :aria-label="t('tasks.title')">
        <button v-for="f in FILTERS" :key="f" type="button" role="tab" :aria-selected="filter === f" class="chip shrink-0 gap-1.5 px-3.5 py-2 text-sm"
          :class="filter === f ? 'bg-brand-500 text-white shadow-pop' : 'bg-surface text-muted hover:text-fg'" @click="filter = f">
          {{ t(`tasks.filters.${f}`) }}<span class="rounded-full px-1.5 text-[0.6875rem]" :class="filter === f ? 'bg-white/25' : 'bg-surface-2'">{{ count(f) }}</span>
        </button>
      </div>
      <UiSelect v-if="brandsInList.length > 1" v-model="brandFilter" size="pill" :active="brandFilter !== 'all'" :aria-label="t('tasks.allBrands')"
        :options="[{ value: 'all', label: t('tasks.allBrands') }, ...brandsInList.map((b) => ({ value: b.id, label: b.name, color: b.color }))]" />
    </div>

    <UiErrorState v-if="q.error.value" :error="q.error.value" @retry="q.refresh()" />
    <UiSkeletonList v-else-if="!q.ready.value" :rows="3" />
    <UiEmptyState v-else-if="!q.data.value?.length" :icon="ClipboardList" :title="t('tasks.empty')" :message="t('tasks.emptyBody')" />
    <UiEmptyState v-else-if="!shown.length" :icon="ClipboardList" :title="t('tasks.emptyFilter')" :message="t('tasks.emptyFilterBody')" />
    <template v-else>
      <p class="mb-2 text-xs text-muted">{{ t('tasks.sortHint') }}</p>
      <ul class="space-y-3">
        <li v-for="(x, i) in shown" :key="x.id" v-anim="i" class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"
          :class="isOverdue(x, today) && 'ring-2 ring-danger/30'">
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
              <UiBrandDot :name="x.brandName" :color="x.brandColor" :size="18" />{{ x.brandName }} · {{ t(`positions.${x.positionKey}`) }}
            </p>
            <NuxtLink :to="`/app/content/${x.contentId}`" class="mt-1 block truncate font-display text-lg font-bold hover:text-brand-600 dark:hover:text-brand-300">{{ x.contentTitle }}</NuxtLink>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <TaskStatusBadge :status="x.status" />
              <span class="chip py-0.5" :class="isOverdue(x, today) ? 'bg-danger/12 font-bold text-danger' : 'bg-surface-2 text-muted'">{{ dueText(x) }}</span>
              <span v-if="x.priority === 'high'" class="chip bg-danger/12 py-0.5 text-danger"><Flag class="size-3" />{{ t('tasks.priority.high') }}</span>
              <span v-if="x.contentScheduledDate" class="chip bg-surface-2 py-0.5 text-muted">{{ t('tasks.posts', { date: formatDate(x.contentScheduledDate, locale) }) }}</span>
            </div>
            <p v-if="x.status === 'changes_requested' && x.reviewNote" class="mt-2 line-clamp-2 rounded-xl bg-sun/10 px-3 py-2 text-xs">“{{ x.reviewNote }}”</p>
            <p v-if="x.suspended" class="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-sun"><PauseCircle class="size-3.5" />{{ t('tasks.card.suspended') }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
            <NuxtLink :to="`/app/content/${x.contentId}`" class="btn-secondary btn-sm"><ScrollText class="size-4" />{{ t('tasks.viewBrief') }}</NuxtLink>
            <NuxtLink v-if="canUpload(x) && !x.suspended" :to="`/app/content/${x.contentId}#images`" class="btn-primary btn-sm"><ImageUp class="size-4" />{{ t('tasks.uploadDesign') }}</NuxtLink>
            <NuxtLink v-else-if="x.caps.reviewer && x.status === 'in_review'" :to="`/app/content/${x.contentId}`" class="btn-primary btn-sm">{{ t('tasks.reviewIt') }}<ArrowRight class="size-4" /></NuxtLink>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
