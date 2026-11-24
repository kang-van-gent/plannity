<script setup lang="ts">
import { X } from '@lucide/vue'
import { gsap } from 'gsap'
import type { Notice, NoticeType } from '~/composables/useNotify'

// Global feedback layer: animated result cards slide in from the right for
// every action response; confirmations open as a right-side panel.
const { notices, dismiss, confirmReq } = useNotify()
const { t } = useLocale()
const timers = new Map<number, gsap.core.Tween>()
const panelStack = useState<number[]>('panel-stack', () => [])
const vw = ref(1440)
onMounted(() => { vw.value = window.innerWidth; window.addEventListener('resize', onResize) })
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
function onResize() { vw.value = window.innerWidth }
// Sit to the left of an open right-side panel when there is room, so the panel header stays visible.
const offset = computed(() => {
  const w = panelStack.value[panelStack.value.length - 1] ?? 0
  return w && vw.value - w >= 420 ? w + 16 : 0
})

const ACCENT: Record<NoticeType, string> = {
  success: 'bg-success', error: 'bg-danger', warning: 'bg-warning', cancel: 'bg-muted', info: 'bg-brand-500',
}
const GLOW: Record<NoticeType, string> = {
  success: 'from-success/15', error: 'from-danger/15', warning: 'from-warning/15', cancel: 'from-muted/10', info: 'from-brand-500/15',
}

function byEl(el: Element): Notice | undefined {
  return notices.value.find((n) => n.id === Number((el as HTMLElement).dataset.id))
}

function startTimer(el: HTMLElement, n: Notice) {
  if (n.timeout <= 0) return
  const bar = el.querySelector('[data-progress]')
  timers.set(n.id, gsap.fromTo(bar, { scaleX: 1 }, { scaleX: 0, duration: n.timeout / 1000, ease: 'none', transformOrigin: 'left center', onComplete: () => dismiss(n.id) }))
}

function onEnter(el: Element, done: () => void) {
  const n = byEl(el)
  const node = el as HTMLElement
  if (!n) return done()
  if (prefersReducedMotion()) { startTimer(node, n); return done() }
  const tl = gsap.timeline({ onComplete: () => { startTimer(node, n); done() } })
  const ease = n.type === 'cancel' ? 'power3.out' : 'back.out(1.5)'
  tl.fromTo(node, { x: '115%', rotate: n.type === 'cancel' ? 0 : 5, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: n.type === 'cancel' ? 0.5 : 0.7, ease })
  if (n.type === 'error') tl.to(node, { keyframes: { x: [0, -12, 10, -8, 6, -3, 0] }, duration: 0.5, ease: 'none' }, 0.55)
  if (n.type === 'success') tl.fromTo(node.querySelector('[data-glow]'), { opacity: 0 }, { opacity: 1, duration: 0.4, yoyo: true, repeat: 1 }, 0.4)
  if (n.type === 'warning') tl.to(node, { keyframes: { rotate: [0, -1.5, 1.2, -0.6, 0] }, duration: 0.5, ease: 'none', transformOrigin: '100% 50%' }, 0.55)
}

function onLeave(el: Element, done: () => void) {
  const node = el as HTMLElement
  timers.get(Number(node.dataset.id))?.kill()
  timers.delete(Number(node.dataset.id))
  if (prefersReducedMotion()) return done()
  gsap.timeline({ onComplete: done })
    .to(node, { x: '115%', opacity: 0, duration: 0.32, ease: 'power2.in' })
    .to(node, { height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, duration: 0.22, ease: 'power2.inOut' })
}

const pause = (n: Notice) => timers.get(n.id)?.pause()
const resume = (n: Notice) => timers.get(n.id)?.resume()

function runAction(n: Notice) {
  n.action?.handler()
  dismiss(n.id)
}

// --- confirm panel ---------------------------------------------------------
const confirmOpen = computed(() => !!confirmReq.value)
const lastConfirm = shallowRef(confirmReq.value)
watch(confirmReq, (v) => { if (v) lastConfirm.value = v })
const iconType = computed<NoticeType>(() => (lastConfirm.value?.tone === 'danger' || lastConfirm.value?.tone === 'warning' ? 'warning' : 'info'))
const answer = (ok: boolean) => confirmReq.value?.resolve(ok)
</script>

<template>
  <div class="pointer-events-none fixed right-3 top-3 z-[160] w-[min(390px,calc(100vw-1.5rem))] transition-[right] duration-500 ease-[var(--ease-spring)] sm:right-5 sm:top-5"
    :style="offset ? { right: `${offset}px` } : undefined" aria-live="polite">
    <TransitionGroup :css="false" @enter="onEnter" @leave="onLeave">
      <div v-for="n in notices" :key="n.id" :data-id="n.id" :role="n.type === 'error' ? 'alert' : 'status'"
        class="pointer-events-auto relative mb-3 overflow-hidden rounded-3xl border border-line bg-surface p-4 pl-5 shadow-panel"
        @mouseenter="pause(n)" @mouseleave="resume(n)" @focusin="pause(n)" @focusout="resume(n)">
        <span data-glow class="pointer-events-none absolute inset-0 bg-gradient-to-r to-transparent opacity-60" :class="GLOW[n.type]" />
        <span class="absolute inset-y-0 left-0 w-1.5" :class="ACCENT[n.type]" />
        <div class="relative flex items-start gap-3">
          <ResultIcon :type="n.type" :size="42" :delay="0.3" />
          <div class="min-w-0 flex-1 pt-0.5">
            <p class="font-display text-[15px] font-semibold leading-snug">{{ n.title }}</p>
            <p v-if="n.message" class="mt-0.5 text-sm leading-relaxed text-muted">{{ n.message }}</p>
            <button v-if="n.action" type="button" class="btn-secondary btn-sm mt-2.5" @click="runAction(n)">{{ n.action.label }}</button>
          </div>
          <button type="button" class="btn-icon btn-ghost -mr-2 -mt-1 p-1.5" :aria-label="t('common.close')" @click="dismiss(n.id)">
            <X class="size-4" />
          </button>
        </div>
        <span data-progress class="absolute bottom-0 left-0 h-1 w-full opacity-70" :class="ACCENT[n.type]" />
      </div>
    </TransitionGroup>
  </div>

  <SidePanel :open="confirmOpen" size="sm" :title="lastConfirm?.title" @close="answer(false)">
    <div class="flex flex-col items-center pt-4 text-center">
      <ResultIcon v-if="confirmOpen" :key="lastConfirm?.id" :type="iconType" :size="84" :delay="0.35" />
      <p v-if="lastConfirm?.message" class="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">{{ lastConfirm.message }}</p>
    </div>
    <dl v-if="lastConfirm?.details?.length" class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-2">
      <div v-for="d in lastConfirm.details" :key="d.label" class="flex items-center justify-between gap-4 px-4 py-3 text-sm">
        <dt class="text-muted">{{ d.label }}</dt>
        <dd class="font-semibold" :class="d.emphasis ? 'text-brand-600 dark:text-brand-300 text-base' : ''">{{ d.value }}</dd>
      </div>
    </dl>
    <template #footer>
      <button type="button" class="btn-secondary" @click="answer(false)">{{ lastConfirm?.cancelLabel ?? t('common.cancel') }}</button>
      <button type="button" :class="lastConfirm?.tone === 'danger' ? 'btn-danger' : 'btn-primary'" @click="answer(true)">
        {{ lastConfirm?.confirmLabel ?? t('common.confirm') }}
      </button>
    </template>
  </SidePanel>
</template>
