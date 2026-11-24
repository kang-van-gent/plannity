<script setup lang="ts">
import { CalendarDays, LayoutDashboard, Library, Menu, WandSparkles } from '@lucide/vue'
import { gsap } from 'gsap'

// Phone/tablet bottom navigation (hidden on lg+, where the sidebar shows).
// The active pill slides between tabs; the bar tucks away while the on-screen
// keyboard is up so it never floats over a focused field.
const emit = defineEmits<{ more: [] }>()
const { t } = useLocale()
const route = useRoute()
const items = computed(() => [
  { to: '/app', label: t('nav.tabHome'), icon: LayoutDashboard, exact: true },
  { to: '/app/content', label: t('nav.tabLibrary'), icon: Library },
  { to: '/app/generate', label: t('nav.tabCreate'), icon: WandSparkles, also: '/app/jobs', primary: true },
  { to: '/app/calendar', label: t('nav.calendar'), icon: CalendarDays },
])
const activeIndex = computed(() => items.value.findIndex((i) =>
  i.exact ? route.path === i.to : route.path.startsWith(i.to) || (!!i.also && route.path.startsWith(i.also))))

const bar = ref<HTMLElement | null>(null)
const pill = ref<HTMLElement | null>(null)
const tabs: HTMLElement[] = []
function setTab(el: unknown, i: number) {
  const node = (el as { $el?: HTMLElement } | null)?.$el
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

// Pages read --tabbar-h to keep their own sticky bars above the tab bar.
function publishHeight() {
  const h = bar.value && getComputedStyle(bar.value).display !== 'none' && !keyboard.value ? bar.value.offsetHeight : 0
  document.documentElement.style.setProperty('--tabbar-h', `${h}px`)
}
watch(keyboard, (k) => {
  if (!bar.value) return
  gsap.to(bar.value, { yPercent: k ? 110 : 0, duration: prefersReducedMotion() ? 0 : 0.3, ease: k ? 'power2.in' : 'power3.out' })
  publishHeight()
})
watch(activeIndex, () => nextTick(() => movePill(true)))

let ro: ResizeObserver | undefined
onMounted(() => {
  movePill(false)
  publishHeight()
  ro = new ResizeObserver(() => { movePill(false); publishHeight() })
  if (bar.value) ro.observe(bar.value)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  if (bar.value && !prefersReducedMotion()) gsap.from(bar.value, { yPercent: 110, duration: 0.6, delay: 0.2, ease: 'power3.out' })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  document.documentElement.style.removeProperty('--tabbar-h')
})
</script>

<template>
  <nav ref="bar" class="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    :aria-label="t('nav.main')">
    <div class="relative mx-auto grid max-w-xl grid-cols-5 px-1">
      <span ref="pill" class="pointer-events-none absolute left-0 top-1.5 h-8 w-14 rounded-full bg-brand-500/12 opacity-0" aria-hidden="true" />
      <NuxtLink v-for="(i, idx) in items" :key="i.to" :ref="(el) => setTab(el, idx)" :to="i.to"
        :aria-current="activeIndex === idx ? 'page' : undefined"
        class="relative flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[10.5px] font-semibold leading-tight transition-colors"
        :class="activeIndex === idx ? 'text-brand-600 dark:text-brand-300' : 'text-muted'">
        <span v-if="i.primary" class="-mt-5 mb-0.5 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-pink text-white shadow-pop ring-4 ring-bg transition-transform active:scale-90">
          <component :is="i.icon" class="size-5" />
        </span>
        <span v-else class="grid h-8 w-14 place-items-center transition-transform active:scale-90">
          <component :is="i.icon" class="size-5" :stroke-width="activeIndex === idx ? 2.4 : 2" />
        </span>
        <span class="max-w-full truncate px-0.5">{{ i.label }}</span>
      </NuxtLink>
      <button type="button" class="flex flex-col items-center gap-0.5 pb-2 pt-1.5 text-[10.5px] font-semibold leading-tight text-muted" @click="emit('more')">
        <span class="grid h-8 w-14 place-items-center transition-transform active:scale-90"><Menu class="size-5" /></span>
        <span class="max-w-full truncate px-0.5">{{ t('nav.more') }}</span>
      </button>
    </div>
  </nav>
</template>
