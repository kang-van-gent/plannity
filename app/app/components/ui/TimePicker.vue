<script setup lang="ts">
import { Clock, X } from '@lucide/vue'

/**
 * Plannity time picker — replaces native <input type="time"> everywhere.
 * Value: 'HH:mm' (24-hour, Bangkok time) or '' when empty, like the native input.
 *
 * - Popular posting times as one-tap chips, then hour and minute columns
 *   (minutes in steps of `step`; an existing off-step minute stays selectable).
 * - Picking an hour keeps the panel open for the minute; picking a minute or a chip closes it.
 * - Keyboard: ↑/↓ within a column, ←/→ between columns, Enter picks, Esc closes.
 */
const props = withDefaults(defineProps<{
  id?: string
  ariaLabel?: string
  placeholder?: string
  size?: 'md' | 'pill' | 'sm'
  invalid?: boolean
  disabled?: boolean
  clearable?: boolean
  /** Minute step in the minute column. */
  step?: number
}>(), { size: 'md', clearable: true, step: 5 })
const model = defineModel<string | null>()
const emit = defineEmits<{ change: [string] }>()

const { t } = useLocale()
const uid = useId()
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const hourCol = ref<HTMLElement | null>(null)
const minuteCol = ref<HTMLElement | null>(null)
const { open, pos, style } = usePopover(trigger, panel, { width: 264, height: 360 })

const PRESETS = ['09:00', '12:00', '18:00', '20:00']
const pad = (n: number) => String(n).padStart(2, '0')
const value = computed(() => (/^\d{2}:\d{2}$/.test(model.value ?? '') ? model.value! : ''))
const hour = computed(() => (value.value ? Number(value.value.slice(0, 2)) : null))
const minute = computed(() => (value.value ? Number(value.value.slice(3, 5)) : null))
const hours = Array.from({ length: 24 }, (_, i) => i)
const minutes = computed(() => {
  const list = Array.from({ length: Math.ceil(60 / props.step) }, (_, i) => i * props.step)
  if (minute.value !== null && !list.includes(minute.value)) list.push(minute.value)
  return list.sort((a, b) => a - b)
})

const col = ref<'h' | 'm'>('h')
function setCol(which: 'h' | 'm', el: unknown) {
  const node = el instanceof HTMLElement ? el : null
  if (which === 'h') hourCol.value = node
  else minuteCol.value = node
}
const cur = reactive({ h: 9, m: 0 })

function set(v: string, close: boolean) {
  const changed = v !== model.value
  model.value = v
  if (changed) emit('change', v)
  if (close) hide()
}
function pickHour(h: number) {
  cur.h = h
  set(`${pad(h)}:${pad(minute.value ?? 0)}`, false)
  col.value = 'm'
  nextTick(() => { minuteCol.value?.focus({ preventScroll: true }); center() })
}
function pickMinute(m: number) {
  cur.m = m
  set(`${pad(hour.value ?? cur.h)}:${pad(m)}`, true)
}
function clear() {
  if (model.value) set('', false)
  hide()
}

