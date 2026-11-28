<script setup lang="ts">
import { AlertTriangle, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Inbox, List, LoaderCircle, Plus, Star, Trash2, ExternalLink } from '@lucide/vue'
import { gsap } from 'gsap'
import type { Content, ContentFormModel, ContentStatus, Holiday, Platform } from '~/types'
import { CONTENT_STATUSES, PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const opt = useSelectOptions()
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
  return { from: g[0]!, to: g[g.length - 1]! }
})
const title = computed(() => view.value === 'week'
  ? `${formatDate(range.value.from, locale.value, { day: 'numeric', month: 'short' })} – ${formatDate(range.value.to, locale.value, { day: 'numeric', month: 'short', year: 'numeric' })}`
  : monthLabel(cursor.value, locale.value))

// Local copy for optimistic drag & drop with rollback.
// The unscheduled tray doesn't depend on the visible dates, so it is fetched once
// (and again only when the brand scope changes). Navigating months/weeks only
// fetches scheduled items and keeps the tray's objects untouched — no reload,
// no re-render, no re-animation. Moves between tray and calendar happen locally.
const items = ref<Content[]>([])
let trayBrand: string | null | undefined // brand the tray was loaded for; undefined = not loaded
let trayChanged = false
// Identifies what's on screen; data is only shown when it matches.
const rangeKey = computed(() => `${range.value.from}|${range.value.to}|${brands.currentBrandId.value ?? ''}`)
const q = useQuery(async () => {
  const key = rangeKey.value
  const brandId = brands.currentBrandId.value
  const needTray = trayBrand !== brandId
  const [contents, holidays] = await Promise.all([
    api.calendar.range(range.value.from, range.value.to, brandId, { includeUnscheduled: needTray }),
    api.calendar.holidays(range.value.from, range.value.to),
  ])
  return { key, brandId, needTray, contents, holidays }
}, { watch: [rangeKey] })
// Applied here, not inside the fetch: useQuery discards out-of-order responses,
// so a slow older request can never overwrite newer posts.
watch(() => q.data.value, (d) => {
  if (!d) return
  if (d.needTray) {
    items.value = d.contents
    trayBrand = d.brandId
    trayChanged = true
  } else {
    // Keep the existing tray objects; swap in only the scheduled items.
    items.value = [...items.value.filter((x) => !x.scheduledDate), ...d.contents.filter((x) => x.scheduledDate)]
  }
  nextTick(() => afterCurtain(curtain, reveal))
})
/** The visible range's data has arrived (silent refreshes keep it true). */
const ready = computed(() => q.data.value?.key === rangeKey.value && q.ready.value)
/** Tray is (re)loading for a newly selected brand. */
const trayLoading = computed(() => !ready.value && trayBrand !== brands.currentBrandId.value)
/** Full reload including the tray (after a conflict or an error). */
function reloadAll() { trayBrand = undefined; return q.refresh() }

const visible = computed(() => items.value.filter((c) => (!filters.platform || platformsOf(c).includes(filters.platform as Platform)) && (!filters.status || c.status === filters.status)))
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
  revealDir = dir > 0 ? 'start' : 'end' // the ripple direction shows which way we moved
}

