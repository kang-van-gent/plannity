<script setup lang="ts">
import { Camera, ImageOff } from '@lucide/vue'

// Image availability for dense views (calendar, lists): never loads the images.
// compact = icon only, and nothing at all when there's no image (tiny chips).
const props = defineProps<{ count?: number; compact?: boolean }>()
const { t } = useLocale()
const n = computed(() => props.count ?? 0)
const label = computed(() => (n.value === 0 ? t('images.none') : n.value === 1 ? t('images.one') : t('images.count', { n: n.value })))
</script>

<template>
  <span v-if="n > 0" class="inline-flex shrink-0 items-center gap-0.5 text-[0.6875rem] font-semibold text-sky-700 dark:text-sky" :title="label" :aria-label="label">
    <Camera class="size-3.5" /><span v-if="!compact || n > 1">{{ n }}</span>
  </span>
  <span v-else-if="!compact" class="inline-flex shrink-0 items-center gap-0.5 text-[0.6875rem] text-muted/70" :title="label"><ImageOff class="size-3.5" /><span class="max-sm:sr-only">{{ label }}</span></span>
</template>
