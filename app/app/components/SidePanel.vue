<script setup lang="ts">
import { AlertTriangle, X } from '@lucide/vue'
import { gsap } from 'gsap'

// Every modal in Plannity enters from the right (product requirement).
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean
  /** Ask before closing when the user has changed a field inside the panel. */
  guard?: boolean
  /** Override automatic change detection (e.g. for custom chip/toggle inputs). */
  dirty?: boolean
}>(), { size: 'md', closeOnBackdrop: true, guard: true, dirty: undefined })
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const width = computed(() => ({ sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' })[props.size])
const panel = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null
let openCount = 0
// Widths of open panels (stack) so the notice layer can sit beside them.
const panelStack = useState<number[]>('panel-stack', () => [])
let stackIndex = -1
const warnId = useId()

// ---- Unsaved-changes guard -------------------------------------------------
// Each field's value is recorded the first time the user touches it; on close we
// compare. Fields that are typed into and then cleared again don't count.
const CONTROL = 'input:not([type=hidden]):not([type=button]):not([type=submit]),textarea,select,[contenteditable="true"]'
const initial = new Map<HTMLElement, string>()
const warnOpen = ref(false)
const warnBox = ref<HTMLElement | null>(null)
const keepBtn = ref<HTMLButtonElement | null>(null)

function valueOf(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) return el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value
  if (el instanceof HTMLSelectElement) return Array.from(el.selectedOptions).map((o) => o.value).join('\u0000')
  if (el instanceof HTMLTextAreaElement) return el.value
  return el.textContent ?? ''
}
function track(target: EventTarget | null) {
  const t0 = target as Element | null
  const el = (t0?.closest?.(CONTROL) ?? (t0?.closest?.('label') as HTMLLabelElement | null)?.control) as HTMLElement | null | undefined
  if (el && !initial.has(el)) initial.set(el, valueOf(el))
}
function isDirty() {
  if (props.dirty !== undefined) return props.dirty
  for (const [el, v] of initial) if (el.isConnected && valueOf(el) !== v) return true
  return false
}
/** Close unless there are unsaved changes, in which case ask first. Returns true when closed. */
function requestClose() {
  if (props.guard && isDirty()) { warnOpen.value = true; return false }
  emit('close')
  return true
}
function discard() {
  warnOpen.value = false
  emit('close')
}
watch(() => props.open, (o) => { if (!o) warnOpen.value = false })

function onWarnEnter(el: Element, done: () => void) {
  const fin = () => { keepBtn.value?.focus(); done() }
  if (prefersReducedMotion()) return fin()
  gsap.timeline({ onComplete: fin })
    .fromTo(el.querySelector('[data-warn-backdrop]'), { opacity: 0 }, { opacity: 1, duration: 0.2 })
    .fromTo(el.querySelector('[data-warn]'), { scale: 0.88, y: 16, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.7)' }, 0)
    .fromTo(el.querySelector('[data-warn-icon]'), { rotate: 0 }, { keyframes: { rotate: [0, -12, 10, -6, 3, 0] }, duration: 0.5, ease: 'none' }, 0.25)
}
function onWarnLeave(el: Element, done: () => void) {
  if (props.open) panel.value?.focus({ preventScroll: true })
  if (prefersReducedMotion()) return done()
  gsap.timeline({ onComplete: done })
    .to(el.querySelector('[data-warn]'), { scale: 0.94, opacity: 0, duration: 0.18, ease: 'power2.in' })
    .to(el.querySelector('[data-warn-backdrop]'), { opacity: 0, duration: 0.18 }, 0)
}

// ---- Drag-to-resize (desktop) ----------------------------------------------
// The left edge is a handle: drag to widen, double-click (or Enter) to toggle full width.
const MIN_W = 360
let customWidth: number | null = null
let resize: { id: number; x0: number; w0: number } | null = null
const maxW = () => window.innerWidth - 24
function applyWidth(w: number | null) {
  if (!panel.value) return
  panel.value.style.width = w ? `${w}px` : ''
  panel.value.style.maxWidth = w ? '100vw' : ''
}
function setWidth(w: number) {
  customWidth = Math.round(Math.min(maxW(), Math.max(MIN_W, w)))
  applyWidth(customWidth)
}
function syncStack() {
  if (stackIndex < 0 || stackIndex >= panelStack.value.length || !panel.value) return
  const s = [...panelStack.value]
  s[stackIndex] = panel.value.offsetWidth
  panelStack.value = s
}
function onResizeDown(e: PointerEvent) {
  if (!panel.value || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  resize = { id: e.pointerId, x0: e.clientX, w0: panel.value.offsetWidth }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  document.documentElement.classList.add('select-none', 'cursor-ew-resize')
}
function onResizeMove(e: PointerEvent) {
  if (resize && e.pointerId === resize.id) setWidth(resize.w0 + (resize.x0 - e.clientX))
}
function onResizeUp(e: PointerEvent) {
  if (!resize || e.pointerId !== resize.id) return
  resize = null
  document.documentElement.classList.remove('select-none', 'cursor-ew-resize')
  syncStack()
}
function onResizeKey(e: KeyboardEvent) {
  if (!panel.value) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    setWidth(panel.value.offsetWidth + (e.key === 'ArrowLeft' ? 48 : -48))
    syncStack()
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleExpand()
  }
}
function toggleExpand() {
  const p = panel.value
  if (!p) return
  const from = p.offsetWidth
  const target = customWidth && customWidth >= maxW() - 4 ? null : maxW()
  applyWidth(target)
  const to = p.offsetWidth
  customWidth = target
  if (prefersReducedMotion()) return syncStack()
  applyWidth(from)
  gsap.to(p, { width: to, duration: 0.45, ease: 'power3.inOut', onComplete: () => { applyWidth(target); syncStack() } })
}

function lockScroll(lock: boolean) {
  const w = window as Window & { __panelLocks?: number }
  w.__panelLocks = Math.max(0, (w.__panelLocks ?? 0) + (lock ? 1 : -1))
  document.documentElement.style.overflow = w.__panelLocks ? 'hidden' : ''
}

function onEnter(el: Element, done: () => void) {
  const root = el as HTMLElement
  const p = root.querySelector<HTMLElement>('[data-panel]')!
  const items = [root.querySelector('[data-head]'), ...Array.from(root.querySelector('[data-body]')?.children ?? []), root.querySelector('[data-foot]')].filter(Boolean)
  lastFocus = document.activeElement as HTMLElement | null
  lockScroll(true)
  openCount++
  initial.clear()
  if (customWidth && window.innerWidth >= 640) applyWidth(Math.min(customWidth, maxW()))
  stackIndex = panelStack.value.length
  panelStack.value = [...panelStack.value, p.offsetWidth]
  if (prefersReducedMotion()) { p.focus(); return done() }
  gsap.timeline({ onComplete: () => { p.focus({ preventScroll: true }); done() } })
    .fromTo(root.querySelector('[data-backdrop]'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' })
    .fromTo(p, { xPercent: 100, x: 0, skewX: -2, willChange: 'transform' }, { xPercent: 0, skewX: 0, duration: 0.6, ease: 'expo.out', clearProps: 'willChange' }, 0)
    .fromTo(items, { x: 48, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, stagger: 0.045, ease: 'power3.out', clearProps: 'transform' }, 0.1)
}

function onLeave(el: Element, done: () => void) {
  const root = el as HTMLElement
  panelStack.value = panelStack.value.slice(0, -1)
  stackIndex = -1
  const finish = () => { lockScroll(false); openCount--; lastFocus?.focus?.({ preventScroll: true }); done() }
  if (prefersReducedMotion()) return finish()
  gsap.timeline({ onComplete: finish })
    .to(root.querySelector('[data-panel]'), { xPercent: 100, duration: 0.36, ease: 'power3.in', willChange: 'transform' })
    .to(root.querySelector('[data-backdrop]'), { opacity: 0, duration: 0.28 }, 0.1)
}

// Touch: swipe the panel right to dismiss. The panel follows the finger and
// the backdrop fades with it; release past 30% (or a quick flick) closes it.
let drag: { id: number; x0: number; y0: number; t0: number; lock: 'x' | 'y' | null; dx: number; w: number } | null = null
const NO_SWIPE = 'input,textarea,select,[contenteditable="true"],[data-no-swipe]'
function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' || !panel.value || (e.target as Element).closest(NO_SWIPE)) return
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), lock: null, dx: 0, w: panel.value.offsetWidth }
}
function onPointerMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || !panel.value) return
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0
  if (!drag.lock) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return }
    if (dx > 10 && dx > Math.abs(dy) * 1.2) {
      drag.lock = 'x'
      panel.value.setPointerCapture(e.pointerId)
    } else return
  }
  drag.dx = Math.max(0, dx)
  gsap.set(panel.value, { x: drag.dx })
  gsap.set(panel.value.parentElement!.querySelector('[data-backdrop]'), { opacity: 1 - (drag.dx / drag.w) * 0.85 })
}
function onPointerUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || !panel.value) { drag = null; return }
  const d = drag
  drag = null
  if (d.lock !== 'x') return
  const v = d.dx / Math.max(1, performance.now() - d.t0) // px per ms
  if ((d.dx > d.w * 0.3 || (v > 0.5 && d.dx > 40)) && requestClose()) return
  gsap.to(panel.value, { x: 0, duration: 0.35, ease: 'power3.out' })
  gsap.to(panel.value.parentElement!.querySelector('[data-backdrop]'), { opacity: 1, duration: 0.3 })
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    if (warnOpen.value) warnOpen.value = false
    else requestClose()
  }
  const scope = warnOpen.value ? warnBox.value : panel.value
  if (e.key === 'Tab' && scope) {
    const f = Array.from(scope.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null)
    if (!f.length) return
    const first = f[0]!, last = f[f.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

onBeforeUnmount(() => {
  document.documentElement.classList.remove('select-none', 'cursor-ew-resize')
  if (openCount > 0) { lockScroll(false); panelStack.value = panelStack.value.slice(0, -openCount) }
})
</script>

<template>
  <Teleport to="#teleports">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="open" class="fixed inset-0 z-[120]" @keydown="onKeydown">
        <div data-backdrop class="absolute inset-0 bg-ink/50 sm:bg-ink/45 sm:backdrop-blur-[3px]" @click="closeOnBackdrop && requestClose()" />
        <aside ref="panel" data-panel role="dialog" aria-modal="true" :aria-label="title" tabindex="-1"
          class="absolute inset-y-0 right-0 flex w-full touch-pan-y flex-col overflow-hidden border-l border-line bg-surface shadow-panel outline-none sm:rounded-l-[2rem]" :class="width"
          @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
          @focusin="track($event.target)" @pointerdown.capture="track($event.target)" @keydown.capture="track($event.target)">
          <div role="separator" aria-orientation="vertical" tabindex="0" :aria-label="t('common.resizePanel')" :title="t('common.resizePanel')"
            class="group absolute inset-y-0 left-0 z-10 hidden w-3 cursor-ew-resize touch-none outline-none sm:block"
            @pointerdown="onResizeDown" @pointermove="onResizeMove" @pointerup="onResizeUp" @pointercancel="onResizeUp"
            @dblclick="toggleExpand" @keydown="onResizeKey">
            <span class="absolute left-1 top-1/2 h-14 w-1 -translate-y-1/2 rounded-full bg-line transition-all group-hover:h-20 group-hover:bg-brand-400 group-focus-visible:h-20 group-focus-visible:bg-brand-500 group-active:bg-brand-500" />
          </div>
          <span class="absolute left-1.5 top-1/2 h-12 w-1 -translate-y-1/2 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <span class="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/10 blur-2xl" aria-hidden="true" />
          <header data-head class="relative flex items-start gap-3 border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-7 sm:py-5">
            <div class="min-w-0 flex-1">
              <slot name="title">
                <h2 class="font-display text-xl font-bold">{{ title }}</h2>
              </slot>
              <p v-if="subtitle" class="mt-0.5 text-sm text-muted">{{ subtitle }}</p>
            </div>
            <button type="button" class="btn-icon btn-ghost -mr-2" :aria-label="t('common.close')" @click="requestClose()">
              <X class="size-5" />
            </button>
          </header>
          <div data-body class="relative flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain px-5 py-5 scrollbar-thin sm:px-7" :class="$slots.footer ? '' : 'pb-safe'">
            <slot :close="requestClose" />
          </div>
          <footer v-if="$slots.footer" data-foot class="pb-safe relative flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 pt-4 sm:px-7 sm:py-4 [&>*]:flex-1 sm:[&>*]:flex-none">
            <slot name="footer" :close="requestClose" />
          </footer>
        </aside>

        <!-- Unsaved-changes warning: centred over everything, on top of the panel. -->
        <Transition :css="false" @enter="onWarnEnter" @leave="onWarnLeave">
          <div v-if="warnOpen" class="absolute inset-0 z-20 grid place-items-center p-5">
            <div data-warn-backdrop class="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" @click="warnOpen = false" />
            <div ref="warnBox" data-warn role="alertdialog" aria-modal="true" :aria-labelledby="`${warnId}-t`" :aria-describedby="`${warnId}-d`"
              class="relative w-full max-w-sm rounded-[1.75rem] border border-line bg-surface p-6 text-center shadow-panel">
              <span data-warn-icon class="mx-auto grid size-14 place-items-center rounded-full bg-warning/15 text-warning"><AlertTriangle class="size-7" /></span>
              <h3 :id="`${warnId}-t`" class="mt-4 font-display text-xl font-bold">{{ t('common.discardTitle') }}</h3>
              <p :id="`${warnId}-d`" class="mt-2 text-sm leading-relaxed text-muted">{{ t('common.discardBody') }}</p>
              <div class="mt-6 grid grid-cols-2 gap-2">
                <button ref="keepBtn" type="button" class="btn-secondary" @click="warnOpen = false">{{ t('common.keepEditing') }}</button>
                <button type="button" class="btn-danger" @click="discard">{{ t('common.discard') }}</button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
