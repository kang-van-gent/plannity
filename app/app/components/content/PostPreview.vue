<script setup lang="ts">
import { Bookmark, ChevronLeft, ChevronRight, Globe, Heart, ImageOff, MessageCircle, Music2, Send, Share2, ThumbsUp, VideoOff } from '@lucide/vue'
import type { ContentFormat, ContentImage, Platform } from '~/types'

/**
 * Approximate social preview (plannity-context-post-preview.md). Purely
 * presentational: it shows the caption and images it is given (unsaved edits
 * included), never fetches anything, never posts, and invents no engagement
 * numbers, followers or badges. Social controls inside the frame are decorative.
 */
type PreviewPlatform = 'facebook' | 'instagram' | 'tiktok'
const props = withDefaults(defineProps<{
  caption: string
  images: ContentImage[]
  brandName: string
  brandColor?: string
  platform?: Platform
  format?: ContentFormat
  unsaved?: boolean
}>(), { brandColor: '#6C4CF5', platform: 'facebook', format: 'static', unsaved: false })
const { t, tm } = useLocale()

const TABS: PreviewPlatform[] = ['facebook', 'instagram', 'tiktok']
const tab = ref<PreviewPlatform>(TABS.includes(props.platform as PreviewPlatform) ? (props.platform as PreviewPlatform) : 'facebook')
const tabEls = ref<HTMLButtonElement[]>([])
function onTabKey(e: KeyboardEvent, i: number) {
  const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!dir) return
  e.preventDefault()
  const n = (i + dir + TABS.length) % TABS.length
  tab.value = TABS[n]!
  nextTick(() => tabEls.value[n]?.focus())
}

// Carousel position is shared across platforms and clamped when images change.
const index = ref(0)
watch(() => props.images.length, (n) => { if (index.value >= n) index.value = Math.max(0, n - 1) })
const go = (d: number) => { if (props.images.length) index.value = (index.value + d + props.images.length) % props.images.length }
const current = computed(() => props.images[index.value] ?? null)

const expanded = ref(false)
watch(tab, () => { expanded.value = false })
const text = computed(() => props.caption.trim())
const longText = computed(() => text.value.length > (tab.value === 'facebook' ? 220 : 110) || text.value.split('\n').length > (tab.value === 'facebook' ? 5 : 2))
const initials = computed(() => [...props.brandName.trim()].slice(0, 1).join('').toUpperCase() || '?')
const isVideo = computed(() => props.format === 'short_video')
</script>