/** Scrolls both columns so the current hour/minute sits in the middle. */
function center(smooth = true) {
  for (const [el, k] of [[hourCol.value, `h${cur.h}`], [minuteCol.value, `m${cur.m}`]] as const) {
    const item = el?.querySelector<HTMLElement>(`[data-k="${k}"]`)
    if (el && item) el.scrollTo({ top: item.offsetTop - el.clientHeight / 2 + item.clientHeight / 2, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
  }
}

function show() {
  if (props.disabled || open.value) return
  const now = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  cur.h = hour.value ?? Number(now.slice(0, 2))
  cur.m = minute.value ?? 0
  col.value = 'h'
  open.value = true
  nextTick(() => { center(false); hourCol.value?.focus({ preventScroll: true }) })
}
function hide(focus = true) {
  if (!open.value) return
  open.value = false
  if (focus) trigger.value?.focus()
}

function onColKey(e: KeyboardEvent, which: 'h' | 'm') {
  const list = which === 'h' ? hours : minutes.value
  const at = list.indexOf(cur[which])
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    cur[which] = list[Math.min(list.length - 1, Math.max(0, at + (e.key === 'ArrowDown' ? 1 : -1)))]!
    center()
  } else if (e.key === 'ArrowRight' && which === 'h') { e.preventDefault(); col.value = 'm'; minuteCol.value?.focus({ preventScroll: true }) }
  else if (e.key === 'ArrowLeft' && which === 'm') { e.preventDefault(); col.value = 'h'; hourCol.value?.focus({ preventScroll: true }) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (which === 'h') pickHour(cur.h); else pickMinute(cur.m) }
}
function onPanelKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide() }
}
function onTriggerKey(e: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() }
  else if ((e.key === 'Backspace' || e.key === 'Delete') && props.clearable && model.value) { e.preventDefault(); clear() }
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
      class="group flex w-full min-w-0 items-center gap-2 border bg-surface-2/70 text-left font-medium text-fg outline-none transition
        hover:border-brand-300 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
      :class="[SIZE[size], invalid ? 'border-danger' : open ? 'border-brand-400 ring-4 ring-brand-500/15' : 'border-line', clearable && value ? 'pr-9' : '']"
      @click="open ? hide() : show()" @keydown="onTriggerKey">
      <Clock class="size-4 shrink-0 transition-colors" :class="open || value ? 'text-brand-500' : 'text-muted'" />
      <span class="min-w-0 flex-1 truncate tabular-nums" :class="!value && 'text-muted'">{{ value || placeholder || t('picker.chooseTime') }}</span>
    </button>
    <button v-if="clearable && value && !disabled" type="button" class="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-fg"
      :aria-label="t('picker.clear')" @click="clear">
      <X class="size-3.5" />
    </button>

    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" leave-active-class="transition duration-100 ease-in"
        :enter-from-class="pos.up ? 'opacity-0 translate-y-1 scale-[0.98]' : 'opacity-0 -translate-y-1 scale-[0.98]'" leave-to-class="opacity-0 scale-[0.98]">
        <div v-if="open" ref="panel" role="dialog" :aria-label="ariaLabel || t('picker.chooseTime')"
          class="fixed z-[145] rounded-3xl border border-line bg-surface p-3 shadow-panel" :class="pos.up ? 'origin-bottom' : 'origin-top'" :style="style"
          @keydown="onPanelKey">
          <p class="px-1 text-[0.6875rem] font-bold uppercase tracking-wider text-muted">{{ t('picker.popular') }}</p>
          <div class="mt-1.5 grid grid-cols-4 gap-1.5">
            <button v-for="p in PRESETS" :key="p" type="button" class="rounded-xl py-2 text-sm font-semibold tabular-nums transition active:scale-[0.97]"
              :class="value === p ? 'bg-brand-500 text-white shadow-pop' : 'bg-surface-2 hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-300'"
              @click="set(p, true)">{{ p }}</button>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-2">
            <div v-for="which in (['h', 'm'] as const)" :key="which">
              <p class="mb-1 px-1 text-[0.6875rem] font-bold uppercase tracking-wider text-muted">{{ which === 'h' ? t('picker.hour') : t('picker.minute') }}</p>
              <div :ref="(el) => setCol(which, el)"
                role="listbox" tabindex="0" :aria-label="which === 'h' ? t('picker.hour') : t('picker.minute')" :aria-activedescendant="`${uid}-${which}${cur[which]}`"
                class="relative h-48 overflow-y-auto overscroll-contain rounded-2xl bg-surface-2/60 p-1 outline-none scrollbar-thin focus-visible:ring-2 focus-visible:ring-brand-500/30"
                @keydown="onColKey($event, which)" @focus="col = which">
                <div v-for="n in (which === 'h' ? hours : minutes)" :id="`${uid}-${which}${n}`" :key="n" :data-k="`${which}${n}`" role="option"
                  :aria-selected="(which === 'h' ? hour : minute) === n"
                  class="cursor-pointer rounded-xl py-2 text-center text-sm tabular-nums transition-colors select-none"
                  :class="(which === 'h' ? hour : minute) === n ? 'bg-brand-500 font-bold text-white' : cur[which] === n && col === which ? 'bg-brand-500/12 font-semibold' : 'hover:bg-surface'"
                  @click="which === 'h' ? pickHour(n) : pickMinute(n)" @mousemove="cur[which] = n">
                  {{ pad(n) }}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-xs text-muted">
            <span>{{ t('content.tzHint') }}</span>
            <button v-if="clearable && value" type="button" class="rounded-full px-2 py-1 font-semibold transition hover:text-danger" @click="clear">{{ t('picker.clear') }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
