<script setup lang="ts">
import { ArrowRight, Menu } from '@lucide/vue'

const { t, locale } = useLocale()
const { isLoggedIn } = useSession()
const scrolled = ref(false)
const menuOpen = ref(false)
const links = computed(() => [
  { to: '/#how', label: t('nav.howItWorks') },
  { to: '/#features', label: t('nav.features') },
  { to: '/#pricing', label: t('nav.pricing') },
  { to: '/blog', label: t('nav.blog') },
  { to: '/#faq', label: t('nav.faq') },
])
const route = useRoute()
const onHashClick = useSmoothHash()
watch(() => route.fullPath, () => { menuOpen.value = false })

// ---- active link ---------------------------------------------------------------
// Other pages: by route (/blog and its articles). Landing page: by the section
// under the upper third of the viewport (scroll-spy), so the highlight follows
// the reader — including through the pinned "How it works" track.
const spied = ref<string | null>(null)
const active = computed<string | null>(() => {
  const hit = links.value.find((l) => !l.to.includes('#') && (route.path === l.to || route.path.startsWith(`${l.to}/`)))
  if (hit) return hit.to
  return route.path === '/' ? spied.value : null
})
const ariaCurrent = (to: string) => (active.value !== to ? undefined : to.includes('#') ? 'location' : 'page')

function spy() {
  if (route.path !== '/') { spied.value = null; return }
  const line = window.innerHeight * 0.35
  let hit: string | null = null
  for (const l of links.value) {
    if (!l.to.startsWith('/#')) continue
    const r = document.getElementById(l.to.slice(2))?.getBoundingClientRect()
    if (r && r.top <= line && r.bottom > line) hit = l.to
  }
  spied.value = hit
}

// Sliding pill behind the active desktop link.
const navEl = ref<HTMLElement | null>(null)
const linkEls = new Map<string, HTMLElement>()
const setLinkEl = (to: string) => (el: unknown) => {
  const node = (el as { $el?: HTMLElement } | null)?.$el ?? (el as HTMLElement | null)
  if (node instanceof HTMLElement) linkEls.set(to, node)
  else linkEls.delete(to)
}
const pill = reactive({ x: 0, w: 0, shown: false, ready: false })
function placePill() {
  const el = active.value ? linkEls.get(active.value) : null
  if (!el || !navEl.value) { pill.shown = false; return }
  pill.x = el.offsetLeft
  pill.w = el.offsetWidth
  pill.shown = true
  // Appear in place the first time; slide between links after that.
  if (!pill.ready) requestAnimationFrame(() => { pill.ready = true })
}
watch([active, locale], () => nextTick(placePill))

let frame = 0
function onScroll() {
  scrolled.value = window.scrollY > 12
  if (frame) return
  frame = requestAnimationFrame(() => { frame = 0; spy() })
}
function onResize() { spy(); placePill() }
watch(() => route.path, () => nextTick(spy))
onMounted(() => {
  onScroll()
  spy()
  placePill()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  document.fonts?.ready.then(placePill) // web fonts change link widths
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  if (frame) cancelAnimationFrame(frame)
})
</script>

<template>
  <!-- Height never changes on scroll (that would shift the whole page); only
       the bar's background, border and shadow fade in. -->
  <header class="sticky top-0 z-50 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-3">
    <div class="mx-auto flex max-w-7xl items-center gap-3 rounded-3xl border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-300 sm:px-5"
      :class="scrolled ? 'border-line bg-surface/85 shadow-soft backdrop-blur-xl' : 'border-transparent'">
      <NuxtLink to="/" class="flex shrink-0" aria-label="Plannity home"><AppLogo variant="lockup" eager class="h-9 sm:h-10" /></NuxtLink>
      <nav ref="navEl" class="relative ml-6 hidden items-center gap-1 lg:flex" :aria-label="t('nav.main')">
        <span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 rounded-xl bg-brand-500/10 ring-1 ring-brand-500/15 dark:bg-brand-400/15"
          :class="[pill.ready ? 'transition-[transform,width,opacity] duration-300 ease-out' : '', pill.shown ? 'opacity-100' : 'opacity-0']"
          :style="{ width: `${pill.w}px`, transform: `translateX(${pill.x}px)` }">
          <span class="absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-500" />
        </span>
        <NuxtLink v-for="l in links" :key="l.to" :ref="setLinkEl(l.to)" :to="l.to" :aria-current="ariaCurrent(l.to)" @click.capture="onHashClick($event, l.to)"
          class="relative whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors"
          :class="active === l.to ? 'text-brand-600 dark:text-brand-300' : 'text-muted hover:bg-surface-2 hover:text-fg'">{{ l.label }}</NuxtLink>
      </nav>
      <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div class="hidden sm:block"><LocaleSwitch /></div>
        <div class="hidden sm:block"><ThemeToggle /></div>
        <template v-if="isLoggedIn">
          <NuxtLink to="/app" class="btn-primary hidden sm:inline-flex">{{ t('nav.openApp') }}<ArrowRight class="size-4" /></NuxtLink>
        </template>
        <template v-else>
          <NuxtLink to="/login" class="btn-ghost hidden md:inline-flex">{{ t('nav.login') }}</NuxtLink>
          <NuxtLink to="/register" class="btn-primary hidden sm:inline-flex">{{ t('nav.tryFree') }}</NuxtLink>
        </template>
        <button type="button" class="btn-icon btn-ghost lg:hidden" :aria-label="t('nav.menu')" @click="menuOpen = true"><Menu class="size-5" /></button>
      </div>
    </div>

    <SidePanel :open="menuOpen" size="sm" title="Plannity" :subtitle="t('brand.tagline')" @close="menuOpen = false">
      <nav class="grid gap-1" :aria-label="t('nav.main')">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" :aria-current="ariaCurrent(l.to)"
          class="flex items-center gap-3 rounded-2xl px-4 py-3 font-display text-lg font-semibold transition-colors"
          :class="active === l.to ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'hover:bg-surface-2'"
          @click.capture="onHashClick($event, l.to, { delay: 420 })" @click="menuOpen = false">
          {{ l.label }}
          <Doodle v-if="active === l.to" variant="spark" class="ml-auto size-4 text-sun" />
        </NuxtLink>
      </nav>
      <div class="grid gap-2 rounded-2xl bg-surface-2 p-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-semibold">{{ t('common.language') }}</span>
          <LocaleSwitch />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-semibold">{{ t('nav.theme') }}</span>
          <ThemeToggle />
        </div>
      </div>
      <template #footer>
        <NuxtLink v-if="isLoggedIn" to="/app" class="btn-primary w-full">{{ t('nav.openApp') }}</NuxtLink>
        <template v-else>
          <NuxtLink to="/login" class="btn-secondary flex-1">{{ t('nav.login') }}</NuxtLink>
          <NuxtLink to="/register" class="btn-primary flex-1">{{ t('nav.tryFree') }}</NuxtLink>
        </template>
      </template>
    </SidePanel>
  </header>
</template>
