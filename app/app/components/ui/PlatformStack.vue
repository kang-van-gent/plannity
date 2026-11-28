<script setup lang="ts">
import type { Content } from '~/types'

/** Every platform a post goes to; a green dot marks the ones already posted. */
const props = withDefaults(defineProps<{ content: Pick<Content, 'platform' | 'destinations' | 'status'>; size?: 'xs' | 'sm'; max?: number; withProgress?: boolean }>(), { size: 'sm', max: 4, withProgress: false })
const { t } = useLocale()
const items = computed(() => (props.content.destinations?.length
  ? props.content.destinations.map((d) => ({ platform: d.platform, posted: d.status === 'published' }))
  : [{ platform: props.content.platform, posted: props.content.status === 'published' }]))
const shown = computed(() => items.value.slice(0, props.max))
const more = computed(() => items.value.length - shown.value.length)
const progress = computed(() => publishProgress(props.content))
const label = computed(() => items.value.map((i) => `${PLATFORM_META[i.platform].label}${i.posted ? ` (${t('publishing.posted')})` : ''}`).join(', '))
</script>

<template>
  <span class="inline-flex items-center gap-1" :title="label">
    <span v-for="i in shown" :key="i.platform" class="relative inline-flex" aria-hidden="true">
      <UiPlatformBadge :platform="i.platform" :size="size" />
      <span v-if="i.posted && items.length > 1" class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success ring-2 ring-surface" aria-hidden="true" />
    </span>
    <span v-if="more > 0" class="text-[0.625rem] font-semibold text-muted">+{{ more }}</span>
    <span v-if="withProgress && progress.total > 1" class="ml-0.5 text-[0.6875rem] font-medium text-muted">{{ t('publishing.progress', { done: progress.done, total: progress.total }) }}</span>
    <span class="sr-only">{{ label }}</span>
  </span>
</template>