<template>
  <section class="card card-pad" :aria-label="t('preview.title')">
    <div class="flex flex-wrap items-start gap-2">
      <div class="min-w-0 flex-1">
        <h2 class="font-display text-lg font-bold">{{ t('preview.title') }}</h2>
        <p class="text-xs text-muted">{{ t('preview.subtitle') }}</p>
      </div>
      <span v-if="unsaved" class="chip bg-warning/15 text-xs text-amber-700 dark:text-sun">{{ t('preview.unsaved') }}</span>
    </div>

    <div class="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" :aria-label="t('preview.title')">
      <button v-for="(p, i) in TABS" :key="p" :ref="(el) => { if (el) tabEls[i] = el as HTMLButtonElement }" type="button" role="tab" :aria-selected="tab === p" :tabindex="tab === p ? 0 : -1"
        class="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition sm:text-sm" :class="tab === p ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg'"
        @click="tab = p" @keydown="onTabKey($event, i)">
        <UiPlatformBadge :platform="p" />{{ PLATFORM_META[p].label }}
      </button>
    </div>

    <!-- Phone-sized frame; everything inside is a simulation -->
    <div role="tabpanel" class="mx-auto mt-4 w-full max-w-[340px]">
      <p class="mb-2 text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">{{ t('preview.badge') }}</p>

      <!-- Facebook: caption above media -->
      <div v-if="tab === 'facebook'" class="overflow-hidden rounded-2xl border border-line bg-white text-[#050505] shadow-soft dark:bg-[#242526] dark:text-[#e4e6eb]">
        <div class="flex items-center gap-2 p-3">
          <span class="grid size-9 place-items-center rounded-full font-display text-sm font-bold text-white" :style="{ background: brandColor }">{{ initials }}</span>
          <div class="min-w-0 text-[0.8125rem] leading-tight">
            <p class="truncate font-semibold">{{ brandName }}</p>
            <p class="flex items-center gap-1 text-[0.6875rem] opacity-60">{{ t('preview.justNow') }} · <Globe class="size-3" /></p>
          </div>
        </div>
        <div class="px-3 pb-2 text-[0.875rem] leading-snug">
          <p v-if="text" class="whitespace-pre-line break-words" :class="!expanded && longText && 'line-clamp-5'">{{ text }}</p>
          <p v-else class="italic opacity-50">{{ t('preview.noCaption') }}</p>
          <button v-if="longText" type="button" class="font-semibold opacity-60 hover:underline" @click="expanded = !expanded">{{ expanded ? t('preview.less') : t('preview.more') }}</button>
        </div>
        <div v-if="!images.length" class="grid aspect-square place-items-center bg-black/5 text-sm opacity-60 dark:bg-white/5"><span class="flex flex-col items-center gap-1"><ImageOff class="size-6" />{{ t('preview.noImage') }}</span></div>
        <img v-else-if="images.length === 1" :src="images[0]!.url" :alt="images[0]!.filename" class="max-h-[420px] w-full bg-black/5 object-cover">
        <div v-else class="grid gap-0.5" :class="images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'">
          <img v-for="(img, i) in images.slice(0, images.length === 3 ? 3 : 4)" :key="img.id" :src="img.thumbnailUrl || img.url" :alt="img.filename"
            class="aspect-square w-full object-cover" :class="images.length === 3 && i === 0 ? 'row-span-2 h-full' : ''">
        </div>
        <p v-if="images.length > 4" class="bg-black/5 px-3 py-1 text-right text-xs font-semibold dark:bg-white/5">+{{ images.length - 4 }}</p>
        <!-- Decorative actions — no counts, not clickable -->
        <div class="grid grid-cols-3 border-t border-black/10 px-1 py-1 text-[0.75rem] font-semibold opacity-60 dark:border-white/10" aria-hidden="true">
          <span v-for="(a, i) in tm<string[]>('preview.fbActions')" :key="a" class="flex items-center justify-center gap-1.5 py-1.5">
            <ThumbsUp v-if="i === 0" class="size-4" /><MessageCircle v-else-if="i === 1" class="size-4" /><Share2 v-else class="size-4" />{{ a }}
          </span>
        </div>
      </div>

      <!-- Instagram: 4:5 carousel, caption below -->
      <div v-else-if="tab === 'instagram'" class="overflow-hidden rounded-2xl border border-line bg-white text-[#0f0f0f] shadow-soft dark:bg-black dark:text-white">
        <div class="flex items-center gap-2 p-2.5">
          <span class="rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px]"><span class="grid size-8 place-items-center rounded-full border-2 border-white font-display text-xs font-bold text-white dark:border-black" :style="{ background: brandColor }">{{ initials }}</span></span>
          <p class="min-w-0 truncate text-[0.8125rem] font-semibold">{{ brandName }}</p>
        </div>
        <div class="relative aspect-[4/5] bg-black/5 dark:bg-white/5">
          <img v-if="current" :src="current.url" :alt="current.filename" class="size-full object-cover">
          <span v-else class="absolute inset-0 grid place-items-center text-sm opacity-60"><span class="flex flex-col items-center gap-1"><ImageOff class="size-6" />{{ t('preview.noImage') }}</span></span>
          <template v-if="images.length > 1">
            <span class="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">{{ index + 1 }}/{{ images.length }}</span>
            <button type="button" class="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow" :aria-label="t('preview.prev')" @click="go(-1)"><ChevronLeft class="size-4" /></button>
            <button type="button" class="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black shadow" :aria-label="t('preview.next')" @click="go(1)"><ChevronRight class="size-4" /></button>
          </template>
        </div>
        <div class="flex items-center gap-3.5 px-3 pt-2.5" aria-hidden="true">
          <Heart class="size-5" /><MessageCircle class="size-5" /><Send class="size-5" />
          <span v-if="images.length > 1" class="mx-auto flex gap-1">
            <span v-for="(img, i) in images" :key="img.id" class="size-1.5 rounded-full" :class="i === index ? 'bg-[#0095f6]' : 'bg-current opacity-30'" />
          </span>
          <Bookmark class="ml-auto size-5" />
        </div>
        <div class="px-3 pb-3 pt-2 text-[0.8125rem] leading-snug">
          <p v-if="text" class="whitespace-pre-line break-words" :class="!expanded && longText && 'line-clamp-2'"><b class="mr-1">{{ brandName }}</b>{{ text }}</p>
          <p v-else class="italic opacity-50">{{ t('preview.noCaption') }}</p>
          <button v-if="longText" type="button" class="opacity-60 hover:underline" @click="expanded = !expanded">{{ expanded ? t('preview.less') : t('preview.more') }}</button>
          <p class="mt-1 text-[0.625rem] uppercase opacity-50">{{ t('preview.justNow') }}</p>
        </div>
      </div>

      <!-- TikTok: vertical 9:16 photo slideshow, caption over the image -->
      <div v-else class="relative aspect-[9/16] overflow-hidden rounded-[1.75rem] border border-line bg-black text-white shadow-soft">
        <template v-if="current">
          <img :src="current.thumbnailUrl || current.url" alt="" aria-hidden="true" class="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-xl">
          <img :src="current.url" :alt="current.filename" class="relative size-full object-contain">
        </template>
        <span v-else class="absolute inset-0 grid place-items-center text-sm opacity-70"><span class="flex flex-col items-center gap-1"><ImageOff class="size-6" />{{ t('preview.noImage') }}</span></span>
        <template v-if="images.length > 1">
          <span class="absolute inset-x-0 top-3 flex justify-center gap-1"><span v-for="(img, i) in images" :key="img.id" class="h-0.5 w-6 rounded-full" :class="i === index ? 'bg-white' : 'bg-white/35'" /></span>
          <button type="button" class="absolute inset-y-0 left-0 w-1/4" :aria-label="t('preview.prev')" @click="go(-1)" />
          <button type="button" class="absolute inset-y-0 right-12 w-1/4" :aria-label="t('preview.next')" @click="go(1)" />
        </template>
        <div class="absolute bottom-24 right-2.5 flex flex-col items-center gap-4" aria-hidden="true">
          <span class="grid size-9 place-items-center rounded-full border-2 border-white font-display text-xs font-bold" :style="{ background: brandColor }">{{ initials }}</span>
          <Heart class="size-7 drop-shadow" /><MessageCircle class="size-7 drop-shadow" /><Bookmark class="size-6 drop-shadow" /><Share2 class="size-6 drop-shadow" />
        </div>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pr-14 pt-10 text-[0.8125rem] leading-snug">
          <p class="font-semibold">{{ brandName }}</p>
          <p v-if="text" class="mt-0.5 whitespace-pre-line break-words" :class="!expanded && longText && 'line-clamp-2'">{{ text }}</p>
          <p v-else class="mt-0.5 italic opacity-60">{{ t('preview.noCaption') }}</p>
          <button v-if="longText" type="button" class="font-semibold opacity-80 hover:underline" @click="expanded = !expanded">{{ expanded ? t('preview.less') : t('preview.more') }}</button>
          <p class="mt-1.5 flex items-center gap-1 text-[0.6875rem] opacity-80" aria-hidden="true"><Music2 class="size-3" />{{ brandName }}</p>
        </div>
      </div>

      <p v-if="isVideo && tab === 'tiktok'" class="mt-2 flex items-center gap-1.5 text-xs text-muted"><VideoOff class="size-3.5 shrink-0" />{{ t('preview.videoUnavailable') }}</p>
      <p class="mt-2 text-xs text-muted">{{ t(`preview.crop.${tab}`) }} {{ t('preview.decorative') }}</p>
    </div>
  </section>
</template>
