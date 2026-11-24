<script setup lang="ts">
import { X } from '@lucide/vue'
import { gsap } from 'gsap'

// Every modal in Plannity enters from the right (product requirement).
const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdrop?: boolean
}>(), { size: 'md', closeOnBackdrop: true })
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const width = computed(() => ({ sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' })[props.size])
const panel = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null
let openCount = 0
// Widths of open panels (stack) so the notice layer can sit beside them.
const panelStack = useState<number[]>('panel-stack', () => [])

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
  panelStack.value = [...panelStack.value, p.offsetWidth]
  if (prefersReducedMotion()) { p.focus(); return done() }
  gsap.timeline({ onComplete: () => { p.focus({ preventScroll: true }); done() } })
    .fromTo(root.querySelector('[data-backdrop]'), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' })
    .fromTo(p, { xPercent: 100, skewX: -2 }, { xPercent: 0, skewX: 0, duration: 0.6, ease: 'expo.out' }, 0)
    .fromTo(items, { x: 48, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, stagger: 0.045, ease: 'power3.out', clearProps: 'transform' }, 0.1)
}

function onLeave(el: Element, done: () => void) {
  const root = el as HTMLElement
  panelStack.value = panelStack.value.slice(0, -1)
  const finish = () => { lockScroll(false); openCount--; lastFocus?.focus?.({ preventScroll: true }); done() }
  if (prefersReducedMotion()) return finish()
  gsap.timeline({ onComplete: finish })
    .to(root.querySelector('[data-panel]'), { xPercent: 100, duration: 0.38, ease: 'power3.in' })
    .to(root.querySelector('[data-backdrop]'), { opacity: 0, duration: 0.28 }, 0.1)
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') { e.stopPropagation(); emit('close') }
  if (e.key === 'Tab' && panel.value) {
    const f = Array.from(panel.value.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null)
    if (!f.length) return
    const first = f[0]!, last = f[f.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

onBeforeUnmount(() => {
  if (openCount > 0) { lockScroll(false); panelStack.value = panelStack.value.slice(0, -openCount) }
})
</script>

<template>
  <Teleport to="#teleports">
    <Transition :css="false" @enter="onEnter" @leave="onLeave">
      <div v-if="open" class="fixed inset-0 z-[120]" @keydown="onKeydown">
        <div data-backdrop class="absolute inset-0 bg-ink/45 backdrop-blur-[3px]" @click="closeOnBackdrop && emit('close')" />
        <aside ref="panel" data-panel role="dialog" aria-modal="true" :aria-label="title" tabindex="-1"
          class="absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden border-l border-line bg-surface shadow-panel outline-none sm:rounded-l-[2rem]" :class="width">
          <span class="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand-500/10 blur-2xl" aria-hidden="true" />
          <header data-head class="relative flex items-start gap-3 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
            <div class="min-w-0 flex-1">
              <slot name="title">
                <h2 class="font-display text-xl font-bold">{{ title }}</h2>
              </slot>
              <p v-if="subtitle" class="mt-0.5 text-sm text-muted">{{ subtitle }}</p>
            </div>
            <button type="button" class="btn-icon btn-ghost -mr-2" :aria-label="t('common.close')" @click="emit('close')">
              <X class="size-5" />
            </button>
          </header>
          <div data-body class="relative flex-1 space-y-5 overflow-y-auto px-5 py-5 scrollbar-thin sm:px-7">
            <slot />
          </div>
          <footer v-if="$slots.footer" data-foot class="relative flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-4 sm:px-7">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
