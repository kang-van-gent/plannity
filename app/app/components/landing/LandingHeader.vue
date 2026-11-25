<script setup lang="ts">
import { ArrowRight, Menu } from '@lucide/vue'

const { t } = useLocale()
const { isLoggedIn } = useSession()
const scrolled = ref(false)
const menuOpen = ref(false)
const links = computed(() => [
  { to: '/#how', label: t('nav.howItWorks') },
  { to: '/pricing', label: t('nav.pricing') },
  { to: '/#upstify', label: 'Upstify' },
  { to: '/#faq', label: t('nav.faq') },
])
const route = useRoute()
const onHashClick = useSmoothHash()
watch(() => route.fullPath, () => { menuOpen.value = false })

function onScroll() { scrolled.value = window.scrollY > 12 }
onMounted(() => { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <!-- Height never changes on scroll (that would shift the whole page); only
       the bar's background, border and shadow fade in. -->
  <header class="sticky top-0 z-50 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-3">
    <div class="mx-auto flex max-w-7xl items-center gap-3 rounded-3xl border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-300 sm:px-5"
      :class="scrolled ? 'border-line bg-surface/85 shadow-soft backdrop-blur-xl' : 'border-transparent'">
      <NuxtLink to="/" class="flex shrink-0" aria-label="Plannity home"><AppLogo variant="lockup" eager class="h-9 sm:h-10" /></NuxtLink>
      <nav class="ml-6 hidden items-center gap-1 lg:flex" :aria-label="t('nav.main')">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" @click.capture="onHashClick($event, l.to)" class="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg">{{ l.label }}</NuxtLink>
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
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="rounded-2xl px-4 py-3 font-display text-lg font-semibold hover:bg-surface-2" @click.capture="onHashClick($event, l.to, { delay: 420 })" @click="menuOpen = false">{{ l.label }}</NuxtLink>
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
