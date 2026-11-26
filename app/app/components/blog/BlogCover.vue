<script setup lang="ts">
import type { BlogImage } from '#shared/types/blog'

// Post cover, or a colourful placeholder (picked from the slug) when the post has none.
const props = withDefaults(defineProps<{ cover: BlogImage | null; slug: string; eager?: boolean; sizes?: string }>(), { eager: false })
const PALETTE = [['#6C4CF5', '#FF6FAE'], ['#FFB23F', '#FF6FAE'], ['#62C5F4', '#6C4CF5'], ['#A7E66B', '#62C5F4']]
const colors = computed(() => PALETTE[[...props.slug].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length]!)
</script>

<template>
  <img v-if="cover" :src="cover.url" :alt="cover.alternativeText ?? ''" :width="cover.width ?? undefined" :height="cover.height ?? undefined"
    :loading="eager ? 'eager' : 'lazy'" decoding="async" class="size-full object-cover">
  <div v-else class="relative size-full overflow-hidden" :style="{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }" aria-hidden="true">
    <Doodle variant="petal" class="absolute -right-6 -top-6 size-32 text-white/25" />
    <Doodle variant="burst" class="absolute bottom-4 left-5 size-10 text-white/60" />
    <AppLogo variant="mark" class="absolute left-1/2 top-1/2 h-12 -translate-x-1/2 -translate-y-1/2 opacity-90" />
  </div>
</template>
