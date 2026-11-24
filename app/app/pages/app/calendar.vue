<script setup lang="ts">
import { AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Inbox, List, Plus, Star, Trash2, ExternalLink } from '@lucide/vue'
import { gsap } from 'gsap'
import type { Content, ContentFormModel, ContentStatus, Holiday } from '~/types'
import { CONTENT_STATUSES, PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('nav.calendar') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()

type View = 'month' | 'week' | 'list'
const view = ref<View>('month')
const today = todayISO()
const cursor = ref(today)
const filters = reactive({ platform: '', status: '' })

const range = computed(() => {
  if (view.value === 'week') { const d = weekDays(cursor.value); return { from: d[0]!, to: d[6]! } }
  if (view.value === 'list') return { from: startOfMonth(cursor.value), to: endOfMonth(cursor.value) }
  const g = monthGrid(cursor.value)
  return { from: g[0]!, to: g[41]! }
})
const title = computed(() => view.value === 'week'
  ? `${formatDate(range.value.from, locale.value, { day: 'numeric', month: 'short' })} – ${formatDate(range.value.to, locale.value, { day: 'numeric', month: 'short', year: 'numeric' })}`
  : monthLabel(cursor.value, locale.value))

// Local copy for optimistic drag & drop with rollback.
const items = ref<Content[]>([])
const q = useQuery(async () => {
  const [c, h] = await Promise.all([
    api.calendar.range(range.value.from, range.value.to, brands.currentBrandId.value),
    api.calendar.holidays(range.value.from, range.value.to),
  ])
  items.value = c
  return { holidays: h }
}, { watch: [range, brands.currentBrandId] })

const visible = computed(() => items.value.filter((c) => (!filters.platform || c.platform === filters.platform) && (!filters.status || c.status === filters.status)))
const byDate = computed(() => {
  const m = new Map<string, Content[]>()
  for (const c of visible.value) {
    if (!c.scheduledDate) continue
    if (!m.has(c.scheduledDate)) m.set(c.scheduledDate, [])
    m.get(c.scheduledDate)!.push(c)
  }
  for (const list of m.values()) list.sort((a, b) => (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99'))
  return m
})
const holidaysByDate = computed(() => {
  const m = new Map<string, Holiday[]>()
  for (const h of q.data.value?.holidays ?? []) { if (!m.has(h.date)) m.set(h.date, []); m.get(h.date)!.push(h) }
  return m
})
const unscheduled = computed(() => visible.value.filter((c) => !c.scheduledDate))
const listDays = computed(() => {
  const days = new Set<string>([...byDate.value.keys(), ...holidaysByDate.value.keys()])
  return [...days].filter((d) => d >= range.value.from && d <= range.value.to).sort()
})

const grid = ref<HTMLElement | null>(null)
async function shift(dir: -1 | 1) {
  cursor.value = view.value === 'week' ? addDays(cursor.value, 7 * dir) : addMonths(cursor.value, dir)
  await nextTick()
  if (grid.value && !prefersReducedMotion()) gsap.fromTo(grid.value, { x: 50 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out', overwrite: true, clearProps: 'transform' })
}
function goToday() { cursor.value = today }
async function setView(v: View) {
  view.value = v
  await nextTick()
  if (grid.value && !prefersReducedMotion()) gsap.fromTo(grid.value, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out', overwrite: true, clearProps: 'transform' })
}
onMounted(() => {
  brands.load().catch(() => {})
  if (window.matchMedia('(max-width: 767px)').matches) view.value = 'list' // mobile list fallback (spec §11)
})

// --- move (drag & drop, keyboard, form) -----------------------------------
const dragId = ref<string | null>(null)
const overDate = ref<string | null>(null)
function onDragStart(e: DragEvent, c: Content) {
  dragId.value = c.id
  e.dataTransfer?.setData('text/plain', c.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() { dragId.value = null; overDate.value = null }
function onDrop(e: DragEvent, date: string | null) {
  const id = e.dataTransfer?.getData('text/plain') || dragId.value
  overDate.value = null
  dragId.value = null
  if (id) move(id, date)
}

async function move(id: string, date: string | null, opts: { silent?: boolean } = {}) {
  const c = items.value.find((x) => x.id === id)
  if (!c || c.scheduledDate === date) return
  if (!date && c.status === 'published') { notify.warning(t('calendar.cantUnschedulePublished')); return }
  const before = { scheduledDate: c.scheduledDate, status: c.status }
  // Dragging never changes publish state; only a scheduled item loses "scheduled" when unscheduled.
  const nextStatus: ContentStatus = !date && c.status === 'scheduled' ? 'approved' : c.status
  Object.assign(c, { scheduledDate: date, status: nextStatus }) // optimistic
  try {
    const updated = await api.contents.update(id, { version: c.version, scheduledDate: date, status: nextStatus })
    Object.assign(c, updated)
    await nextTick()
    const el = document.querySelector(`[data-chip="${id}"]`)
    if (el && !prefersReducedMotion()) gsap.fromTo(el, { scale: 0.7, rotate: -4 }, { scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2.5)' })
    if (!opts.silent) {
      notify.success(date ? t('calendar.moved', { date: formatDate(date, locale.value, { day: 'numeric', month: 'short' }) }) : t('calendar.unscheduled'), c.title, {
        action: { label: t('common.undo'), handler: () => move(id, before.scheduledDate, { silent: true }) },
      })
    }
  } catch (e) {
    Object.assign(c, before) // rollback
    if (isApiError(e) && e.code === 'VERSION_CONFLICT') notify.warning(t('errors.versionConflict'), t('errors.versionConflictHint'), { action: { label: t('common.reload'), handler: () => q.refresh() } })
    else notify.error(t('calendar.moveFailed'), t('calendar.moveFailedBody'), { action: { label: t('common.retry'), handler: () => move(id, date) } })
  }
}

function onChipKey(e: KeyboardEvent, c: Content) {
  if (!e.altKey || !c.scheduledDate) return
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
  if (!delta) return
  e.preventDefault()
  move(c.id, addDays(c.scheduledDate, delta))
  nextTick(() => document.querySelector<HTMLElement>(`[data-chip="${c.id}"]`)?.focus())
}

// --- quick panel (form alternative to drag) --------------------------------
const selected = ref<Content | null>(null)
const quick = reactive({ date: '', time: '', status: 'draft' as ContentStatus })
const quickSaving = ref(false)
function openQuick(c: Content) {
  selected.value = c
  Object.assign(quick, { date: c.scheduledDate ?? '', time: c.scheduledTime ?? '', status: c.status })
}
async function saveQuick() {
  const c = selected.value
  if (!c) return
  if (quick.status === 'scheduled' && !quick.date) { notify.warning(t('content.needDateTitle'), t('content.needDateBody')); return }
  quickSaving.value = true
  try {
    const updated = await api.contents.update(c.id, { version: c.version, scheduledDate: quick.date || null, scheduledTime: quick.time || null, status: quick.status })
    Object.assign(items.value.find((x) => x.id === c.id)!, updated)
    selected.value = null
    notify.success(t('common.saved'), updated.title)
  } catch (e) {
    notify.fromError(e, { retry: saveQuick })
  } finally {
    quickSaving.value = false
  }
}

// --- create manual content on a day (free) ---------------------------------
const createOpen = ref(false)
const createForm = ref<ContentFormModel>(emptyContentForm(undefined))
const createErrors = ref<Record<string, string>>({})
const creating = ref(false)
function openCreate(date: string) {
  if (!brands.active.value.length) { notify.warning(t('generate.noBrandTitle'), t('generate.noBrandBody')); return }
  createForm.value = emptyContentForm(brands.currentBrand.value ?? brands.active.value[0], date)
  createErrors.value = {}
  createOpen.value = true
}
async function create() {
  if (!createForm.value.title.trim()) { createErrors.value = { title: t('validation.required') }; return }
  creating.value = true
  try {
    const c = await api.contents.create(formToInput(createForm.value))
    if (!brands.currentBrandId.value || brands.currentBrandId.value === c.brandId) items.value.push(c)
    createOpen.value = false
    notify.success(t('content.created'), t('content.createdFree'))
  } catch (e) {
    if (isApiError(e)) createErrors.value = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, t(`validation.${v}`)]))
    notify.fromError(e)
  } finally {
    creating.value = false
  }
}

// --- key dates ---------------------------------------------------------------
const keyOpen = ref(false)
const keyForm = reactive({ date: today, title: '' })
async function addKeyDate() {
  if (!isValidISODate(keyForm.date) || !keyForm.title.trim()) { notify.warning(t('errors.invalidInput'), t('calendar.keyDateRequired')); return }
  try {
    await api.calendar.addHoliday({ date: keyForm.date, title: { th: keyForm.title, en: keyForm.title } })
    keyForm.title = ''
    await q.refresh({ silent: true })
    notify.success(t('calendar.keyDateAdded'))
  } catch (e) { notify.fromError(e) }
}
async function removeKeyDate(h: Holiday) {
  const ok = await notify.confirm({ title: t('calendar.removeKeyDate'), message: h.title[locale.value], tone: 'danger', confirmLabel: t('common.remove') })
  if (!ok) return
  try {
    await api.calendar.removeHoliday(h.id)
    await q.refresh({ silent: true })
    notify.success(t('calendar.keyDateRemoved'))
  } catch (e) { notify.fromError(e) }
}

const brandColor = (c: Content) => brands.byId(c.brandId)?.color ?? '#6C4CF5'
const weekdayNames = computed(() => weekdayLabels(locale.value))
</script>

<template>
  <div>
    <UiPageHeader :title="t('nav.calendar')" :subtitle="t('calendar.subtitle')">
      <button type="button" class="btn-secondary" @click="keyOpen = true"><Star class="size-4" />{{ t('calendar.keyDates') }}</button>
      <button type="button" class="btn-primary" @click="openCreate(today)"><Plus class="size-4" />{{ t('content.newManual') }}</button>
    </UiPageHeader>

    <div v-anim class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div class="flex items-center gap-1">
        <button type="button" class="btn-icon btn-ghost" :aria-label="t('calendar.prev')" @click="shift(-1)"><ChevronLeft class="size-5" /></button>
        <button type="button" class="btn-secondary btn-sm" @click="goToday">{{ t('calendar.today') }}</button>
        <button type="button" class="btn-icon btn-ghost" :aria-label="t('calendar.next')" @click="shift(1)"><ChevronRight class="size-5" /></button>
      </div>
      <h2 class="min-w-[10rem] font-display text-xl font-bold" aria-live="polite">{{ title }}</h2>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <select v-model="filters.platform" class="input w-auto py-1.5" :aria-label="t('content.fields.platform')"><option value="">{{ t('content.allPlatforms') }}</option><option v-for="p in PLATFORMS" :key="p" :value="p">{{ PLATFORM_META[p].label }}</option></select>
        <select v-model="filters.status" class="input w-auto py-1.5" :aria-label="t('content.fields.status')"><option value="">{{ t('content.allStatuses') }}</option><option v-for="s in CONTENT_STATUSES" :key="s" :value="s">{{ t(`status.${s}`) }}</option></select>
        <div class="inline-flex rounded-xl border border-line bg-surface-2 p-0.5" role="group" :aria-label="t('calendar.view')">
          <button v-for="v in (['month', 'week', 'list'] as View[])" :key="v" type="button" class="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold" :class="view === v ? 'bg-surface shadow-soft' : 'text-muted'" :aria-pressed="view === v" @click="setView(v)">
            <CalendarDays v-if="v === 'month'" class="size-3.5" /><CalendarRange v-else-if="v === 'week'" class="size-3.5" /><List v-else class="size-3.5" />{{ t(`calendar.${v}`) }}
          </button>
        </div>
      </div>
    </div>

    <UiErrorState v-if="q.error.value && !q.data.value" :error="q.error.value" @retry="q.refresh()" />
    <div v-else class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div ref="grid" class="min-w-0" :class="{ 'opacity-60 transition-opacity': q.pending.value }">
        <!-- MONTH -->
        <div v-if="view === 'month'" class="card overflow-hidden">
          <div class="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-bold text-muted">
            <div v-for="w in weekdayNames" :key="w" class="py-2">{{ w }}</div>
          </div>
          <div class="grid grid-cols-7">
            <div v-for="d in monthGrid(cursor)" :key="d" class="group relative min-h-28 border-b border-r border-line p-1.5 transition-colors [&:nth-child(7n)]:border-r-0"
              :class="[!isSameMonth(d, cursor) && 'bg-surface-2/50', overDate === d && 'bg-brand-500/10 ring-2 ring-inset ring-brand-400']"
              @dragover.prevent="overDate = d" @dragleave="overDate === d && (overDate = null)" @drop.prevent="onDrop($event, d)">
              <div class="flex items-center justify-between">
                <span class="grid size-7 place-items-center rounded-full text-xs font-bold" :class="d === today ? 'bg-brand-500 text-white shadow-pop' : isSameMonth(d, cursor) ? '' : 'text-muted/60'">{{ Number(d.slice(8)) }}</span>
                <button type="button" class="rounded-lg p-1 text-muted opacity-0 transition hover:bg-brand-500/10 hover:text-brand-500 focus:opacity-100 group-hover:opacity-100" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-3.5" /></button>
              </div>
              <p v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" class="mt-1 flex items-center gap-1 truncate rounded-md bg-sun/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-sun" :title="`${h.title[locale]} · ${h.source} (${h.year})`">
                <AlertTriangle v-if="!h.verified" class="size-3 shrink-0" /><Star v-else class="size-3 shrink-0" />{{ h.title[locale] }}
              </p>
              <div class="mt-1 space-y-1">
                <button v-for="c in (byDate.get(d) ?? []).slice(0, 3)" :key="c.id" :data-chip="c.id" type="button" draggable="true"
                  class="flex w-full cursor-grab items-center gap-1 rounded-lg border-l-[3px] bg-surface px-1.5 py-1 text-left text-[11px] font-medium shadow-soft transition hover:-translate-y-px hover:shadow-pop active:cursor-grabbing"
                  :class="dragId === c.id && 'opacity-40'" :style="{ borderLeftColor: brandColor(c) }" :title="`${c.title} — ${t('calendar.dragHint')}`"
                  @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)" @keydown="onChipKey($event, c)">
                  <UiPlatformBadge :platform="c.platform" size="xs" />
                  <span class="min-w-0 flex-1 truncate">{{ c.title }}</span>
                  <span class="size-1.5 shrink-0 rounded-full" :class="STATUS_META[c.status].dot" />
                </button>
                <button v-if="(byDate.get(d)?.length ?? 0) > 3" type="button" class="w-full rounded-lg px-1.5 text-left text-[11px] font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300" @click="cursor = d; setView('week')">+{{ byDate.get(d)!.length - 3 }} {{ t('calendar.more') }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- WEEK -->
        <div v-else-if="view === 'week'" class="grid gap-2 md:grid-cols-7">
          <section v-for="d in weekDays(cursor)" :key="d" class="card min-h-64 p-2 transition-colors" :class="overDate === d && 'bg-brand-500/10 ring-2 ring-brand-400'"
            @dragover.prevent="overDate = d" @dragleave="overDate === d && (overDate = null)" @drop.prevent="onDrop($event, d)">
            <header class="mb-2 flex items-center justify-between px-1">
              <div><p class="text-[11px] font-bold uppercase text-muted">{{ formatDate(d, locale, { weekday: 'short' }) }}</p><p class="font-display text-xl font-bold" :class="d === today && 'text-brand-500'">{{ Number(d.slice(8)) }}</p></div>
              <button type="button" class="btn-icon btn-ghost p-1.5" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-4" /></button>
            </header>
            <p v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" class="mb-1 truncate rounded-md bg-sun/15 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-sun">{{ h.title[locale] }}</p>
            <div class="space-y-1.5">
              <button v-for="c in byDate.get(d) ?? []" :key="c.id" :data-chip="c.id" type="button" draggable="true" class="block w-full cursor-grab rounded-xl border-l-4 bg-surface-2 p-2 text-left text-xs transition hover:shadow-pop"
                :style="{ borderLeftColor: brandColor(c) }" @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)" @keydown="onChipKey($event, c)">
                <span class="flex items-center gap-1.5 text-[10px] text-muted"><UiPlatformBadge :platform="c.platform" size="xs" />{{ c.scheduledTime ?? '' }}</span>
                <span class="mt-1 line-clamp-3 font-semibold">{{ c.title }}</span>
                <UiStatusBadge :status="c.status" small class="mt-1.5" />
              </button>
            </div>
          </section>
        </div>

        <!-- LIST -->
        <div v-else class="space-y-3">
          <p v-if="!listDays.length" class="card p-8 text-center text-muted">{{ t('calendar.emptyMonth') }}</p>
          <section v-for="(d, i) in listDays" :key="d" v-anim="{ delay: Math.min(i, 10) * 0.04 }" class="card overflow-hidden">
            <header class="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
              <span class="font-display text-lg font-bold" :class="d === today && 'text-brand-500'">{{ formatDate(d, locale, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
              <span v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" class="chip bg-sun/15 text-amber-700 dark:text-sun">{{ h.title[locale] }}</span>
              <button type="button" class="btn-icon btn-ghost ml-auto p-1.5" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-4" /></button>
            </header>
            <button v-for="c in byDate.get(d) ?? []" :key="c.id" type="button" class="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-surface-2" @click="openQuick(c)">
              <span class="w-12 shrink-0 text-xs font-semibold text-muted">{{ c.scheduledTime ?? '—' }}</span>
              <span class="h-8 w-1 shrink-0 rounded-full" :style="{ background: brandColor(c) }" />
              <UiPlatformBadge :platform="c.platform" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ c.title }}</span>
              <UiStatusBadge :status="c.status" small />
            </button>
          </section>
        </div>
      </div>

      <!-- Unscheduled tray -->
      <aside class="card h-fit p-3 xl:sticky xl:top-24" :class="overDate === 'tray' && 'ring-2 ring-brand-400'"
        @dragover.prevent="overDate = 'tray'" @dragleave="overDate === 'tray' && (overDate = null)" @drop.prevent="onDrop($event, null)">
        <h2 class="flex items-center gap-2 px-1 font-display text-lg font-bold"><Inbox class="size-5 text-brand-500" />{{ t('calendar.tray') }}<span class="chip ml-auto bg-surface-2 text-muted">{{ unscheduled.length }}</span></h2>
        <p class="px-1 text-xs text-muted">{{ t('calendar.trayHint') }}</p>
        <div class="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto scrollbar-thin">
          <button v-for="c in unscheduled" :key="c.id" :data-chip="c.id" type="button" draggable="true" class="flex w-full cursor-grab items-center gap-2 rounded-xl border-l-4 bg-surface-2 p-2 text-left text-xs transition hover:shadow-pop"
            :style="{ borderLeftColor: brandColor(c) }" @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)">
            <UiPlatformBadge :platform="c.platform" size="xs" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ c.title }}</span>
          </button>
          <p v-if="!unscheduled.length" class="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">{{ t('calendar.trayEmpty') }}</p>
        </div>
        <p class="mt-3 px-1 text-[11px] text-muted">{{ t('calendar.keyboardHint') }}</p>
      </aside>
    </div>

    <SidePanel :open="!!selected" size="sm" :title="selected?.title" :subtitle="brands.byId(selected?.brandId)?.name" @close="selected = null">
      <template v-if="selected">
        <div class="flex flex-wrap items-center gap-2"><UiPlatformBadge :platform="selected.platform" with-label /><UiStatusBadge :status="selected.status" /><span class="chip bg-pink/10 text-pink">{{ selected.pillar }}</span></div>
        <p class="rounded-2xl bg-surface-2 p-3 text-sm">{{ selected.hook || selected.caption.slice(0, 160) }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="q-date">{{ t('content.fields.scheduledDate') }}</label><input id="q-date" v-model="quick.date" type="date" class="input"></div>
          <div><label class="label" for="q-time">{{ t('content.fields.scheduledTime') }}</label><input id="q-time" v-model="quick.time" type="time" class="input"></div>
        </div>
        <div>
          <label class="label" for="q-status">{{ t('content.fields.status') }}</label>
          <select id="q-status" v-model="quick.status" class="input"><option v-for="s in CONTENT_STATUSES" :key="s" :value="s">{{ t(`status.${s}`) }}</option></select>
          <p class="hint">{{ t('content.statusHint') }}</p>
        </div>
        <NuxtLink :to="`/app/content/${selected.id}`" class="btn-ghost w-full"><ExternalLink class="size-4" />{{ t('calendar.openEditor') }}</NuxtLink>
      </template>
      <template #footer>
        <button type="button" class="btn-secondary" @click="selected = null">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="quickSaving" @click="saveQuick">{{ quickSaving ? t('common.saving') : t('common.save') }}</button>
      </template>
    </SidePanel>

    <SidePanel :open="createOpen" size="lg" :title="t('content.newManual')" :subtitle="t('content.newManualHint')" @close="createOpen = false">
      <ContentForm v-model="createForm" :brands="brands.active.value" :errors="createErrors" compact />
      <template #footer>
        <button type="button" class="btn-secondary" @click="createOpen = false">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="creating" @click="create">{{ creating ? t('common.saving') : t('content.createFree') }}</button>
      </template>
    </SidePanel>

    <SidePanel :open="keyOpen" :title="t('calendar.keyDates')" :subtitle="t('calendar.keyDatesHint')" @close="keyOpen = false">
      <div class="rounded-2xl border border-line p-4">
        <p class="font-semibold">{{ t('calendar.addKeyDate') }}</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
          <input v-model="keyForm.date" type="date" class="input" :aria-label="t('content.fields.scheduledDate')">
          <input v-model="keyForm.title" class="input" maxlength="120" :placeholder="t('calendar.keyDatePh')" @keydown.enter.prevent="addKeyDate">
        </div>
        <button type="button" class="btn-primary btn-sm mt-3" @click="addKeyDate"><Plus class="size-4" />{{ t('common.add') }}</button>
      </div>
      <ul class="space-y-2">
        <li v-for="h in q.data.value?.holidays ?? []" :key="h.id" class="flex items-start gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span class="w-20 shrink-0 font-semibold">{{ formatDate(h.date, locale, { day: 'numeric', month: 'short' }) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium">{{ h.title[locale] }}</span>
            <span class="text-xs text-muted">{{ h.custom ? t('calendar.customDate') : `${h.source} · ${h.year}` }}</span>
            <span v-if="!h.verified" class="mt-1 flex items-center gap-1 text-xs font-semibold text-warning"><AlertTriangle class="size-3" />{{ t('calendar.unverified') }}</span>
          </span>
          <button v-if="h.custom" type="button" class="btn-icon btn-ghost p-1.5 text-danger" :aria-label="t('common.remove')" @click="removeKeyDate(h)"><Trash2 class="size-4" /></button>
        </li>
      </ul>
    </SidePanel>
  </div>
</template>
