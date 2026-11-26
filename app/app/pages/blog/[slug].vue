<script setup lang="ts">
import { ArrowLeft, ArrowRight, Clock, Info, Link2, Newspaper } from '@lucide/vue'
import type { BlogPostResponse } from '#shared/types/blog'

const { t, locale } = useLocale()
const route = useRoute()
const notify = useNotify()
const config = useRuntimeConfig()
const slug = computed(() => String(route.params.slug ?? ''))

const { data, error, status, refresh } = await useFetch<BlogPostResponse>(() => `/api/blog/${encodeURIComponent(slug.value)}`, { key: `blog-${slug.value}` })
const post = computed(() => data.value?.data ?? null)
const notFound = computed(() => !post.value && error.value?.statusCode === 404)

// A missing post answers 404 (not 200), so search engines drop it.
if (import.meta.server && notFound.value) {
  const event = useRequestEvent()
  if (event) setResponseStatus(event, 404)
}

const date = computed(() => (post.value ? formatDateTime(post.value.publishedAt, locale.value, { day: 'numeric', month: 'long', year: 'numeric' }) : ''))
const url = computed(() => `${String(config.public.siteUrl).replace(/\/$/, '')}/blog/${encodeURIComponent(slug.value)}`)

useSeoMeta({
  title: () => post.value?.seoTitle || post.value?.title || t('blog.notFound'),
  description: () => post.value?.seoDescription || post.value?.excerpt || '',
  ogTitle: () => post.value?.seoTitle || post.value?.title || '',
  ogDescription: () => post.value?.seoDescription || post.value?.excerpt || '',
  ogType: 'article',
  ogUrl: () => url.value,
  ogImage: () => post.value?.cover?.url,
  twitterCard: () => (post.value?.cover ? 'summary_large_image' : 'summary'),
  articlePublishedTime: () => post.value?.publishedAt,
  articleAuthor: () => (post.value ? [post.value.author] : []),
  robots: () => (notFound.value ? 'noindex' : undefined),
})
useHead({ link: () => (post.value ? [{ rel: 'canonical', href: url.value }] : []) })

async function copyLink() {
  try { await navigator.clipboard.writeText(url.value); notify.success(t('blog.linkCopied')) } catch { /* the address bar still works */ }
}

// Reading progress across the article body.
const article = ref<HTMLElement | null>(null)
const progress = ref(0)
function onScroll() {
  const el = article.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const total = r.height - window.innerHeight * 0.6
  progress.value = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1
}
onMounted(() => { onScroll(); window.addEventListener('scroll', onScroll, { passive: true }) })
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="px-5 pb-10 pt-8 sm:px-8 sm:pt-12">
    <div v-if="post" class="fixed inset-x-0 top-0 z-[60] h-1 origin-left bg-gradient-to-r from-brand-500 via-pink to-sun" :style="{ transform: `scaleX(${progress})` }" aria-hidden="true" />

    <!-- Not found -->
    <div v-if="notFound" class="mx-auto max-w-xl py-16 text-center">
      <ResultIcon type="warning" :size="72" class="mx-auto" />
      <h1 class="mt-4 font-display text-3xl font-bold">{{ t('blog.notFound') }}</h1>
      <p class="mt-2 text-muted">{{ t('blog.notFoundBody') }}</p>
      <NuxtLink to="/blog" class="btn-primary mt-6"><ArrowLeft class="size-4" />{{ t('blog.allPosts') }}</NuxtLink>
    </div>

    <UiErrorState v-else-if="error && !post" class="mx-auto max-w-xl" :error="error as any" @retry="refresh()" />

    <div v-else-if="status === 'pending' && !post" class="mx-auto max-w-3xl space-y-4" aria-hidden="true">
      <div class="skeleton h-4 w-24" /><div class="skeleton h-12 w-full" /><div class="skeleton h-12 w-2/3" /><div class="skeleton mt-8 aspect-[16/9] w-full rounded-3xl" />
    </div>

    <template v-else-if="post">
      <article ref="article">
        <header class="mx-auto max-w-3xl">
          <p v-if="data?.sample" class="mt-4 flex items-start gap-2 rounded-2xl border border-dashed border-sun bg-sun/10 px-4 py-3 text-sm">
            <Info class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-sun" /><span>{{ t('blog.sampleNote') }}</span>
          </p>
          <span v-if="post.category" v-anim="1" class="eyebrow mt-6">{{ post.category }}</span>
          <h1 v-anim="2" class="mt-4 font-display text-4xl font-bold leading-[1.12] sm:text-5xl">{{ post.title }}</h1>
          <p v-if="post.excerpt" v-anim="3" class="mt-4 text-lg text-muted sm:text-xl">{{ post.excerpt }}</p>
          <div v-anim="4" class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-4 text-sm">
            <span class="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pink font-display text-xs font-bold text-white">{{ [...post.author][0]?.toUpperCase() }}</span>
            <span class="font-semibold">{{ post.author }}</span>
            <span class="text-muted"><time :datetime="post.publishedAt">{{ date }}</time></span>
            <span class="inline-flex items-center gap-1 text-muted"><Clock class="size-4" />{{ t('blog.minRead', { n: post.minutes }) }}</span>
            <button type="button" class="btn-ghost btn-sm ml-auto" @click="copyLink"><Link2 class="size-4" />{{ t('blog.copyLink') }}</button>
          </div>
        </header>

        <div v-if="post.cover" v-anim="{ from: 'pop' }" class="mx-auto mt-8 max-w-5xl overflow-hidden rounded-[2rem] border border-line bg-surface-2">
          <BlogCover :cover="post.cover" :slug="post.slug" eager />
        </div>

        <BlogBlocks :blocks="post.content" class="mx-auto mt-8 max-w-3xl" />
      </article>

      <!-- CTA -->
      <aside class="relative mx-auto mt-14 max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-500 to-pink p-7 text-white sm:p-9">
        <Doodle variant="petal" class="absolute -right-8 -top-8 size-40 text-white/15" />
        <p class="relative font-display text-2xl font-bold sm:text-3xl">{{ t('blog.ctaTitle') }}</p>
        <p class="relative mt-2 max-w-lg text-white/85">{{ t('blog.ctaBody') }}</p>
        <NuxtLink to="/register" class="relative mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-brand-600 transition hover:-translate-y-0.5">{{ t('landing.hero.cta') }}<ArrowRight class="size-4" /></NuxtLink>
      </aside>

      <!-- Keep reading -->
      <section v-if="data?.related.length" class="mx-auto mt-16 max-w-7xl">
        <div class="flex items-end justify-between gap-4">
          <h2 class="font-display text-2xl font-bold sm:text-3xl">{{ t('blog.related') }}</h2>
          <NuxtLink to="/blog" class="inline-flex items-center gap-1 text-sm font-bold text-brand-600 dark:text-brand-300"><Newspaper class="size-4" />{{ t('blog.allPosts') }}</NuxtLink>
        </div>
        <div class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <BlogCard v-for="(p, i) in data.related" :key="p.id" v-anim="i" :post="p" />
        </div>
      </section>
    </template>
  </div>
</template>
