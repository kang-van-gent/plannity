<script setup lang="ts">
import { FlaskConical, Menu, MessageSquareHeart, WandSparkles } from '@lucide/vue'

const { t } = useLocale()
const brands = useBrands()
const { wallet, refresh } = useWallet()
const notify = useNotify()
const isMock = useIsMock()
const navOpen = ref(false)
const feedbackOpen = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => { navOpen.value = false })

useSeoMeta({ robots: 'noindex, nofollow' })

onMounted(async () => {
  refresh()
  try { await brands.load() } catch (e) { notify.fromError(e, { retry: () => brands.load(true) }) }
})
</script>

<template>
  <div class="min-h-dvh overflow-x-clip lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:overflow-x-visible">
    <aside class="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 pb-4 pt-5 lg:flex">
      <NuxtLink to="/app" class="mb-6 flex px-2" aria-label="Plannity"><AppLogo variant="lockup" eager class="h-10" /></NuxtLink>
      <AppNav />
      <div class="mt-auto space-y-3">
        <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white">
          <Doodle variant="burst" class="absolute right-3 top-2 size-8 text-sun" />
          <p class="text-xs font-semibold text-white/75">{{ t('credits.available') }}</p>
          <p class="font-display text-3xl font-bold tabular-nums">{{ wallet?.available ?? '–' }}</p>
          <NuxtLink to="/app/generate" class="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-sm font-bold text-brand-600 transition hover:bg-white">
            <WandSparkles class="size-4" />{{ t('nav.generate') }}
          </NuxtLink>
        </div>
        <button type="button" class="btn-ghost w-full justify-start" @click="feedbackOpen = true"><MessageSquareHeart class="size-4" />{{ t('feedback.title') }}</button>
        <p v-if="isMock" class="flex items-center gap-1.5 rounded-xl bg-sun/15 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-sun">
          <FlaskConical class="size-3.5" />{{ t('common.mockBadge') }}
        </p>
      </div>
    </aside>

    <div class="min-w-0">
      <header class="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div class="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6 lg:px-10">
          <button type="button" class="btn-icon btn-ghost lg:hidden" :aria-label="t('nav.menu')" @click="navOpen = true"><Menu class="size-5" /></button>
          <NuxtLink to="/app" class="hidden shrink-0 sm:flex lg:hidden" aria-label="Plannity"><AppLogo variant="mark" eager class="h-8" /></NuxtLink>
          <AppBrandSwitcher />
          <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
            <AppCreditPill />
            <div class="hidden sm:block"><LocaleSwitch /></div>
            <ThemeToggle />
            <AppProfileMenu />
          </div>
        </div>
      </header>
      <main id="main" class="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <slot />
      </main>
    </div>

    <SidePanel :open="navOpen" size="sm" title="Plannity" :subtitle="t('brand.tagline')" @close="navOpen = false">
      <AppNav @navigate="navOpen = false" />
      <div class="flex items-center justify-between rounded-2xl bg-surface-2 p-3">
        <span class="text-sm font-semibold">{{ t('common.language') }}</span>
        <LocaleSwitch />
      </div>
      <button type="button" class="btn-secondary w-full" @click="navOpen = false; feedbackOpen = true"><MessageSquareHeart class="size-4" />{{ t('feedback.title') }}</button>
      <p v-if="isMock" class="rounded-xl bg-sun/15 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-sun">{{ t('common.mockBadge') }}</p>
    </SidePanel>
    <AppFeedbackPanel :open="feedbackOpen" @close="feedbackOpen = false" />
  </div>
</template>
