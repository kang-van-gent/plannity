<script setup lang="ts">
import type { Platform } from '~/types'
const props = withDefaults(defineProps<{ platform: Platform; withLabel?: boolean; size?: 'xs' | 'sm' }>(), { size: 'sm' })
const meta = computed(() => PLATFORM_META[props.platform])
</script>

<template>
  <span class="inline-flex items-center gap-1.5" :title="meta.label">
    <span class="inline-grid place-items-center rounded-md font-bold leading-none"
      :class="size === 'xs' ? 'h-4 min-w-4 px-0.5 text-[0.5rem]' : 'h-5 min-w-5 px-1 text-[0.5625rem]'"
      :style="{ background: meta.bg, color: meta.fg }" aria-hidden="true">{{ meta.short }}</span>
    <span v-if="withLabel" class="text-xs font-medium">{{ meta.label }}</span>
    <span v-else class="sr-only">{{ meta.label }}</span>
  </span>
</template>
