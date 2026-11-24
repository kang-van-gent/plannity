<script setup lang="ts">
import { CalendarDays, Coins, LayoutDashboard, Library, Megaphone, Settings, Store, WandSparkles } from '@lucide/vue'

const emit = defineEmits<{ navigate: [] }>()
const { t } = useLocale()
const route = useRoute()
const items = computed(() => [
  { to: '/app', label: t('nav.dashboard'), icon: LayoutDashboard, exact: true },
  { to: '/app/brands', label: t('nav.brands'), icon: Store },
  { to: '/app/generate', label: t('nav.generate'), icon: WandSparkles, also: '/app/jobs' },
  { to: '/app/content', label: t('nav.library'), icon: Library },
  { to: '/app/calendar', label: t('nav.calendar'), icon: CalendarDays },
  { to: '/app/promote', label: t('nav.promote'), icon: Megaphone },
  { to: '/app/credits', label: t('nav.credits'), icon: Coins },
  { to: '/app/settings', label: t('nav.settings'), icon: Settings },
])
function isActive(i: { to: string; exact?: boolean; also?: string }) {
  if (i.exact) return route.path === i.to
  return route.path.startsWith(i.to) || (!!i.also && route.path.startsWith(i.also))
}
</script>

<template>
  <nav class="grid gap-1" :aria-label="t('nav.main')">
    <NuxtLink v-for="i in items" :key="i.to" :to="i.to" :aria-current="isActive(i) ? 'page' : undefined"
      class="group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition"
      :class="isActive(i) ? 'bg-brand-500 text-white shadow-pop' : 'text-muted hover:bg-surface-2 hover:text-fg'"
      @click="emit('navigate')">
      <component :is="i.icon" class="size-[18px] transition-transform group-hover:scale-110 group-hover:-rotate-6" />
      {{ i.label }}
      <Doodle v-if="isActive(i)" variant="spark" class="ml-auto size-3.5 text-sun" />
    </NuxtLink>
  </nav>
</template>
