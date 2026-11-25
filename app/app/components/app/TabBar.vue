<script setup lang="ts">
import { CalendarDays, LayoutDashboard, Library, Lock, Menu, WandSparkles } from '@lucide/vue'
import { gsap } from 'gsap'

// Phone/tablet bottom navigation (hidden on lg+, where the sidebar shows).
// The active pill slides between tabs; the bar tucks away while the on-screen
// keyboard is up so it never floats over a focused field.
const emit = defineEmits<{ more: [] }>()
const { t } = useLocale()
const route = useRoute()
const features = useFeatures()
const notify = useNotify()
const items = computed(() => ([
  { to: '/app', label: t('nav.tabHome'), icon: LayoutDashboard, exact: true },
  { to: '/app/content', label: t('nav.tabLibrary'), icon: Library },
  { to: '/app/generate', label: t('nav.tabCreate'), icon: WandSparkles, also: '/app/jobs', primary: true },
  { to: '/app/calendar', label: t('nav.calendar'), icon: CalendarDays },
] as { to: string; label: string; icon: unknown; exact?: boolean; also?: string; primary?: boolean }[]).map((i) => ({ ...i, locked: isLockedPath(i.to, features) })))
function lockedTap() { notify.info(t('nav.lockedTitle'), t('nav.lockedBody')) }
const activeIndex = computed(() => items.value.findIndex((i) =>
  i.exact ? route.path === i.to : route.path.startsWith(i.to) || (!!i.also && route.path.startsWith(i.also))))

const bar = ref<HTMLElement | null>(null)
const pill = ref<HTMLElement | null>(null)
const tabs: HTMLElement[] = []
function setTab(el: unknown, i: number) {
  const node = (el as { $el?: HTMLElement } | null)?.$el ?? (el instanceof HTMLElement ? el : null)
  if (node) tabs[i] = node
}
const keyboard = ref(false)

function movePill(animate: boolean) {
  const i = activeIndex.value
  const el = i >= 0 && !items.value[i]!.primary ? tabs[i] : null
  if (!pill.value) return
  if (!el) { gsap.to(pill.value, { opacity: 0, scale: 0.6, duration: animate ? 0.2 : 0 }); return }
  const x = el.offsetLeft + el.offsetWidth / 2 - pill.value.offsetWidth / 2
  gsap.to(pill.value, { x, opacity: 1, scale: 1, duration: animate && !prefersReducedMotion() ? 0.45 : 0, ease: 'back.out(1.6)' })
}

const isEditable = (el: EventTarget | null) => el instanceof HTMLElement && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]),textarea,select,[contenteditable="true"]'))
function onFocusIn(e: FocusEvent) { if (matchMedia('(pointer: coarse)').matches && isEditable(e.target)) keyboard.value = true }
function onFocusOut() { setTimeout(() => { keyboard.value = isEditable(document.activeElement) && matchMedia('(pointer: coarse)').matches }, 50) }

// Pages read --tabbar-h to keep their own sticky bars (and the page's bottom
// padding) clear of the floating tab bar. Measured from layout — the bar's own
// height plus its CSS bottom offset — never from its on-screen position, so the
// slide-in/keyboard animations and viewport resizes can't skew it.
function publishHeight() {
  const el = bar.value
  let h = 0
  if (el && !keyboard.value) {
    const cs = getComputedStyle(el)
    if (cs.display !== 'none') h = Math.round(el.offsetHeight + (Number.parseFloat(cs.bottom) || 0))
  }
  document.documentElement.style.setProperty('--tabbar-h', `${h}px`)
}
watch(keyboard, (k) => {
  if (!bar.value) return
  gsap.to(bar.value, { yPercent: k ? 160 : 0, duration: prefersReducedMotion() ? 0 : 0.3, ease: k ? 'power2.in' : 'power3.out' })
  publishHeight()
})
watch(activeIndex, () => nextTick(() => movePill(true)))

let ro: ResizeObserver | undefined
onMounted(() => {
  movePill(false)
  publishHeight()
  ro = new ResizeObserver(() => { movePill(false); publishHeight() })
  if (bar.value) ro.observe(bar.value)
  window.addEventListener('resize', publishHeight, { passive: true }) // lg breakpoint, safe-area changes
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  if (bar.value && !prefersReducedMotion()) gsap.from(bar.value, { yPercent: 160, duration: 0.6, delay: 0.2, ease: 'power3.out' })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('resize', publishHeight)
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  document.documentElement.style.removeProperty('--tabbar-h')
})
</script>

<template>
  <!-- Floating "island" tab bar: rounded, frosted, lifted off the home indicator. -->
  <nav ref="bar" class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-[1.75rem] border border-line/80 bg-surface/85 shadow-[0_12px_40px_-12px_rgb(33_28_58/0.35)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    :aria-label="t('nav.main')">
    <div class="relative grid grid-cols-5 px-1.5 py-1.5">
      <span ref="pill" class="pointer-events-none absolute left-0 top-1.5 h-[3.25rem] w-[4.25rem] rounded-[1.25rem] bg-brand-500/12 opacity-0" aria-hidden="true" />
      <template v-for="(i, idx) in items" :key="i.to">
      <button v-if="i.locked" :ref="(el) => setTab(el, idx)" type="button" aria-disabled="true" :aria-label="`${i.label} (${t('nav.comingSoon')})`"
        class="relative flex h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold leading-tight text-muted transition active:scale-90" @click="lockedTap">
        <span v-if="i.primary" class="relative grid size-12 place-items-center rounded-[1.1rem] bg-surface-2 text-muted/70">
          <component :is="i.icon" class="size-[22px]" />
          <span class="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-surface text-muted shadow-soft ring-1 ring-line"><Lock class="size-3" /></span>
        </span>
        <template v-else><component :is="i.icon" class="size-[22px] opacity-60" /><span class="max-w-full truncate px-0.5">{{ i.label }}</span></template>
      </button>
      <NuxtLink v-else :ref="(el) => setTab(el, idx)" :to="i.to"
        :aria-current="activeIndex === idx ? 'page' : undefined"
        class="relative flex h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold leading-tight transition-colors active:scale-90"
        :class="activeIndex === idx ? 'text-brand-600 dark:text-brand-300' : 'text-muted'">
        <span v-if="i.primary" class="grid size-12 place-items-center rounded-[1.1rem] bg-gradient-to-br from-brand-500 to-pink text-white shadow-pop transition-transform"
          :class="activeIndex === idx ? 'scale-105 ring-2 ring-brand-300/60 ring-offset-2 ring-offset-surface' : ''" :aria-label="i.label">
          <component :is="i.icon" class="size-[22px]" />
        </span>
        <template v-else>
          <component :is="i.icon" class="size-[22px] transition-transform" :class="activeIndex === idx ? '-translate-y-px' : ''" :stroke-width="activeIndex === idx ? 2.4 : 2" />
          <span class="max-w-full truncate px-0.5">{{ i.label }}</span>
        </template>
      </NuxtLink>
      </template>
      <button type="button" class="flex h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold leading-tight text-muted transition active:scale-90" @click="emit('more')">
        <Menu class="size-[22px]" />
        <span class="max-w-full truncate px-0.5">{{ t('nav.more') }}</span>
      </button>
    </div>
  </nav>
</template>
