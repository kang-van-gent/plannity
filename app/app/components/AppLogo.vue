<script setup lang="ts">
// Uses only the approved Plannity logo artwork (spec §2A). The "-dark" files
// are the same artwork with the ink wordmark reversed for dark backgrounds.
const props = withDefaults(defineProps<{ variant?: 'lockup' | 'full' | 'mark' | 'wordmark'; eager?: boolean }>(), { variant: 'lockup', eager: false })

const SIZES = { lockup: [720, 198], full: [1000, 384], mark: [256, 256], wordmark: [560, 155] } as const
const size = computed(() => SIZES[props.variant])
const light = computed(() => `/brand/logo-${props.variant}.png`)
const dark = computed(() => props.variant === 'mark' ? '/brand/logo-mark.png' : `/brand/logo-${props.variant}-dark.png`)
</script>

<template>
  <span class="inline-flex shrink-0 items-center">
    <img :src="light" alt="Plannity" :width="size[0]" :height="size[1]" :loading="eager ? 'eager' : 'lazy'" :fetchpriority="eager ? 'high' : 'auto'" class="h-full w-auto select-none dark:hidden" draggable="false">
    <img :src="dark" alt="Plannity" :width="size[0]" :height="size[1]" :loading="eager ? 'eager' : 'lazy'" class="hidden h-full w-auto select-none dark:block" draggable="false">
  </span>
</template>
