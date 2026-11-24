<script setup lang="ts">
import type { ContentStatus } from '~/types'
defineProps<{ status: ContentStatus; small?: boolean }>()
const { t } = useLocale()
</script>

<template>
  <span class="chip" :class="[STATUS_META[status].chip, small ? 'px-2 py-0.5 text-[10px]' : '']">
    <span class="size-1.5 rounded-full" :class="STATUS_META[status].dot" />
    {{ t(`status.${status}`) }}
  </span>
</template>