// --- motion ------------------------------------------------------------------
// 1) revealFrame: the day cells / week columns cascade in (load, month/week change, view change).
// 2) revealItems: post chips, dots, key-date tags and tray rows pop in whenever data arrives or filters change.
// CSS transitions on those elements are paused while GSAP drives them, so the two never fight.
const curtain = useCurtain()
function tween(els: Element[] | NodeListOf<Element>, from: gsap.TweenVars, to: gsap.TweenVars) {
  const list = Array.from(els) as HTMLElement[]
  if (!list.length) return
  list.forEach((el) => { el.style.transition = 'none' })
  gsap.fromTo(list, from, { ...to, overwrite: true, clearProps: 'transform,opacity', onComplete: () => list.forEach((el) => { el.style.transition = '' }) })
}
// Every element gets exactly one entrance. Items revealed (on their own or as
// part of a cell/column ripple) are marked data-shown, so a later refetch that
// returns the same posts, or a view change, never animates them a second time.
const ITEM_SEL = '[data-cell] [data-chip], [data-day] [data-chip], [data-dot], [data-holiday]'
function markShown(els: Iterable<Element>) { for (const el of els) (el as HTMLElement).dataset.shown = '' }
function revealFrame(from: 'start' | 'end' = 'start') {
  if (!grid.value) return
  const root = grid.value
  // Items already on screen move in with their cell/column, so they don't pop again.
  markShown(root.querySelectorAll(ITEM_SEL))
  if (prefersReducedMotion()) return
  if (view.value === 'month') {
    const cells = root.querySelectorAll('[data-cell]')
    tween(cells, { opacity: 0, y: 10, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out', stagger: { grid: [Math.ceil(cells.length / 7), 7], from, amount: 0.35 } })
    tween(root.querySelectorAll('[data-today]'), { scale: 0 }, { scale: 1, duration: 0.6, delay: 0.3, ease: 'back.out(3)' })
  } else if (view.value === 'week') {
    tween(root.querySelectorAll('[data-day]'), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', stagger: { each: 0.05, from } })
  }
}
function revealItems() {
  if (!grid.value) return
  if (prefersReducedMotion()) { markShown(grid.value.querySelectorAll(ITEM_SEL)); return }
  const root = grid.value.parentElement ?? grid.value
  if (view.value !== 'list') {
    // Only items that haven't had their entrance yet (new data, filters revealing more).
    const fresh = [...root.querySelectorAll(ITEM_SEL)].filter((el) => !(el as HTMLElement).hasAttribute('data-shown'))
    markShown(fresh)
    tween(fresh, { opacity: 0, scale: 0.6, y: 6 }, { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(2)', stagger: { amount: Math.min(0.4, fresh.length * 0.03) }, delay: 0.15 })
  }
  // The tray only animates when it was actually (re)loaded, not on month/week navigation.
  if (trayChanged) {
    trayChanged = false
    tween(root.querySelectorAll('[data-tray]'), { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out', stagger: 0.03, delay: 0.1 })
  }
  revealAgenda()
}
// Entrance runs when the data for what's on screen lands (not on click, when the
// content is still a skeleton): the frame ripples in once per view+range, and
// after that only genuinely new items pop.
let revealedKey = ''
let revealDir: 'start' | 'end' = 'start'
function reveal() {
  if (!ready.value) return
  const k = `${view.value}|${rangeKey.value}`
  if (k !== revealedKey) {
    revealedKey = k
    revealFrame(revealDir)
    revealDir = 'start'
  }
  revealItems()
}
const agendaEl = ref<HTMLElement | null>(null)
function revealAgenda() {
  if (prefersReducedMotion() || !agendaEl.value) return
  tween(agendaEl.value.querySelectorAll('[data-agenda]'), { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out', stagger: 0.04 })
}
watch(() => [filters.platform, filters.status], () => nextTick(revealItems))
function goToday() { cursor.value = today; selectedDay.value = today }

// Phones: month cells show dots; tapping a day lists its items below the grid.
const selectedDay = ref(today)
watch(cursor, (c) => { if (!isSameMonth(selectedDay.value, c)) selectedDay.value = c })
// Swipe the month grid sideways to change month (touch only).
let swipe: { x: number; y: number } | null = null
function onSwipeStart(e: PointerEvent) { swipe = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : null }
function onSwipeEnd(e: PointerEvent) {
  if (!swipe) return
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y
  swipe = null
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1)
}
async function setView(v: View) {
  if (v === view.value) return
  view.value = v
  await nextTick()
  // One entrance per view: month cells / week columns ripple in with their posts
  // inside; list sections use their own v-anim. If the range changed, the
  // skeleton shows until the data lands and the watcher reveals it.
  reveal()
}
watch(selectedDay, () => nextTick(() => {
  revealAgenda()
  const n = grid.value?.querySelector(`[data-cell="${selectedDay.value}"] [data-num]`)
  if (n && !prefersReducedMotion()) gsap.fromTo(n, { scale: 0.7 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', overwrite: true, clearProps: 'transform' })
}))
onMounted(() => {
  brands.load().catch(() => {})
  if (window.matchMedia('(max-width: 767px)').matches) view.value = 'list' // mobile list fallback (spec §11)
})

// --- move (drag & drop, keyboard, form) -----------------------------------
const dragId = ref<string | null>(null)
const overDate = ref<string | null>(null)
// Team Workspace: only roles with content.update can move items (backend enforces too).
const perms = usePerms()
const canMove = (c: Content) => !brands.loaded.value || perms.can('content.update', c.brandId)
const creatableBrands = computed(() => perms.brandsWhere('content.create'))
const canCreateAny = computed(() => !brands.loaded.value || creatableBrands.value.length > 0)
function onDragStart(e: DragEvent, c: Content) {
  if (!canMove(c)) { e.preventDefault(); return }
  dragId.value = c.id
  e.dataTransfer?.setData('text/plain', c.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd() { dragId.value = null; overDate.value = null }
function onDrop(e: DragEvent, date: string | null) {
  const id = e.dataTransfer?.getData('text/plain') || dragId.value
  const c = items.value.find((x) => x.id === id)
  if (c && !canMove(c)) { overDate.value = null; dragId.value = null; return }
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
    const target = date && document.querySelector(`[data-cell="${date}"], [data-day="${date}"]`)
    if (target && !prefersReducedMotion()) gsap.fromTo(target, { boxShadow: 'inset 0 0 0 3px rgba(108,76,245,0.55)' }, { boxShadow: 'inset 0 0 0 0px rgba(108,76,245,0)', duration: 0.9, ease: 'power2.out', clearProps: 'boxShadow' })
    if (!opts.silent) {
      notify.success(date ? t('calendar.moved', { date: formatDate(date, locale.value, { day: 'numeric', month: 'short' }) }) : t('calendar.unscheduled'), c.title, {
        action: { label: t('common.undo'), handler: () => move(id, before.scheduledDate, { silent: true }) },
      })
    }
  } catch (e) {
    Object.assign(c, before) // rollback
    if (isApiError(e) && e.code === 'VERSION_CONFLICT') notify.warning(t('errors.versionConflict'), t('errors.versionConflictHint'), { action: { label: t('common.reload'), handler: () => reloadAll() } })
    else notify.error(t('calendar.moveFailed'), t('calendar.moveFailedBody'), { action: { label: t('common.retry'), handler: () => move(id, date) } })
  }
}

/** A post created here gets the same entrance as posts that arrive with data. */
async function popIn(id: string) {
  await nextTick()
  const els = document.querySelectorAll(`[data-chip="${id}"]`)
  markShown(els)
  if (prefersReducedMotion()) return
  tween(els, { opacity: 0, scale: 0.6, y: 6 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(2)', delay: 0.2 })
}

function onChipKey(e: KeyboardEvent, c: Content) {
  if (!e.altKey || !c.scheduledDate || !canMove(c)) return
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
  if (!creatableBrands.value.length) return
  // A locked brand is in scope: say so instead of quietly creating the post in another brand.
  const scopedLocked = brands.currentBrand.value?.locked ? brands.currentBrand.value : null
  if (scopedLocked) {
    notify.warning(t('brands.lockedTitle'), `${scopedLocked.name} · ${scopedLocked.isBillingOwner ? t('brands.lockedOwner') : t('brands.lockedMember')}`,
      scopedLocked.isBillingOwner ? { action: { label: t('brands.renewBrand'), handler: () => navigateTo('/app/plan#brands') } } : undefined)
    return
  }
  const scoped = brands.currentBrand.value && creatableBrands.value.includes(brands.currentBrand.value) ? brands.currentBrand.value : creatableBrands.value[0]
  createForm.value = emptyContentForm(scoped, date)
  createErrors.value = {}
  createOpen.value = true
}
async function create() {
  if (!createForm.value.title.trim()) { createErrors.value = { title: t('validation.required') }; return }
  creating.value = true
  try {
    const c = await api.contents.create(formToInput(createForm.value))
    if (!brands.currentBrandId.value || brands.currentBrandId.value === c.brandId) {
      items.value.push(c)
      popIn(c.id)
    }
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
      <button v-if="canCreateAny" type="button" class="btn-primary" @click="openCreate(today)"><Plus class="size-4" />{{ t('content.newManual') }}</button>
    </UiPageHeader>

    <div v-anim class="mb-4 flex flex-wrap items-center gap-2 sm:rounded-3xl sm:border sm:border-line sm:bg-surface sm:p-3 sm:shadow-soft">
      <div class="flex w-full items-center gap-1 sm:w-auto">
        <button type="button" class="btn-icon btn-ghost" :aria-label="t('calendar.prev')" @click="shift(-1)"><ChevronLeft class="size-5" /></button>
        <button type="button" class="btn-secondary btn-sm max-sm:order-last max-sm:ml-1 max-sm:rounded-full" @click="goToday">{{ t('calendar.today') }}</button>
        <h2 class="flex flex-1 items-center justify-center gap-2 font-display text-xl font-bold sm:hidden" aria-live="polite">{{ title }}<LoaderCircle v-if="!ready" class="size-4 animate-spin text-brand-500" :aria-label="t('common.loading')" /></h2>
        <button type="button" class="btn-icon btn-ghost" :aria-label="t('calendar.next')" @click="shift(1)"><ChevronRight class="size-5" /></button>
      </div>
      <h2 class="hidden min-w-[10rem] items-center gap-2 font-display text-xl font-bold sm:flex" aria-live="polite">{{ title }}<LoaderCircle v-if="!ready" class="size-4 animate-spin text-brand-500" :aria-label="t('common.loading')" /></h2>
      <div class="h-scroll w-full items-center sm:ml-auto sm:w-auto sm:flex-wrap sm:overflow-visible">
        <div class="segmented" role="group" :aria-label="t('calendar.view')">
          <button v-for="v in (['month', 'week', 'list'] as View[])" :key="v" type="button" class="flex items-center gap-1.5 !py-1.5 text-xs" :aria-pressed="view === v" @click="setView(v)">
            <CalendarDays v-if="v === 'month'" class="size-3.5" /><CalendarRange v-else-if="v === 'week'" class="size-3.5" /><List v-else class="size-3.5" />{{ t(`calendar.${v}`) }}
          </button>
        </div>
        <UiSelect v-model="filters.platform" size="pill" :active="!!filters.platform" :aria-label="t('content.fields.platform')" :options="opt.withAll(t('content.allPlatforms'), opt.platforms.value)" />
        <UiSelect v-model="filters.status" size="pill" :active="!!filters.status" :aria-label="t('content.fields.status')" :options="opt.withAll(t('content.allStatuses'), opt.statuses.value)" />
      </div>
    </div>

    <UiErrorState v-if="q.error.value && !ready" :error="q.error.value" @retry="reloadAll()" />
    <div v-else class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div ref="grid" class="min-w-0" :aria-busy="!ready">
        <!-- Loading: a skeleton shaped like the current view (never stale data). -->
        <template v-if="!ready">
          <div v-if="view === 'month'" class="card overflow-hidden" aria-hidden="true">
            <div class="grid grid-cols-7 border-b border-line bg-surface-2"><div v-for="w in weekdayNames" :key="w" class="py-2"><div class="skeleton mx-auto h-3 w-8" /></div></div>
            <div class="grid grid-cols-7">
              <div v-for="d in monthGrid(cursor)" :key="d" class="min-h-14 border-b border-r border-line p-1.5 sm:min-h-28 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0">
                <div class="skeleton size-6 rounded-full max-sm:mx-auto" />
                <div class="skeleton mt-2 hidden h-5 w-11/12 rounded-lg sm:block" :class="Number(d.slice(8)) % 3 ? 'opacity-0' : ''" />
              </div>
            </div>
          </div>
          <div v-else-if="view === 'week'" class="grid gap-2 md:grid-cols-7" aria-hidden="true">
            <div v-for="i in 7" :key="i" class="card p-2 md:min-h-64"><div class="skeleton h-3 w-10" /><div class="skeleton mt-2 h-6 w-8" /><div class="skeleton mt-4 h-16 w-full rounded-xl" /></div>
          </div>
          <div v-else class="space-y-3" aria-hidden="true">
            <div v-for="i in 4" :key="i" class="card overflow-hidden"><div class="border-b border-line bg-surface-2 px-4 py-3"><div class="skeleton h-5 w-48" /></div><div class="flex items-center gap-3 px-4 py-3.5"><div class="skeleton h-4 w-12" /><div class="skeleton h-5 flex-1" /><div class="skeleton h-5 w-20 rounded-full" /></div></div>
          </div>
        </template>
        <template v-else>
        <!-- MONTH -->
        <div v-if="view === 'month'" class="card touch-pan-y overflow-hidden" @pointerdown="onSwipeStart" @pointerup="onSwipeEnd" @pointercancel="swipe = null">
          <div class="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-xs font-bold text-muted">
            <div v-for="w in weekdayNames" :key="w" class="py-2 max-sm:text-[0.6875rem]">{{ w }}</div>
          </div>
          <div class="grid grid-cols-7">
            <div v-for="d in monthGrid(cursor)" :key="d" :data-cell="d" class="group relative min-h-14 border-b border-r border-line p-1 transition-colors max-sm:cursor-pointer sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0"
              :class="[!isSameMonth(d, cursor) && 'bg-surface-2/50', overDate === d && 'bg-brand-500/10 ring-2 ring-inset ring-brand-400', selectedDay === d && 'max-sm:bg-brand-500/8']"
              @click="selectedDay = d"
              @dragover.prevent="overDate = d" @dragleave="overDate === d && (overDate = null)" @drop.prevent="onDrop($event, d)">
              <div class="flex items-center justify-center sm:justify-between">
                <span data-num :data-today="d === today ? '' : undefined" class="grid size-7 place-items-center rounded-full text-xs font-bold transition"
                  :class="[d === today ? 'bg-brand-500 text-white shadow-pop' : isSameMonth(d, cursor) ? '' : 'text-muted/60', selectedDay === d && d !== today && 'max-sm:bg-fg max-sm:text-bg']">{{ Number(d.slice(8)) }}</span>
                <button v-if="canCreateAny" type="button" class="hidden rounded-lg p-1 sm:block text-muted opacity-0 transition hover:bg-brand-500/10 hover:text-brand-500 focus:opacity-100 group-hover:opacity-100" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-3.5" /></button>
              </div>
              <!-- phones: dots -->
              <div class="mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden="true">
                <span v-if="holidaysByDate.get(d)?.length" data-dot class="size-1.5 rounded-full bg-sun" />
                <span v-for="c in (byDate.get(d) ?? []).slice(0, 3)" :key="c.id" data-dot class="size-1.5 rounded-full" :style="{ background: brandColor(c) }" />
              </div>
              <p v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" data-holiday class="mt-1 hidden items-center gap-1 truncate rounded-md sm:flex bg-sun/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-amber-700 dark:text-sun" :title="`${h.title[locale]} · ${h.source} (${h.year})`">
                <AlertTriangle v-if="!h.verified" class="size-3 shrink-0" /><Star v-else class="size-3 shrink-0" />{{ h.title[locale] }}
              </p>
              <div class="mt-1 hidden space-y-1 sm:block">
                <button v-for="c in (byDate.get(d) ?? []).slice(0, 3)" :key="c.id" :data-chip="c.id" type="button" :draggable="canMove(c)"
                  class="flex w-full cursor-grab items-center gap-1 rounded-lg border-l-[3px] bg-surface px-1.5 py-1 text-left text-[0.6875rem] font-medium shadow-soft transition hover:-translate-y-px hover:shadow-pop active:cursor-grabbing"
                  :class="dragId === c.id && 'opacity-40'" :style="{ borderLeftColor: brandColor(c) }" :title="`${c.title} — ${t('calendar.dragHint')}`"
                  @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)" @keydown="onChipKey($event, c)">
                  <UiPlatformStack :content="c" size="xs" :max="3" />
                  <span class="min-w-0 flex-1 truncate">{{ c.title }}</span>
                  <UiImageCount :count="c.imageCount" compact />
                  <span class="size-1.5 shrink-0 rounded-full" :class="STATUS_META[c.status].dot" />
                </button>
                <button v-if="(byDate.get(d)?.length ?? 0) > 3" type="button" class="w-full rounded-lg px-1.5 text-left text-[0.6875rem] font-semibold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300" @click="cursor = d; setView('week')">+{{ byDate.get(d)!.length - 3 }} {{ t('calendar.more') }}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Phones: agenda for the tapped day -->
        <section v-if="view === 'month'" ref="agendaEl" class="mt-4 sm:hidden">
          <div class="mb-2 flex items-center justify-between px-1">
            <h3 class="font-display text-lg font-bold" :class="selectedDay === today && 'text-brand-500'">{{ formatDate(selectedDay, locale, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h3>
            <button v-if="canCreateAny" type="button" class="btn-icon btn-ghost text-brand-500" :aria-label="t('calendar.addOn', { date: formatDate(selectedDay, locale) })" @click="openCreate(selectedDay)"><Plus class="size-5" /></button>
          </div>
          <p v-for="h in holidaysByDate.get(selectedDay) ?? []" :key="h.id" data-agenda class="mb-2 flex items-center gap-2 rounded-2xl bg-sun/15 px-3 py-2 text-sm font-semibold text-amber-700 dark:text-sun">
            <AlertTriangle v-if="!h.verified" class="size-4 shrink-0" /><Star v-else class="size-4 shrink-0" />{{ h.title[locale] }}
          </p>
          <div v-if="byDate.get(selectedDay)?.length" class="card divide-y divide-line overflow-hidden">
            <button v-for="c in byDate.get(selectedDay)" :key="c.id" data-agenda type="button" class="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2" @click="openQuick(c)">
              <span class="h-9 w-1 shrink-0 rounded-full" :style="{ background: brandColor(c) }" />
              <UiPlatformStack :content="c" :max="3" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ c.title }}</span>
                <span class="flex items-center gap-2 text-xs text-muted">{{ c.scheduledTime ?? t('content.unscheduled') }}<UiImageCount :count="c.imageCount" /></span>
              </span>
              <UiStatusBadge :status="c.status" small />
            </button>
          </div>
          <button v-else-if="canCreateAny" data-agenda type="button" class="w-full rounded-[1.5rem] border border-dashed border-line p-5 text-center text-sm text-muted active:bg-surface-2" @click="openCreate(selectedDay)">
            <Plus class="mx-auto mb-1 size-5" />{{ t('calendar.addOn', { date: formatDate(selectedDay, locale, { day: 'numeric', month: 'short' }) }) }}
          </button>
        </section>

        <!-- WEEK -->
        <div v-else-if="view === 'week'" class="grid gap-2 md:grid-cols-7">
          <section v-for="d in weekDays(cursor)" :key="d" :data-day="d" class="card p-2 transition-colors md:min-h-64" :class="overDate === d && 'bg-brand-500/10 ring-2 ring-brand-400'"
            @dragover.prevent="overDate = d" @dragleave="overDate === d && (overDate = null)" @drop.prevent="onDrop($event, d)">
            <header class="mb-2 flex items-center justify-between px-1">
              <div><p class="text-[0.6875rem] font-bold uppercase text-muted">{{ formatDate(d, locale, { weekday: 'short' }) }}</p><p class="font-display text-xl font-bold" :class="d === today && 'text-brand-500'">{{ Number(d.slice(8)) }}</p></div>
              <button v-if="canCreateAny" type="button" class="btn-icon btn-ghost p-1.5" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-4" /></button>
            </header>
            <p v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" data-holiday class="mb-1 truncate rounded-md bg-sun/15 px-2 py-1 text-[0.6875rem] font-semibold text-amber-700 dark:text-sun">{{ h.title[locale] }}</p>
            <div class="space-y-1.5">
              <button v-for="c in byDate.get(d) ?? []" :key="c.id" :data-chip="c.id" type="button" :draggable="canMove(c)" class="block w-full cursor-grab rounded-xl border-l-4 bg-surface-2 p-2 text-left text-xs transition hover:shadow-pop"
                :style="{ borderLeftColor: brandColor(c) }" @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)" @keydown="onChipKey($event, c)">
                <span class="flex items-center gap-1.5 text-[0.625rem] text-muted"><UiPlatformStack :content="c" size="xs" :max="3" />{{ c.scheduledTime ?? '' }}<UiImageCount class="ml-auto" :count="c.imageCount" compact /></span>
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
            <header class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2.5">
              <span class="font-display text-base font-bold sm:text-lg" :class="d === today && 'text-brand-500'">{{ formatDate(d, locale, { weekday: 'long', day: 'numeric', month: 'long' }) }}</span>
              <span v-for="h in holidaysByDate.get(d) ?? []" :key="h.id" class="chip bg-sun/15 text-amber-700 dark:text-sun">{{ h.title[locale] }}</span>
              <button v-if="canCreateAny" type="button" class="btn-icon btn-ghost ml-auto p-1.5" :aria-label="t('calendar.addOn', { date: formatDate(d, locale) })" @click="openCreate(d)"><Plus class="size-4" /></button>
            </header>
            <button v-for="c in byDate.get(d) ?? []" :key="c.id" type="button" class="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-0 hover:bg-surface-2 active:bg-surface-2 sm:py-3" @click="openQuick(c)">
              <span class="w-12 shrink-0 text-xs font-semibold text-muted">{{ c.scheduledTime ?? '—' }}</span>
              <span class="h-8 w-1 shrink-0 rounded-full" :style="{ background: brandColor(c) }" />
              <UiPlatformStack :content="c" :max="3" />
              <span class="min-w-0 flex-1 truncate font-medium">{{ c.title }}</span>
              <UiImageCount :count="c.imageCount" />
              <UiStatusBadge :status="c.status" small />
            </button>
          </section>
        </div>
        </template>
      </div>

      <!-- Unscheduled tray -->
      <aside v-anim="{ from: 'right' }" class="card h-fit p-3 xl:sticky xl:top-24" :class="overDate === 'tray' && 'ring-2 ring-brand-400'"
        @dragover.prevent="overDate = 'tray'" @dragleave="overDate === 'tray' && (overDate = null)" @drop.prevent="onDrop($event, null)">
        <h2 class="flex items-center gap-2 px-1 font-display text-lg font-bold"><Inbox class="size-5 text-brand-500" />{{ t('calendar.tray') }}<span class="chip ml-auto bg-surface-2 text-muted">{{ unscheduled.length }}</span></h2>
        <p class="px-1 text-xs text-muted">{{ t('calendar.trayHint') }}</p>
        <div class="relative mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto scrollbar-thin">
          <template v-if="trayLoading"><div v-for="i in 4" :key="i" class="skeleton h-9 rounded-xl" aria-hidden="true" /></template>
          <button v-for="c in unscheduled" v-else :key="c.id" :data-chip="c.id" data-tray type="button" :draggable="canMove(c)" class="flex w-full cursor-grab items-center gap-2 rounded-xl border-l-4 bg-surface-2 p-2 text-left text-xs transition hover:shadow-pop"
            :style="{ borderLeftColor: brandColor(c) }" @dragstart="onDragStart($event, c)" @dragend="onDragEnd" @click="openQuick(c)">
            <UiPlatformStack :content="c" size="xs" :max="3" />
            <span class="min-w-0 flex-1 truncate font-medium">{{ c.title }}</span>
          </button>
          <p v-if="!trayLoading && !unscheduled.length" class="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">{{ t('calendar.trayEmpty') }}</p>
        </div>
        <p class="mt-3 px-1 text-[0.6875rem] text-muted">{{ t('calendar.keyboardHint') }}</p>
      </aside>
    </div>

    <SidePanel :open="!!selected" size="sm" :title="selected?.title" :subtitle="brands.byId(selected?.brandId)?.name" @close="selected = null">
      <template v-if="selected">
        <div class="flex flex-wrap items-center gap-2"><UiPlatformBadge v-if="(selected.destinations?.length ?? 1) <= 1" :platform="selected.platform" with-label /><UiPlatformStack v-else :content="selected" with-progress /><UiStatusBadge :status="selected.status" /><span class="chip bg-pink/10 text-pink">{{ selected.pillar }}</span></div>
        <p class="rounded-2xl bg-surface-2 p-3 text-sm">{{ selected.hook || selected.caption.slice(0, 160) }}</p>
        <fieldset :disabled="!canMove(selected)" class="contents">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="q-date">{{ t('content.fields.scheduledDate') }}</label><input id="q-date" v-model="quick.date" type="date" class="input"></div>
          <div><label class="label" for="q-time">{{ t('content.fields.scheduledTime') }}</label><input id="q-time" v-model="quick.time" type="time" class="input"></div>
        </div>
        <div>
          <label class="label" for="q-status">{{ t('content.fields.status') }}</label>
          <UiSelect id="q-status" v-model="quick.status" :options="opt.statuses.value" />
          <p class="hint">{{ t('content.statusHint') }}</p>
        </div>
        </fieldset>
        <p v-if="!canMove(selected)" class="rounded-2xl bg-surface-2 p-3 text-xs text-muted">{{ t('content.viewOnly') }}</p>
        <NuxtLink :to="`/app/content/${selected.id}`" class="btn-ghost w-full"><ExternalLink class="size-4" />{{ t('calendar.openEditor') }}</NuxtLink>
      </template>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button v-if="selected && canMove(selected)" type="button" class="btn-primary" :disabled="quickSaving" @click="saveQuick">{{ quickSaving ? t('common.saving') : t('common.save') }}</button>
      </template>
    </SidePanel>

    <SidePanel :open="createOpen" size="lg" :title="t('content.newManual')" :subtitle="t('content.newManualHint')" @close="createOpen = false">
      <ContentForm v-model="createForm" :brands="creatableBrands" :errors="createErrors" compact />
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
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
