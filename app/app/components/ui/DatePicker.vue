<script setup lang="ts">
import { gsap } from 'gsap'
import { CalendarDays, ChevronLeft, ChevronRight, X } from '@lucide/vue'

/**
 * Plannity date picker — replaces native <input type="date"> everywhere.
 * Value: 'YYYY-MM-DD' (Bangkok calendar day) or '' when empty, like the native input.
 *
 * - Trigger styled like UiSelect (md / pill / sm); shows the date in the UI language
 *   (Thai uses the Buddhist year, as everywhere else in the app).
 * - Panel: month grid (weeks start Sunday, like the calendar page), today ring,
 *   min/max, month ↔ year jump, Today / Clear shortcuts.
 * - Keyboard: arrows move a day/week, PageUp/PageDown a month (+Shift: a year),
 *   Home/End the week, Enter picks, Esc closes. ARIA grid with aria-activedescendant.
 */
const props = withDefaults(defineProps<{
  id?: string
  ariaLabel?: string
  placeholder?: string
  min?: string
  max?: string
  size?: 'md' | 'pill' | 'sm'
  invalid?: boolean
  disabled?: boolean
  /** Show the × button and the Clear shortcut (off for required ranges). */
  clearable?: boolean
}>(), { size: 'md', clearable: true })
const model = defineModel<string | null>()
const emit = defineEmits<{ change: [string] }>()

const { t, locale } = useLocale()
const uid = useId()
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const { open, pos, style } = usePopover(trigger, panel, { width: 304, height: 380 })

const today = todayISO()
const value = computed(() => (isValidISODate(model.value) ? model.value : ''))
const cursor = ref(today)
const mode = ref<'days' | 'months'>('days')
const viewMonth = computed(() => startOfMonth(cursor.value))
const viewYear = computed(() => Number(cursor.value.slice(0, 4)))

const isOff = (d: string) => (!!props.min && d < props.min) || (!!props.max && d > props.max)
const clampDay = (d: string) => (props.min && d < props.min ? props.min : props.max && d > props.max ? props.max : d)

/** Always 6 weeks, so the panel never changes height between months. */
const days = computed(() => {
  const first = startOfWeek(viewMonth.value)
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
})
const weekdays = computed(() => weekdayLabels(locale.value, 'short'))
const months = computed(() => Array.from({ length: 12 }, (_, i) => {
  const iso = `${viewYear.value}-${String(i + 1).padStart(2, '0')}-01`
  return { iso, label: formatDate(iso, locale.value, { month: 'short' }), off: (!!props.min && endOfMonth(iso) < props.min) || (!!props.max && iso > props.max) }
}))
const label = computed(() => (value.value ? formatDate(value.value, locale.value, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''))
const monthTitle = computed(() => monthLabel(viewMonth.value, locale.value))
const yearTitle = computed(() => formatDate(`${viewYear.value}-01-01`, locale.value, { year: 'numeric' }))
const dayId = (d: string) => `${uid}-d${d}`

function show() {
  if (props.disabled || open.value) return
  cursor.value = clampDay(value.value || today)
  mode.value = 'days'
  open.value = true
  nextTick(() => gridEl.value?.focus({ preventScroll: true }))
}
function hide(focus = true) {
  if (!open.value) return
  open.value = false
  if (focus) trigger.value?.focus()
}
function pick(d: string) {
  if (isOff(d)) return
  const changed = d !== model.value
  model.value = d
  if (changed) emit('change', d)
  hide()
}
function clear() {
  if (model.value) { model.value = ''; emit('change', '') }
  hide()
}

// Month changes slide in from the side they come from.
function slide(dir: number) {
  if (!gridEl.value || prefersReducedMotion()) return
  gsap.fromTo(gridEl.value, { x: dir * 18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: 'power3.out', overwrite: true, clearProps: 'transform,opacity' })
}
function moveTo(d: string) {
  const before = viewMonth.value
  cursor.value = d
  if (startOfMonth(d) !== before) nextTick(() => slide(d > before ? 1 : -1))
}
function shiftMonth(n: number) { moveTo(addMonths(cursor.value, n)) }

function onGridKey(e: KeyboardEvent) {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (e.key in step) { e.preventDefault(); return moveTo(addDays(cursor.value, step[e.key]!)) }
  if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); return shiftMonth((e.key === 'PageUp' ? -1 : 1) * (e.shiftKey ? 12 : 1)) }
  if (e.key === 'Home') { e.preventDefault(); return moveTo(startOfWeek(cursor.value)) }
  if (e.key === 'End') { e.preventDefault(); return moveTo(addDays(startOfWeek(cursor.value), 6)) }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return pick(cursor.value) }
}
function onPanelKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide() }
}
function onTriggerKey(e: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
  else if ((e.key === 'Backspace' || e.key === 'Delete') && props.clearable && model.value) { e.preventDefault(); clear() }
}
function chooseMonth(iso: string) {
  const day = Math.min(Number(cursor.value.slice(8, 10)), Number(endOfMonth(iso).slice(8, 10)))
  cursor.value = clampDay(`${iso.slice(0, 8)}${String(day).padStart(2, '0')}`)
  mode.value = 'days'
  nextTick(() => { gridEl.value?.focus({ preventScroll: true }); slide(0) })
}

defineExpose({ focus: () => trigger.value?.focus(), open: show })

const SIZE = {
  md: 'h-12 rounded-2xl pl-4 pr-3 text-[0.9375rem]',
  pill: 'h-10 rounded-full pl-3.5 pr-3 text-sm',
  sm: 'h-9 rounded-xl pl-3 pr-2.5 text-sm',
} as const
</script>

