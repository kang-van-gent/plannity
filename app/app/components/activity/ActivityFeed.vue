<script setup lang="ts">
import { ArrowRight, FileText, History, Store, Users } from '@lucide/vue'
import type { ActivityChange, ActivityEntityType, ActivityEntry } from '~/types'

// "Who did what, when" for a brand — or one post (entityId). Read-only: the
// log is written by the server and can't be edited from here.
const props = withDefaults(defineProps<{ brandId: string; entityType?: ActivityEntityType; entityId?: string; pageSize?: number; linkContent?: boolean }>(), { pageSize: 30, linkContent: true })
const { t, locale } = useLocale()
const api = useApi()

const entries = ref<ActivityEntry[]>([])
const page = ref(0)
const pageCount = ref(1)
const loading = ref(false)
const error = ref<unknown>(null)

async function load(next = 1) {
  loading.value = true
  error.value = null
  try {
    const r = await api.activity.list(props.brandId, { entityType: props.entityType, entityId: props.entityId, page: next, pageSize: props.pageSize })
    entries.value = next === 1 ? r.data : [...entries.value, ...r.data]
    page.value = r.meta.page
    pageCount.value = r.meta.pageCount
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
watch(() => [props.brandId, props.entityType, props.entityId], () => load(1), { immediate: true })
defineExpose({ reload: () => load(1) })

// ---- rendering -------------------------------------------------------------
const key = (s: string) => s.replace(/\./g, '_')
const ICON: Record<ActivityEntityType, unknown> = { brand: Store, content: FileText, member: Users }
function sentence(e: ActivityEntry) {
  const k = `activity.actions.${key(e.action)}`
  const s = t(k, { title: e.entityTitle ?? '' })
  return s === k ? t('activity.actions.unknown') : s
}
function fieldLabel(f: string) {
  const k = `activity.fields.${key(f)}`
  const s = t(k)
  return s === k ? f : s
}
function fmt(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return t('activity.emptyValue')
  if (Array.isArray(v)) return v.length ? v.map((x) => fmt(field, x)).join(', ') : t('activity.emptyValue')
  const s = String(v)
  if (field === 'status') return t(`status.${s}`)
  if (field === 'role') return t(`roles.${s}`)
  if (field === 'objective') return t(`objectives.${s}`)
  if (field === 'format') return t(`formats.${s}`)
  if (field === 'platform' || field === 'profile.platforms') return PLATFORM_META[s as keyof typeof PLATFORM_META]?.label ?? s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDate(s, locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatDateTime(s, locale.value)
  return s
}
const time = (iso: string) => new Date(iso).toLocaleTimeString(locale.value === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
function dayLabel(iso: string) {
  const d = iso.slice(0, 10)
  const today = todayISO()
  if (d === today) return t('activity.today')
  if (d === addDays(today, -1)) return t('activity.yesterday')
  return formatDate(d, locale.value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
/** Bangkok calendar day of an ISO timestamp. */
const localDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10)
const groups = computed(() => {
  const out: { day: string; label: string; items: ActivityEntry[] }[] = []
  for (const e of entries.value) {
    const day = localDay(e.createdAt)
    const last = out[out.length - 1]
    if (last?.day === day) last.items.push(e)
    else out.push({ day, label: dayLabel(`${day}T12:00:00Z`), items: [e] })
  }
  return out
})
const initials = (s: string) => s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?'
const shown = (c: ActivityChange) => c.field !== 'archivedAt' // the sentence already says it
</script>

<template>
  <div :aria-busy="loading">
    <div v-if="loading && !entries.length" class="space-y-3" aria-hidden="true">
      <div v-for="i in 4" :key="i" class="flex gap-3"><div class="skeleton size-9 rounded-full" /><div class="flex-1 space-y-2"><div class="skeleton h-4 w-3/4" /><div class="skeleton h-3 w-1/3" /></div></div>
    </div>
    <UiErrorState v-else-if="error && !entries.length" compact :error="error as any" @retry="load(1)" />
    <div v-else-if="!entries.length" class="rounded-2xl border border-dashed border-line p-8 text-center">
      <History class="mx-auto size-7 text-muted" />
      <p class="mt-2 font-semibold">{{ t('activity.empty') }}</p>
      <p class="text-sm text-muted">{{ t('activity.emptyBody') }}</p>
    </div>

    <template v-else>
      <section v-for="g in groups" :key="g.day" class="mb-5 last:mb-0">
        <h3 class="section-label sticky top-0 z-[1] bg-inherit">{{ g.label }}</h3>
        <ol class="relative space-y-1 before:absolute before:bottom-3 before:left-[1.125rem] before:top-3 before:w-px before:bg-line">
          <li v-for="e in g.items" :key="e.id" class="relative flex gap-3 rounded-2xl p-2 transition-colors hover:bg-surface-2/60">
            <span class="relative z-[1] grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pink font-display text-xs font-bold text-white ring-4 ring-surface">{{ initials(e.actorName) }}</span>
            <div class="min-w-0 flex-1 pt-0.5">
              <p class="text-sm leading-snug">
                <b>{{ e.actorName }}</b> {{ sentence(e) }}
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{{ time(e.createdAt) }}</span>
                <span class="inline-flex items-center gap-1"><component :is="ICON[e.entityType]" class="size-3" />{{ t(`activity.filters.${e.entityType}`) }}</span>
                <NuxtLink v-if="linkContent && e.entityType === 'content' && e.action !== 'content.deleted'" :to="`/app/content/${e.entityId}`" class="inline-flex items-center gap-0.5 font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  {{ t('activity.open') }}<ArrowRight class="size-3" />
                </NuxtLink>
              </p>
              <ul v-if="e.changes.filter(shown).length" class="mt-2 space-y-1 rounded-xl bg-surface-2 p-2.5 text-xs">
                <li v-for="c in e.changes.filter(shown)" :key="c.field" class="grid gap-0.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-2">
                  <span class="font-semibold text-muted">{{ fieldLabel(c.field) }}</span>
                  <span class="min-w-0 break-words">
                    <template v-if="c.from !== null && c.from !== undefined"><s class="text-muted/80">{{ fmt(c.field, c.from) }}</s> → </template>
                    <span class="font-medium">{{ fmt(c.field, c.to) }}</span>
                  </span>
                </li>
              </ul>
            </div>
          </li>
        </ol>
      </section>
      <button v-if="page < pageCount" type="button" class="btn-secondary mt-2 w-full" :disabled="loading" @click="load(page + 1)">
        {{ loading ? t('common.loading') : t('activity.loadMore') }}
      </button>
    </template>
  </div>
</template>
