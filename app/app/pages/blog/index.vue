<script setup lang="ts">
import { ArrowLeft, ArrowRight, Info, Newspaper } from '@lucide/vue'
import type { BlogListResponse } from '#shared/types/blog'

const { t } = useLocale()
const route = useRoute()
const page = computed(() => Math.max(1, Number(route.query.page) || 1))

// Server-rendered so posts are indexable; ?page=N keeps pagination crawlable too.
const { data, status, error, refresh } = await useFetch<BlogListResponse>('/api/blog', { query: { page, pageSize: 9 }, key: 'blog-list' })

const posts = computed(() => data.value?.data ?? [])
const featured = computed(() => (page.value === 1 ? posts.value[0] ?? null : null))
const rest = computed(() => (featured.value ? posts.value.slice(1) : posts.value))
const pageCount = computed(() => data.value?.meta.pageCount ?? 1)
const pageTo = (n: number) => (n <= 1 ? '/blog' : { path: '/blog', query: { page: n } })

useSeoMeta({
  title: () => (page.value > 1 ? `${t('blog.seoTitle')} — ${t('blog.page', { n: page.value })}` : t('blog.seoTitle')),
  description: () => t('blog.seoDescription'),
  ogTitle: () => t('blog.seoTitle'),
  ogDescription: () => t('blog.seoDescription'),
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-5 pb-10 pt-10 sm:px-8 sm:pt-16" data-parallax-root>
    <Doodle v-parallax="{ y: -120, rotate: 30 }" variant="petal" class="pointer-events-none absolute right-0 top-24 -z-10 size-64 text-pink/30" />
    <header class="mx-auto max-w-3xl text-center">
      <span v-anim class="eyebrow"><Newspaper class="size-3.5" />{{ t('blog.eyebrow') }}</span>
      <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold sm:text-6xl">{{ t('blog.title') }}</h1>
      <p v-anim="2" class="mx-auto mt-4 max-w-2xl text-lg text-muted">{{ t('blog.subtitle') }}</p>
    </header>

    <p v-if="data?.meta.sample" class="mx-auto mt-8 flex max-w-3xl items-start gap-2 rounded-2xl border border-dashed border-sun bg-sun/10 px-4 py-3 text-sm">
      <Info class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-sun" /><span>{{ t('blog.sampleNote') }}</span>
    </p>

    <!-- Loading (client-side page changes) -->
    <div v-if="status === 'pending' && !posts.length" class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      <div v-for="i in 6" :key="i" class="card overflow-hidden"><div class="skeleton aspect-[16/9] rounded-none" /><div class="space-y-2 p-5"><div class="skeleton h-3 w-1/3" /><div class="skeleton h-6 w-5/6" /><div class="skeleton h-4 w-full" /></div></div>
    </div>

    <UiErrorState v-else-if="error && !posts.length" class="mt-12" :error="error as any" @retry="refresh()" />

    <div v-else-if="!posts.length" class="mx-auto mt-12 max-w-xl rounded-3xl border border-dashed border-line p-10 text-center">
      <Newspaper class="mx-auto size-9 text-muted" />
      <p class="mt-3 font-display text-xl font-bold">{{ t('blog.empty') }}</p>
      <p class="mt-1 text-muted">{{ t('blog.emptyBody') }}</p>
      <NuxtLink to="/" class="btn-secondary mt-5">{{ t('blog.backHome') }}</NuxtLink>
    </div>

    <template v-else>
      <BlogCard v-if="featured" v-anim="{ from: 'pop' }" :post="featured" featured class="mt-12" />
      <div v-if="rest.length" class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <BlogCard v-for="(p, i) in rest" :key="p.id" v-anim="i % 3" :post="p" />
      </div>

      <nav v-if="pageCount > 1" class="mt-12 flex items-center justify-center gap-2" :aria-label="t('blog.pagination')">
        <NuxtLink v-if="page > 1" :to="pageTo(page - 1)" class="btn-secondary"><ArrowLeft class="size-4" />{{ t('blog.newer') }}</NuxtLink>
        <span class="px-3 text-sm font-semibold text-muted">{{ t('blog.pageOf', { n: page, total: pageCount }) }}</span>
        <NuxtLink v-if="page < pageCount" :to="pageTo(page + 1)" class="btn-secondary">{{ t('blog.older') }}<ArrowRight class="size-4" /></NuxtLink>
      </nav>
    </template>
  </div>
</template>
