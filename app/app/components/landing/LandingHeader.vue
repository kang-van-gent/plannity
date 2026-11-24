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
watch(() => route.fullPath, () => { menuOpen.value = false })

function onScroll() { scrolled.value = window.scrollY > 12 }
onMounted(() => { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <header class="sticky top-0 z-50 transition-all duration-300" :class="scrolled ? 'py-2' : 'py-4'">
    <div class="mx-auto flex max-w-7xl items-center gap-3 rounded-3xl px-4 py-2 transition-all duration-300 sm:px-5"
      :class="scrolled ? 'mx-3 border border-line bg-surface/80 shadow-soft backdrop-blur-xl sm:mx-6 lg:mx-auto' : 'border border-transparent'">
      <NuxtLink to="/" class="flex shrink-0" aria-label="Plannity home"><AppLogo variant="lockup" eager class="h-9 sm:h-10" /></NuxtLink>
      <nav class="ml-6 hidden items-center gap-1 lg:flex" :aria-label="t('nav.main')">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg">{{ l.label }}</NuxtLink>
      </nav>
      <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div class="hidden sm:block"><LocaleSwitch /></div>
        <ThemeToggle />
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
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="rounded-2xl px-4 py-3 font-display text-lg font-semibold hover:bg-surface-2" @click="menuOpen = false">{{ l.label }}</NuxtLink>
      </nav>
      <div class="flex items-center justify-between rounded-2xl bg-surface-2 p-3">
        <span class="text-sm font-semibold">{{ t('common.language') }}</span>
        <LocaleSwitch />
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
