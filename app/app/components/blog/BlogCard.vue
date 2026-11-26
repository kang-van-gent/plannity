<script setup lang="ts">
import { ArrowUpRight, Clock } from '@lucide/vue'
import type { BlogPostSummary } from '#shared/types/blog'

const props = withDefaults(defineProps<{ post: BlogPostSummary; featured?: boolean }>(), { featured: false })
const { t, locale } = useLocale()
const date = computed(() => formatDateTime(props.post.publishedAt, locale.value, { day: 'numeric', month: 'short', year: 'numeric' }))
</script>

<template>
  <NuxtLink :to="`/blog/${encodeURIComponent(post.slug)}`"
    class="group card flex h-full overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-pop focus-visible:-translate-y-1"
    :class="featured ? 'flex-col lg:grid lg:grid-cols-[1.15fr_1fr]' : 'flex-col'">
    <div class="relative shrink-0 overflow-hidden bg-surface-2" :class="featured ? 'aspect-[16/9] lg:aspect-auto lg:min-h-[22rem]' : 'aspect-[16/9]'">
      <div class="size-full transition duration-500 group-hover:scale-[1.04]"><BlogCover :cover="post.cover" :slug="post.slug" :eager="featured" /></div>
      <span v-if="post.category" class="absolute left-3 top-3 rounded-full bg-surface/90 px-3 py-1 text-xs font-bold text-fg shadow-soft backdrop-blur">{{ post.category }}</span>
    </div>
    <div class="flex flex-1 flex-col" :class="featured ? 'p-6 sm:p-8 lg:justify-center' : 'p-5'">
      <p class="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-muted">
        <time :datetime="post.publishedAt">{{ date }}</time><span aria-hidden="true">·</span>
        <span class="inline-flex items-center gap-1"><Clock class="size-3.5" />{{ t('blog.minRead', { n: post.minutes }) }}</span>
      </p>
      <h2 class="mt-2 font-display font-bold leading-snug transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-300"
        :class="featured ? 'text-2xl sm:text-4xl' : 'line-clamp-2 text-xl'">{{ post.title }}</h2>
      <p class="mt-2 text-muted" :class="featured ? 'line-clamp-3 sm:text-lg' : 'line-clamp-3 text-sm'">{{ post.excerpt }}</p>
      <span class="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-brand-600 dark:text-brand-300">
        {{ t('blog.readMore') }}<ArrowUpRight class="size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </div>
  </NuxtLink>
</template>