<template>
  <div class="relative min-w-0" :class="size === 'md' ? 'w-full' : 'w-auto'">
    <button :id="id" ref="trigger" type="button" aria-haspopup="dialog" :aria-expanded="open" :aria-label="ariaLabel" :aria-invalid="invalid || undefined" :disabled="disabled"
      data-date-picker
      class="group flex w-full min-w-0 items-center gap-2 border bg-surface-2/70 text-left font-medium text-fg outline-none transition
        hover:border-brand-300 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
      :class="[SIZE[size], invalid ? 'border-danger' : open ? 'border-brand-400 ring-4 ring-brand-500/15' : 'border-line', clearable && value ? 'pr-9' : '']"
      @click="open ? hide() : show()" @keydown="onTriggerKey">
      <CalendarDays class="size-4 shrink-0 transition-colors" :class="open || value ? 'text-brand-500' : 'text-muted'" />
      <span class="min-w-0 flex-1 truncate" :class="!value && 'text-muted'">{{ label || placeholder || t('picker.chooseDate') }}</span>
    </button>
    <button v-if="clearable && value && !disabled" type="button" class="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
      :aria-label="t('picker.clear')" @click="clear">
      <X class="size-3.5" />
    </button>

    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" leave-active-class="transition duration-100 ease-in"
        :enter-from-class="pos.up ? 'opacity-0 translate-y-1 scale-[0.98]' : 'opacity-0 -translate-y-1 scale-[0.98]'" leave-to-class="opacity-0 scale-[0.98]">
        <div v-if="open" ref="panel" role="dialog" :aria-label="ariaLabel || t('picker.chooseDate')"
          class="fixed z-[145] rounded-3xl border border-line bg-surface p-3 shadow-panel" :class="pos.up ? 'origin-bottom' : 'origin-top'" :style="style"
          @keydown="onPanelKey">
          <!-- Header: month (or year) and arrows -->
          <div class="mb-2 flex items-center gap-1">
            <button type="button" class="flex min-w-0 flex-1 items-center gap-1 rounded-xl px-2 py-1.5 text-left font-display text-base font-bold transition hover:bg-surface-2"
              :aria-label="mode === 'days' ? t('picker.pickMonth') : t('picker.backToDays')" @click="mode = mode === 'days' ? 'months' : 'days'">
              <span class="truncate">{{ mode === 'days' ? monthTitle : yearTitle }}</span>
              <ChevronRight class="size-4 shrink-0 text-muted transition-transform" :class="mode === 'months' && 'rotate-90'" />
            </button>
            <button type="button" class="grid size-8 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
              :aria-label="mode === 'days' ? t('picker.prevMonth') : t('picker.prevYear')" @click="shiftMonth(mode === 'days' ? -1 : -12)"><ChevronLeft class="size-4" /></button>
            <button type="button" class="grid size-8 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg"
              :aria-label="mode === 'days' ? t('picker.nextMonth') : t('picker.nextYear')" @click="shiftMonth(mode === 'days' ? 1 : 12)"><ChevronRight class="size-4" /></button>
          </div>

          <!-- Days -->
          <div v-show="mode === 'days'">
            <div class="grid grid-cols-7 pb-1" aria-hidden="true">
              <span v-for="(w, i) in weekdays" :key="i" class="py-1 text-center text-[0.6875rem] font-semibold" :class="i === 0 ? 'text-pink' : 'text-muted'">{{ w }}</span>
            </div>
            <div ref="gridEl" role="grid" tabindex="0" :aria-label="monthTitle" :aria-activedescendant="dayId(cursor)"
              class="grid grid-cols-7 gap-0.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30" @keydown="onGridKey">
              <div v-for="d in days" :id="dayId(d)" :key="d" role="gridcell" :aria-selected="d === value" :aria-disabled="isOff(d) || undefined"
                class="relative grid aspect-square place-items-center rounded-xl text-sm transition-all duration-150 select-none"
                :class="[
                  isOff(d) ? 'cursor-not-allowed text-muted/35 line-through decoration-1'
                  : d === value ? 'cursor-pointer bg-brand-500 font-bold text-white shadow-pop'
                  : d === cursor ? 'cursor-pointer bg-brand-500/12 font-semibold text-fg'
                  : 'cursor-pointer hover:bg-surface-2',
                  !isOff(d) && d !== value && !isSameMonth(d, viewMonth) ? 'text-muted/60' : '',
                  d === today && d !== value ? 'font-bold text-brand-600 ring-1 ring-inset ring-brand-400 dark:text-brand-300' : '',
                ]"
                @click="pick(d)" @mousemove="!isOff(d) && (cursor = d)">
                {{ Number(d.slice(8, 10)) }}
              </div>
            </div>
          </div>

          <!-- Months -->
          <div v-if="mode === 'months'" class="grid grid-cols-3 gap-1.5 py-1">
            <button v-for="m in months" :key="m.iso" type="button" :disabled="m.off"
              class="rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
              :class="m.iso === startOfMonth(value || '') ? 'bg-brand-500 text-white shadow-pop' : m.iso === viewMonth ? 'bg-brand-500/12 text-fg' : 'hover:bg-surface-2'"
              @click="chooseMonth(m.iso)">
              {{ m.label }}
            </button>
          </div>

          <!-- Shortcuts -->
          <div class="mt-2 flex items-center gap-2 border-t border-line pt-2.5">
            <button type="button" class="chip-toggle" :disabled="isOff(today)" @click="pick(today)">{{ t('picker.today') }}</button>
            <button type="button" class="chip-toggle" :disabled="isOff(addDays(today, 1))" @click="pick(addDays(today, 1))">{{ t('picker.tomorrow') }}</button>
            <button v-if="clearable && value" type="button" class="ml-auto rounded-full px-2 py-1 text-xs font-semibold text-muted transition hover:text-danger" @click="clear">{{ t('picker.clear') }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
