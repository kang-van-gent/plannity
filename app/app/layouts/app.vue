<script setup lang="ts">
import { Coins, FlaskConical, MessageSquareHeart, PanelLeftClose, PanelLeftOpen, WandSparkles } from '@lucide/vue'

const { t } = useLocale()
const brands = useBrands()
const { wallet, refresh } = useWallet()
const notify = useNotify()
const isMock = useIsMock()
const navOpen = ref(false)
const feedbackOpen = ref(false)
const features = useFeatures()
// The credits card's call to action: Generate when AI is open, otherwise Credits.
const cta = computed(() => features.aiGenerate ? { to: '/app/generate', label: t('nav.generate'), icon: WandSparkles } : { to: '/app/credits', label: t('credits.buy'), icon: Coins })
// Desktop sidebar: full (272px) or an icon rail. Cookie so SSR renders the right width.
const collapsed = useCookie<boolean>('sidebar-collapsed', { default: () => false, maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
const route = useRoute()
watch(() => route.fullPath, () => { navOpen.value = false })

useSeoMeta({ robots: 'noindex, nofollow' })

onMounted(async () => {
  refresh()
  try { await brands.load() } catch (e) { notify.fromError(e, { retry: () => brands.load(true) }) }
  // Keep lock state current: check end dates every 30s, and re-read brands when the tab regains focus.
  coverTimer = setInterval(() => brands.expireLapsed(), 30_000)
  window.addEventListener('focus', onFocus)
})
let coverTimer: ReturnType<typeof setInterval> | undefined
function onFocus() { if (!brands.expireLapsed() && brands.loaded.value) brands.load(true).catch(() => {}) }
onBeforeUnmount(() => { clearInterval(coverTimer); window.removeEventListener('focus', onFocus) })
</script>

<template>
  <div class="min-h-dvh overflow-x-clip transition-[grid-template-columns] duration-300 ease-out lg:grid lg:overflow-x-visible"
    :class="collapsed ? 'lg:grid-cols-[84px_minmax(0,1fr)]' : 'lg:grid-cols-[272px_minmax(0,1fr)]'">
    <!-- Keep the whole sidebar within the viewport while the page scrolls. -->
    <aside class="sticky top-0 z-50 hidden h-dvh self-start border-r border-line bg-surface lg:block">
     <!-- Always exactly the window height: logo + footer are fixed-size, the menu
          between them flexes and scrolls only if the window is too short. -->
     <div class="flex h-full flex-col pb-4 pt-5 [@media(max-height:720px)]:pb-3 [@media(max-height:720px)]:pt-3" :class="collapsed ? 'px-3' : 'px-4'">
      <button type="button" class="absolute -right-3.5 top-7 z-10 grid size-7 place-items-center rounded-full border border-line bg-surface text-muted shadow-soft transition hover:scale-110 hover:border-brand-300 hover:text-brand-600 dark:hover:text-brand-300"
        :aria-label="collapsed ? t('nav.expand') : t('nav.collapse')" :title="collapsed ? t('nav.expand') : t('nav.collapse')" :aria-expanded="!collapsed"
        @click="collapsed = !collapsed">
        <PanelLeftOpen v-if="collapsed" class="size-4" /><PanelLeftClose v-else class="size-4" />
      </button>
      <NuxtLink to="/app" class="mb-6 flex h-10 shrink-0 items-center [@media(max-height:720px)]:mb-3" :class="collapsed ? 'justify-center' : 'px-2'" aria-label="Plannity">
        <AppLogo v-if="collapsed" variant="mark" eager class="h-10" /><AppLogo v-else variant="lockup" eager class="h-10" />
      </NuxtLink>
      <div class="relative -mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 scrollbar-thin">
        <AppNav :collapsed="collapsed" />
      </div>
      <div class="shrink-0 space-y-3 pt-2 [@media(max-height:720px)]:space-y-2">
        <NuxtLink v-if="collapsed" :to="cta.to" class="mx-auto flex size-14 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-pop transition hover:scale-105"
          :title="`${t('credits.available')}: ${wallet?.available ?? '–'} · ${cta.label}`" :aria-label="cta.label">
          <component :is="cta.icon" class="size-4" /><span class="mt-0.5 font-display text-sm font-bold tabular-nums">{{ wallet?.available ?? '–' }}</span>
        </NuxtLink>
        <NuxtLink v-if="!collapsed" :to="cta.to" class="hidden items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 px-3 py-2.5 text-white shadow-pop transition hover:brightness-110 [@media(max-height:720px)]:flex">
          <span class="grid size-8 place-items-center rounded-xl bg-white/20"><component :is="cta.icon" class="size-4" /></span>
          <span class="min-w-0 flex-1 truncate text-sm font-bold">{{ cta.label }}</span>
          <span class="rounded-lg bg-white/20 px-2 py-0.5 font-display text-sm font-bold tabular-nums" :title="t('credits.available')">{{ wallet?.available ?? '–' }}</span>
        </NuxtLink>
        <div v-if="!collapsed" class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white [@media(max-height:720px)]:hidden">
          <Doodle variant="burst" class="absolute right-3 top-2 size-8 text-sun" />
          <p class="text-xs font-semibold text-white/75">{{ t('credits.available') }}</p>
          <p class="font-display text-3xl font-bold tabular-nums">{{ wallet?.available ?? '–' }}</p>
          <NuxtLink :to="cta.to" class="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-sm font-bold text-brand-600 transition hover:bg-white">
            <component :is="cta.icon" class="size-4" />{{ cta.label }}
          </NuxtLink>
        </div>
        <button type="button" class="btn-ghost w-full" :class="collapsed ? 'justify-center px-0' : 'justify-start'" :title="collapsed ? t('feedback.title') : undefined" :aria-label="collapsed ? t('feedback.title') : undefined" @click="feedbackOpen = true">
          <MessageSquareHeart class="size-4" /><span v-if="!collapsed">{{ t('feedback.title') }}</span>
        </button>
        <p v-if="isMock" class="flex items-center gap-1.5 rounded-xl bg-sun/15 py-2 text-[11px] font-semibold text-amber-700 dark:text-sun" :class="collapsed ? 'justify-center px-0' : 'px-3'" :title="collapsed ? t('common.mockBadge') : undefined">
          <FlaskConical class="size-3.5" /><span v-if="!collapsed">{{ t('common.mockBadge') }}</span>
        </p>
      </div>
     </div>
    </aside>

    <div class="min-w-0">
      <header class="sticky top-0 z-40 border-b border-line/70 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 sm:border-line sm:bg-bg/85">
        <div class="flex h-14 items-center gap-2 px-3 sm:h-auto sm:gap-3 sm:px-6 sm:py-3 lg:px-10">
          <NuxtLink to="/app" class="hidden shrink-0 sm:flex lg:hidden" aria-label="Plannity"><AppLogo variant="mark" eager class="h-8" /></NuxtLink>
          <AppBrandSwitcher class="min-w-0 flex-1 sm:flex-none" />
          <div class="ml-auto flex shrink-0 items-center gap-2">
            <AppCreditPill />
            <div class="hidden sm:block"><LocaleSwitch /></div>
            <div class="hidden sm:block"><ThemeToggle /></div>
            <AppProfileMenu />
          </div>
        </div>
      </header>
      <main id="main" class="mx-auto w-full max-w-[1400px] px-4 pb-[calc(var(--tabbar-h,5rem)+1rem)] pt-5 sm:px-6 sm:pt-8 lg:px-10 lg:pb-10">
        <UiBackButton v-if="route.path !== '/app'" class="mb-3 sm:mb-4" />
        <slot />
      </main>
    </div>

    <AppTabBar @more="navOpen = true" />

    <SidePanel :open="navOpen" size="sm" title="Plannity" :subtitle="t('brand.tagline')" @close="navOpen = false">
      <AppNav @navigate="navOpen = false" />
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
      <button type="button" class="btn-secondary w-full" @click="navOpen = false; feedbackOpen = true"><MessageSquareHeart class="size-4" />{{ t('feedback.title') }}</button>
      <p v-if="isMock" class="rounded-xl bg-sun/15 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-sun">{{ t('common.mockBadge') }}</p>
    </SidePanel>
    <AppFeedbackPanel :open="feedbackOpen" @close="feedbackOpen = false" />
  </div>
</template>
