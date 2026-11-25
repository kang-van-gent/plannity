<script setup lang="ts">
import { History, Settings2, Users } from '@lucide/vue'

// Profile | Team switcher on a brand's pages.
const props = defineProps<{ brandId: string; active: 'profile' | 'team' | 'activity' }>()
const { t } = useLocale()
const tabs = computed(() => [
  { key: 'profile', to: `/app/brands/${props.brandId}`, label: t('team.profileTab'), icon: Settings2 },
  { key: 'team', to: `/app/brands/${props.brandId}/team`, label: t('team.tab'), icon: Users },
  { key: 'activity', to: `/app/brands/${props.brandId}/activity`, label: t('activity.tab'), icon: History },
])
</script>

<template>
  <nav class="segmented mb-6 w-full sm:w-auto" :aria-label="t('nav.brands')">
    <NuxtLink v-for="tab in tabs" :key="tab.key" :to="tab.to" :aria-current="active === tab.key ? 'page' : undefined"
      class="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 sm:px-4 text-sm font-semibold transition active:scale-[0.97]"
      :class="active === tab.key ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg'">
      <component :is="tab.icon" class="size-4" />{{ tab.label }}
    </NuxtLink>
  </nav>
</template>
