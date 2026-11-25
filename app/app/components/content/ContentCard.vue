<script setup lang="ts">
import { CalendarDays, Sparkles } from '@lucide/vue'
import type { Content } from '~/types'

const props = defineProps<{ content: Content; layout?: 'grid' | 'row' }>()
const { t, locale } = useLocale()
const brands = useBrands()
const brand = computed(() => brands.byId(props.content.brandId))
const date = computed(() => props.content.scheduledDate ?? props.content.suggestedDate)
</script>

<template>
  <NuxtLink v-if="layout !== 'row'" :to="`/app/content/${content.id}`" class="card pressable group relative flex flex-col overflow-hidden hover:-translate-y-1 hover:shadow-pop">
    <span class="h-1.5 w-full" :style="{ background: brand?.color ?? '#6C4CF5' }" />
    <div class="flex flex-1 flex-col p-4">
      <div class="flex items-center gap-2">
        <UiPlatformBadge :platform="content.platform" />
        <span class="chip bg-surface-2 py-0.5 text-muted">{{ t(`formats.${content.format}`) }}</span>
        <Sparkles v-if="content.source === 'ai'" class="size-3.5 text-sun" :aria-label="t('content.aiMade')" />
        <UiStatusBadge :status="content.status" small class="ml-auto" />
      </div>
      <p class="mt-3 line-clamp-2 font-display text-[17px] font-semibold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-300">{{ content.title }}</p>
      <p class="mt-1.5 line-clamp-2 text-sm text-muted">{{ content.hook || content.caption }}</p>
      <div class="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
        <UiBrandDot :name="brand?.name" :color="brand?.color" :size="18" />
        <span class="min-w-0 flex-1 truncate">{{ brand?.name }}</span>
        <span class="chip bg-pink/10 py-0.5 text-pink">{{ content.pillar }}</span>
      </div>
      <p class="mt-2 flex items-center gap-1.5 text-xs" :class="content.scheduledDate ? 'font-semibold text-fg' : 'text-muted'">
        <CalendarDays class="size-3.5" />
        <template v-if="content.scheduledDate">{{ formatDate(content.scheduledDate, locale) }}<span v-if="content.scheduledTime"> · {{ content.scheduledTime }}</span></template>
        <template v-else>{{ t('content.unscheduled') }}<span v-if="date"> · {{ t('content.suggested') }} {{ formatDate(date, locale, { day: 'numeric', month: 'short' }) }}</span></template>
      </p>
    </div>
  </NuxtLink>
  <NuxtLink v-else :to="`/app/content/${content.id}`" class="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2 active:bg-surface-2 sm:py-3 sm:grid-cols-[auto_1fr_8rem_7rem_7rem]">
    <UiPlatformBadge :platform="content.platform" />
    <div class="min-w-0">
      <p class="truncate font-semibold">{{ content.title }}</p>
      <p class="truncate text-xs text-muted">{{ brand?.name }} · {{ content.pillar }} · {{ t(`formats.${content.format}`) }}</p>
    </div>
    <span class="hidden text-sm sm:block" :class="content.scheduledDate ? '' : 'text-muted'">{{ content.scheduledDate ? formatDate(content.scheduledDate, locale, { day: 'numeric', month: 'short' }) : t('content.unscheduled') }}</span>
    <span class="hidden text-xs text-muted sm:block">{{ relativeTime(content.updatedAt, locale) }}</span>
    <UiStatusBadge :status="content.status" small />
  </NuxtLink>
</template>
