<script setup lang="ts" generic="V extends string | number">
import { Check, ChevronDown } from '@lucide/vue'

/**
 * Plannity dropdown — replaces native <select> everywhere.
 *
 * - Styled like `.input` (or a compact `pill` for filter rows).
 * - The list is teleported to <body> and positioned against the trigger, so
 *   it is never clipped by side panels or cards; it flips up near the bottom.
 * - Keyboard: ↑/↓, Home/End, Enter/Space, Esc, Tab, and type-to-search.
 * - ARIA combobox + listbox; a <label for="id"> works because the trigger is a button.
 * - Options may carry a colour dot or a platform badge (slot `#icon` for anything else).
 */
export interface SelectOption<T> { value: T; label: string; hint?: string; color?: string; platform?: string; disabled?: boolean }

const props = withDefaults(defineProps<{
  options: SelectOption<V>[]
  id?: string
  placeholder?: string
  ariaLabel?: string
  size?: 'md' | 'pill' | 'sm'
  invalid?: boolean
  disabled?: boolean
  /** Highlight the trigger (e.g. a filter that is set). */
  active?: boolean
}>(), { size: 'md' })
const model = defineModel<V>()
const emit = defineEmits<{ change: [V] }>()
defineSlots<{ icon?: (p: { option: SelectOption<V> }) => unknown }>()

const uid = useId()
const listId = `${uid}-list`
const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)
const cursor = ref(-1)
const pos = reactive({ top: 0, bottom: 0, left: 0, width: 0, maxH: 320, up: false })

const selected = computed(() => props.options.find((o) => o.value === model.value) ?? null)
const enabledIdx = computed(() => props.options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0))

function place() {
  const el = trigger.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const below = vh - r.bottom - 12
  const above = r.top - 12
  pos.up = below < 220 && above > below
  pos.maxH = Math.max(160, Math.min(340, pos.up ? above : below))
  pos.width = Math.max(r.width, 176)
  pos.left = Math.min(Math.max(8, r.left), window.innerWidth - pos.width - 8)
  pos.top = r.bottom + 6
  pos.bottom = vh - r.top + 6
}

function show() {
  if (props.disabled || open.value) return
  place()
  open.value = true
  const i = props.options.findIndex((o) => o.value === model.value)
  cursor.value = i >= 0 ? i : enabledIdx.value[0] ?? -1
  nextTick(scrollToCursor)
}
function hide(focus = true) {
  if (!open.value) return
  open.value = false
  if (focus) trigger.value?.focus()
}
function choose(o: SelectOption<V>) {
  if (o.disabled) return
  const changed = o.value !== model.value
  model.value = o.value
  if (changed) emit('change', o.value)
  hide()
}
function move(step: number) {
  const idx = enabledIdx.value
  if (!idx.length) return
  const at = idx.indexOf(cursor.value)
  cursor.value = idx[Math.min(idx.length - 1, Math.max(0, (at < 0 ? -1 : at) + step))]!
  scrollToCursor()
}
function scrollToCursor() {
  list.value?.querySelector<HTMLElement>(`[data-i="${cursor.value}"]`)?.scrollIntoView({ block: 'nearest' })
}

// Type-to-search: jump to the next option starting with the typed letters.
let typed = ''
let typedTimer: ReturnType<typeof setTimeout> | undefined
function typeahead(ch: string) {
  typed += ch.toLowerCase()
  clearTimeout(typedTimer)
  typedTimer = setTimeout(() => { typed = '' }, 600)
  const start = Math.max(0, cursor.value)
  const order = [...props.options.keys()].map((k) => (start + (typed.length === 1 ? 1 : 0) + k) % props.options.length)
  const hit = order.find((i) => !props.options[i]!.disabled && props.options[i]!.label.toLowerCase().startsWith(typed))
  if (hit === undefined) return
  if (open.value) { cursor.value = hit; scrollToCursor() } else choose(props.options[hit]!)
}

function onTriggerKey(e: KeyboardEvent) {
  if (props.disabled) return
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
    e.preventDefault()
    if (!open.value) return show()
    if (e.key === 'ArrowDown') return move(1)
    if (e.key === 'ArrowUp') return move(-1)
    const o = props.options[cursor.value]
    if (o) choose(o)
    return
  }
  if (!open.value) { if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key); return }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide() }
  else if (e.key === 'Tab') hide(false)
  else if (e.key === 'Home') { e.preventDefault(); cursor.value = enabledIdx.value[0] ?? -1; scrollToCursor() }
  else if (e.key === 'End') { e.preventDefault(); cursor.value = enabledIdx.value.at(-1) ?? -1; scrollToCursor() }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeahead(e.key)
}

