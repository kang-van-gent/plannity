<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue'

/**
 * Free-text input with suggestions — the styled replacement for
 * <input list> + <datalist>. Anything can be typed; suggestions filter as you
 * type and use the same floating list as <UiSelect>.
 *
 * Keyboard: ↓/↑ open and move, Enter picks the highlighted suggestion (or
 * submits the typed text via `enter`), Esc closes, Tab moves on.
 */
const props = withDefaults(defineProps<{
  suggestions: string[]
  id?: string
  placeholder?: string
  ariaLabel?: string
  size?: 'md' | 'sm'
  invalid?: boolean
  disabled?: boolean
  maxlength?: number
}>(), { size: 'md' })
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ enter: [string] }>()

const uid = useId()
const listId = `${uid}-list`
const wrap = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const open = ref(false)
const cursor = ref(-1)
/** Filter only after the user types; on open show every suggestion. */
const typing = ref(false)
const pos = reactive({ top: 0, bottom: 0, left: 0, width: 0, maxH: 280, up: false })

const shown = computed(() => {
  const q = model.value.trim().toLowerCase()
  const all = [...new Set(props.suggestions)]
  return typing.value && q ? all.filter((s) => s.toLowerCase().includes(q)) : all
})

function place() {
  const el = wrap.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight
  const below = vh - r.bottom - 12
  const above = r.top - 12
  pos.up = below < 200 && above > below
  pos.maxH = Math.max(140, Math.min(300, pos.up ? above : below))
  pos.width = Math.max(r.width, 176)
  pos.left = Math.min(Math.max(8, r.left), window.innerWidth - pos.width - 8)
  pos.top = r.bottom + 6
  pos.bottom = vh - r.top + 6
}
function show() {
  if (props.disabled || open.value || !props.suggestions.length) return
  place()
  open.value = true
  cursor.value = shown.value.findIndex((s) => s === model.value)
}
function hide() { open.value = false; typing.value = false; cursor.value = -1 }
function pick(s: string) {
  model.value = s
  hide()
  input.value?.focus()
}
function move(step: number) {
  if (!open.value) return show()
  const n = shown.value.length
  if (!n) return
  cursor.value = cursor.value < 0 ? (step > 0 ? 0 : n - 1) : (cursor.value + step + n) % n
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-i="${cursor.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}
function onInput() {
  typing.value = true
  cursor.value = -1
  if (!open.value) show()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') {
    if (open.value && cursor.value >= 0 && shown.value[cursor.value] !== undefined) { e.preventDefault(); pick(shown.value[cursor.value]!) }
    else { hide(); emit('enter', model.value) }
  } else if (e.key === 'Escape' && open.value) { e.preventDefault(); e.stopPropagation(); hide() }
  else if (e.key === 'Tab') hide()
}

function onDocDown(e: Event) {
  const tgt = e.target as Node
  if (wrap.value?.contains(tgt) || list.value?.contains(tgt)) return
  hide()
}
function onViewport(e: Event) {
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
})
</script>

<template>
  <div ref="wrap" class="relative min-w-0" :class="size === 'md' ? 'w-full' : 'w-auto'">
    <input :id="id" ref="input" v-model="model" type="text" role="combobox" autocomplete="off" aria-autocomplete="list" :aria-expanded="open" :aria-controls="listId"
      :aria-activedescendant="open && cursor >= 0 ? `${uid}-o${cursor}` : undefined" :aria-label="ariaLabel" :aria-invalid="invalid || undefined"
      :placeholder="placeholder" :disabled="disabled" :maxlength="maxlength"
      class="input pr-10" :class="[size === 'sm' ? 'py-1.5' : '', invalid && 'input-error', open && 'border-brand-400 ring-4 ring-brand-500/15']"
      @focus="show" @click="show" @input="onInput" @keydown="onKey">
    <button v-if="suggestions.length" type="button" tabindex="-1" aria-hidden="true" :disabled="disabled"
      class="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted" @mousedown.prevent @click="open ? hide() : (input?.focus(), show())">
      <ChevronDown class="size-4 transition-transform duration-200" :class="open && 'rotate-180 text-brand-500'" />
    </button>

    <Teleport to="body">
      <Transition enter-active-class="transition duration-150 ease-out" leave-active-class="transition duration-100 ease-in"
        :enter-from-class="pos.up ? 'opacity-0 translate-y-1 scale-[0.98]' : 'opacity-0 -translate-y-1 scale-[0.98]'" leave-to-class="opacity-0 scale-[0.98]">
        <ul v-if="open && shown.length" :id="listId" ref="list" role="listbox" :aria-label="ariaLabel"
          class="fixed z-[145] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-panel scrollbar-thin"
          :class="pos.up ? 'origin-bottom' : 'origin-top'"
          :style="{ left: `${pos.left}px`, width: `${pos.width}px`, maxHeight: `${pos.maxH}px`, ...(pos.up ? { bottom: `${pos.bottom}px` } : { top: `${pos.top}px` }) }"
          @mousedown.prevent>
          <li v-for="(s, i) in shown" :id="`${uid}-o${i}`" :key="s" :data-i="i" role="option" :aria-selected="s === model"
            class="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors"
            :class="[cursor === i ? 'bg-brand-500/10' : '', s === model ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-fg']"
            @mousemove="cursor = i" @click="pick(s)">
            <span class="min-w-0 flex-1 truncate">{{ s }}</span>
            <Check v-if="s === model" class="size-4 shrink-0" />
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>