function onDocDown(e: Event) {
  const tgt = e.target as Node
  if (trigger.value?.contains(tgt) || list.value?.contains(tgt)) return
  hide(false)
}
function onViewport(e: Event) {
  // Scrolling inside the list itself shouldn't move it.
  if (e.type === 'scroll' && list.value?.contains(e.target as Node)) return
  place()
}
watch(open, (v) => {
  const m = v ? 'addEventListener' : 'removeEventListener'
  document[m]('pointerdown', onDocDown, true)
  window[m]('resize', onViewport)
  window[m]('scroll', onViewport, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocDown, true)
  window.removeEventListener('resize', onViewport)
  window.removeEventListener('scroll', onViewport, true)
  clearTimeout(typedTimer)
})

const SIZE = {
  md: 'h-12 rounded-2xl px-4 text-[15px]',
  pill: 'h-10 rounded-full pl-4 pr-3 text-sm',
  sm: 'h-9 rounded-xl px-3 text-sm',
} as const
</script>

<template>
  <div class="relative min-w-0" :class="size === 'md' ? 'w-full' : 'w-auto'">
    <button :id="id" ref="trigger" type="button" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="listId"
      :aria-activedescendant="open && cursor >= 0 ? `${uid}-o${cursor}` : undefined" :aria-label="ariaLabel" :aria-invalid="invalid || undefined" :disabled="disabled"
      class="group flex w-full min-w-0 items-center gap-2 border bg-surface-2/70 text-left font-medium text-fg outline-none transition
        hover:border-brand-300 focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
      :class="[SIZE[size], invalid ? 'border-danger' : open ? 'border-brand-400 ring-4 ring-brand-500/15' : active ? 'border-brand-400 text-brand-600 dark:text-brand-300' : 'border-line']"
      @click="open ? hide() : show()" @keydown="onTriggerKey">
      <template v-if="selected">
        <slot name="icon" :option="selected">
          <span v-if="selected.platform" aria-hidden="true" class="flex"><UiPlatformBadge :platform="selected.platform as never" /></span>
          <span v-else-if="selected.color" class="size-2.5 shrink-0 rounded-full" :style="{ background: selected.color }" />
        </slot>
      </template>
      <span class="min-w-0 flex-1 truncate" :class="!selected && 'text-muted'">{{ selected?.label ?? placeholder ?? '' }}</span>
      <ChevronDown class="size-4 shrink-0 text-muted transition-transform duration-200" :class="open && 'rotate-180 text-brand-500'" />
    </button>

    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" leave-active-class="transition duration-100 ease-in"
        :enter-from-class="pos.up ? 'opacity-0 translate-y-1 scale-[0.98]' : 'opacity-0 -translate-y-1 scale-[0.98]'" leave-to-class="opacity-0 scale-[0.98]">
        <ul v-if="open" :id="listId" ref="list" role="listbox" :aria-label="ariaLabel" tabindex="-1"
          class="fixed z-[145] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-panel scrollbar-thin"
          :class="pos.up ? 'origin-bottom' : 'origin-top'"
          :style="{ left: `${pos.left}px`, width: `${pos.width}px`, maxHeight: `${pos.maxH}px`, ...(pos.up ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }) }"
          @mousedown.prevent>
          <li v-for="(o, i) in options" :id="`${uid}-o${i}`" :key="String(o.value)" :data-i="i" role="option" :aria-selected="o.value === model" :aria-disabled="o.disabled || undefined"
            class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors"
            :class="[o.disabled ? 'cursor-not-allowed opacity-45' : '', cursor === i ? 'bg-brand-500/10 text-fg' : '', o.value === model ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-fg']"
            @mousemove="!o.disabled && (cursor = i)" @click="choose(o)">
            <slot name="icon" :option="o">
              <span v-if="o.platform" aria-hidden="true" class="flex"><UiPlatformBadge :platform="o.platform as never" /></span>
              <span v-else-if="o.color" class="size-2.5 shrink-0 rounded-full" :style="{ background: o.color }" />
            </slot>
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ o.label }}</span>
              <span v-if="o.hint" class="block truncate text-xs font-normal text-muted">{{ o.hint }}</span>
            </span>
            <Check v-if="o.value === model" class="size-4 shrink-0" />
          </li>
          <li v-if="!options.length" class="px-3 py-2.5 text-sm text-muted">—</li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
