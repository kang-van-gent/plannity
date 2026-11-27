<script setup lang="ts">
import { Check, ChevronDown, Copy, Download, ExternalLink, Eye, Hand, Undo2 } from '@lucide/vue'
import type { Brand, Content, ContentImage, ContentStatePatch, DestinationInput, Platform, PublishDestination } from '~/types'
import { PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

/**
 * Multi-platform planning + manual publishing (plannity-context-social-publishing.md §4).
 * One post → one destination per platform. Each inherits the post's caption,
 * images and date unless it has its own. Posting is always done by a person:
 * copy the caption, download the images, post, then mark it posted here.
 */
const props = defineProps<{
  content: Content
  /** The post's images in order (the editor's live list). */
  images: ContentImage[]
  /** The caption being edited (unsaved edits included) — what "inherit" copies. */
  caption: string
  brand?: Brand
  canEdit: boolean
}>()
const dests = defineModel<PublishDestination[]>({ required: true })
const emit = defineEmits<{ content: [patch: ContentStatePatch] }>()

const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const { downloadAll, zipping } = useImageDownloads()
const uid = useId()

const busy = ref(false)
const selected = computed(() => new Set(dests.value.map((d) => d.platform)))
const progress = computed(() => ({ done: dests.value.filter((d) => d.status === 'published').length, total: dests.value.length }))

const toInput = (d: PublishDestination): DestinationInput => ({ platform: d.platform, captionOverride: d.captionOverride, mediaOverrideIds: d.mediaOverrideIds, scheduledAt: d.scheduledAt, timezone: d.timezone })

async function saveList(list: DestinationInput[], success?: string): Promise<boolean> {
  busy.value = true
  try {
    const r = await api.destinations.replace(props.content.id, list)
    dests.value = r.data
    if (r.content) emit('content', r.content)
    if (success) notify.success(success)
    return true
  } catch (e) {
    if (isApiError(e) && e.fieldErrors.destinations === 'published_cannot_remove') notify.warning(t('publishing.cantRemovePublished'), t('publishing.cantRemovePublishedBody'))
    else notify.fromError(e)
    return false
  } finally {
    busy.value = false
  }
}

function toggle(p: Platform) {
  if (!props.canEdit || busy.value) return
  const cur = dests.value.find((d) => d.platform === p)
  if (cur) {
    if (dests.value.length === 1) { notify.info(t('publishing.needOne')); return }
    if (cur.status !== 'draft') { notify.warning(t('publishing.cantRemovePublished'), t('publishing.cantRemovePublishedBody')); return }
    saveList(dests.value.filter((d) => d.platform !== p).map(toInput), t('publishing.removed', { p: PLATFORM_META[p].label }))
  } else {
    saveList([...dests.value.map(toInput), { platform: p }], t('publishing.added', { p: PLATFORM_META[p].label }))
  }
}

// ---- what gets posted where ----------------------------------------------
const captionFor = (d: PublishDestination) => effectiveCaption(d, props.caption)
const imagesFor = (d: PublishDestination) => effectiveImages(d, props.images)
function whenFor(d: PublishDestination): string {
  if (d.scheduledAt) {
    const b = utcToBangkok(d.scheduledAt)
    return `${formatDate(b.date, locale.value, { day: 'numeric', month: 'short' })} · ${b.time}`
  }
  if (!props.content.scheduledDate) return t('publishing.noDate')
  return `${formatDate(props.content.scheduledDate, locale.value, { day: 'numeric', month: 'short' })}${props.content.scheduledTime ? ` · ${props.content.scheduledTime}` : ''}`
}

/** Things to check before posting by hand (platform rules we're sure of; advisory only). */
function warnings(d: PublishDestination): string[] {
  const out: string[] = []
  const cap = captionFor(d)
  const imgs = imagesFor(d)
  if (d.platform === 'instagram' && !imgs.length && props.content.format !== 'short_video') out.push(t('publishing.warn.igNeedsImage'))
  if (d.platform === 'instagram' && cap.length > 2200) out.push(t('publishing.warn.tooLong', { n: 2200 }))
  if (d.platform === 'x' && cap.length > 280) out.push(t('publishing.warn.xLong'))
  if (props.content.format === 'short_video' && ['instagram', 'tiktok', 'youtube'].includes(d.platform)) out.push(t('publishing.warn.videoManual'))
  if (d.mediaOverrideIds && !imgs.length && props.images.length) out.push(t('publishing.warn.noImagesChosen'))
  return out
}

async function copy(d: PublishDestination) {
  try {
    await navigator.clipboard.writeText(captionFor(d).trim())
    notify.success(t('content.copied'), PLATFORM_META[d.platform].label)
  } catch {
    notify.error(t('content.copyFailed'))
  }
}

// ---- customise one platform ---------------------------------------------
const open = ref<string | null>(null)
const draft = reactive({ ownCaption: false, caption: '', ownImages: false, imageIds: [] as string[], ownTime: false, date: '', time: '' })
function edit(d: PublishDestination) {
  if (open.value === d.id) { open.value = null; return }
  const b = utcToBangkok(d.scheduledAt)
  Object.assign(draft, {
    ownCaption: d.captionOverride !== null, caption: d.captionOverride ?? props.caption,
    ownImages: d.mediaOverrideIds !== null, imageIds: [...(d.mediaOverrideIds ?? props.images.map((i) => i.id))],
    ownTime: d.scheduledAt !== null, date: b.date || props.content.scheduledDate || '', time: b.time || props.content.scheduledTime || '',
  })
  open.value = d.id
}
function toggleImage(id: string) {
  const i = draft.imageIds.indexOf(id)
  if (i >= 0) draft.imageIds.splice(i, 1)
  else draft.imageIds = props.images.map((x) => x.id).filter((x) => x === id || draft.imageIds.includes(x)) // keep the post's order
}
async function saveOne(d: PublishDestination) {
  let scheduledAt: string | null = null
  if (draft.ownTime) {
    scheduledAt = bangkokToUtc(draft.date, draft.time)
    if (!scheduledAt) { notify.warning(t('publishing.needDate')); return }
  }
  const next: DestinationInput = {
    platform: d.platform, timezone: d.timezone,
    captionOverride: draft.ownCaption ? draft.caption : null,
    mediaOverrideIds: draft.ownImages ? [...draft.imageIds] : null,
    scheduledAt,
  }
  if (await saveList(dests.value.map((x) => (x.id === d.id ? next : toInput(x))), t('publishing.savedFor', { p: PLATFORM_META[d.platform].label }))) open.value = null
}

// ---- mark posted (manual) ------------------------------------------------
const markFor = ref<PublishDestination | null>(null)
const markForm = reactive({ date: todayISO(), time: '', url: '' })
function openMark(d: PublishDestination) {
  const now = utcToBangkok(new Date().toISOString())
  Object.assign(markForm, { date: now.date, time: now.time, url: d.externalPostUrl ?? '' })
  markFor.value = d
}
async function setPublished(d: PublishDestination, published: boolean, input: { publishedAt?: string; postUrl?: string | null } = {}) {
  busy.value = true
  try {
    const r = await api.destinations.markPublished(d.id, { published, ...input })
    const next = dests.value.map((x) => (x.id === r.data.id ? r.data : x))
    dests.value = next
    if (r.content) emit('content', r.content)
    const p = PLATFORM_META[d.platform].label
    if (!published) notify.info(t('publishing.undone', { p }))
    else if (r.content?.status === 'published') notify.success(t('publishing.allPosted'), t('publishing.allPostedBody'))
    else notify.success(t('publishing.markedPosted', { p }), t('publishing.progress', { done: next.filter((x) => x.status === 'published').length, total: next.length }))
    return true
  } catch (e) {
    if (isApiError(e) && e.fieldErrors.postUrl) notify.warning(t('validation.invalid_url'))
    else if (isApiError(e) && e.fieldErrors.publishedAt === 'in_future') notify.warning(t('publishing.inFuture'))
    else notify.fromError(e)
    return false
  } finally {
    busy.value = false
  }
}
async function confirmMark() {
  const d = markFor.value
  if (!d) return
  if (markForm.url && !/^https?:\/\/\S+$/i.test(markForm.url)) { notify.warning(t('validation.invalid_url')); return }
  const at = bangkokToUtc(markForm.date, markForm.time || '12:00')
  if (await setPublished(d, true, { publishedAt: at ?? undefined, postUrl: markForm.url || null })) markFor.value = null
}
async function undo(d: PublishDestination) {
  const ok = await notify.confirm({ title: t('publishing.undoConfirm', { p: PLATFORM_META[d.platform].label }), message: t('publishing.undoConfirmBody'), confirmLabel: t('publishing.undo'), tone: 'warning' })
  if (ok) await setPublished(d, false)
}

// ---- preview -------------------------------------------------------------
const PREVIEWABLE: Platform[] = ['facebook', 'instagram', 'tiktok']
const previewFor = ref<PublishDestination | null>(null)
</script>

<template>
  <section id="platforms" class="card card-pad scroll-mt-24">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="font-display text-lg font-bold">{{ t('publishing.title') }}</h2>
        <p class="mt-0.5 text-sm text-muted">{{ t('publishing.subtitle') }}</p>
      </div>
      <span v-if="progress.total > 1" class="chip" :class="progress.done === progress.total ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted'">
        {{ t('publishing.progress', progress) }}
      </span>
    </div>

    <!-- Choose platforms -->
    <div class="mt-4 flex flex-wrap gap-2" role="group" :aria-label="t('publishing.choose')">
      <button v-for="p in PLATFORMS" :key="p" type="button" class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95"
        :class="selected.has(p) ? 'border-brand-400 bg-brand-500/10 text-fg' : 'border-line text-muted hover:bg-surface-2'"
        :aria-pressed="selected.has(p)" :disabled="!canEdit || busy" @click="toggle(p)">
        <UiPlatformBadge :platform="p" size="xs" />{{ PLATFORM_META[p].label }}<Check v-if="selected.has(p)" class="size-3.5 text-brand-500" />
      </button>
    </div>

    <!-- One row per platform -->
    <ul class="mt-4 divide-y divide-line rounded-2xl border border-line">
      <li v-for="d in dests" :key="d.id" class="p-3 sm:p-4">
        <div class="flex flex-wrap items-center gap-2">
          <UiPlatformBadge :platform="d.platform" with-label />
          <span v-if="d.status === 'published'" class="chip bg-success/15 text-success"><Check class="size-3" />{{ t('publishing.posted') }}<template v-if="d.publishedAt"> · {{ formatDateTime(d.publishedAt, locale) }}</template></span>
          <span v-else class="chip bg-surface-2 text-muted"><Hand class="size-3" />{{ t('publishing.manualNotPosted') }}</span>
          <span class="text-xs text-muted">{{ whenFor(d) }}</span>
          <span v-if="d.captionOverride !== null" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.ownCaption') }}</span>
          <span v-if="d.mediaOverrideIds" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.imagesOf', { n: imagesFor(d).length, total: images.length }) }}</span>
          <span v-if="d.scheduledAt" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.ownTime') }}</span>
        </div>
        <ul v-if="d.status !== 'published' && warnings(d).length" class="mt-2 space-y-0.5 text-xs text-warning">
          <li v-for="w in warnings(d)" :key="w">• {{ w }}</li>
        </ul>
        <a v-if="d.externalPostUrl" :href="d.externalPostUrl" target="_blank" rel="noopener noreferrer" class="mt-1.5 flex items-center gap-1 truncate text-xs text-brand-600 underline dark:text-brand-300">
          <ExternalLink class="size-3 shrink-0" />{{ d.externalPostUrl }}
        </a>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="btn-secondary btn-sm" @click="copy(d)"><Copy class="size-4" />{{ t('publishing.copy') }}</button>
          <button type="button" class="btn-secondary btn-sm" :disabled="!imagesFor(d).length || zipping" @click="downloadAll(content.id, imagesFor(d), `${content.title}-${d.platform}`)">
            <Download class="size-4" />{{ imagesFor(d).length ? t('publishing.download', { n: imagesFor(d).length }) : t('publishing.noImages') }}
          </button>
          <button v-if="PREVIEWABLE.includes(d.platform)" type="button" class="btn-ghost btn-sm" @click="previewFor = d"><Eye class="size-4" />{{ t('publishing.preview') }}</button>
          <button v-if="canEdit" type="button" class="btn-ghost btn-sm" :aria-expanded="open === d.id" @click="edit(d)">
            <ChevronDown class="size-4 transition" :class="open === d.id && 'rotate-180'" />{{ t('publishing.customize') }}
          </button>
          <span class="flex-1" />
          <template v-if="canEdit">
            <button v-if="d.status === 'published'" type="button" class="btn-ghost btn-sm" :disabled="busy" @click="undo(d)"><Undo2 class="size-4" />{{ t('publishing.undo') }}</button>
            <button v-else type="button" class="btn-primary btn-sm" :disabled="busy" @click="openMark(d)"><Check class="size-4" />{{ t('publishing.markPosted') }}</button>
          </template>
        </div>

        <!-- Per-platform overrides -->
        <div v-if="open === d.id" class="mt-4 space-y-4 rounded-2xl bg-surface-2/60 p-3 sm:p-4">
          <fieldset>
            <legend class="label">{{ t('content.fields.caption') }}</legend>
            <div class="flex flex-wrap gap-2 text-sm">
              <label class="flex items-center gap-1.5"><input v-model="draft.ownCaption" type="radio" :value="false" :name="`${uid}-cap`">{{ t('publishing.usePostCaption') }}</label>
              <label class="flex items-center gap-1.5"><input v-model="draft.ownCaption" type="radio" :value="true" :name="`${uid}-cap`">{{ t('publishing.writeOwn', { p: PLATFORM_META[d.platform].label }) }}</label>
            </div>
            <textarea v-if="draft.ownCaption" v-model="draft.caption" class="input mt-2" rows="5" maxlength="5000" :aria-label="t('publishing.ownCaption')" />
            <p v-if="draft.ownCaption" class="hint">{{ t('publishing.chars', { n: draft.caption.length }) }}<template v-if="!draft.caption"> · {{ t('publishing.emptyCaption') }}</template></p>
          </fieldset>
          <fieldset v-if="images.length">
            <legend class="label">{{ t('publishing.images') }}</legend>
            <div class="flex flex-wrap gap-2 text-sm">
              <label class="flex items-center gap-1.5"><input v-model="draft.ownImages" type="radio" :value="false" :name="`${uid}-img`">{{ t('publishing.allImages', { n: images.length }) }}</label>
              <label class="flex items-center gap-1.5"><input v-model="draft.ownImages" type="radio" :value="true" :name="`${uid}-img`">{{ t('publishing.chooseImages') }}</label>
            </div>
            <div v-if="draft.ownImages" class="mt-2 flex flex-wrap gap-2">
              <button v-for="(img, i) in images" :key="img.id" type="button" class="relative size-16 overflow-hidden rounded-xl border-2 transition"
                :class="draft.imageIds.includes(img.id) ? 'border-brand-500' : 'border-transparent opacity-50'" :aria-pressed="draft.imageIds.includes(img.id)"
                :aria-label="t('publishing.imageN', { n: i + 1 })" @click="toggleImage(img.id)">
                <img :src="img.thumbnailUrl" alt="" class="size-full object-cover">
                <span v-if="draft.imageIds.includes(img.id)" class="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-brand-500 text-[9px] font-bold text-white">{{ draft.imageIds.indexOf(img.id) + 1 }}</span>
              </button>
            </div>
          </fieldset>
          <fieldset>
            <legend class="label">{{ t('publishing.when') }}</legend>
            <div class="flex flex-wrap gap-2 text-sm">
              <label class="flex items-center gap-1.5"><input v-model="draft.ownTime" type="radio" :value="false" :name="`${uid}-time`">{{ t('publishing.samePostTime') }}</label>
              <label class="flex items-center gap-1.5"><input v-model="draft.ownTime" type="radio" :value="true" :name="`${uid}-time`">{{ t('publishing.differentTime') }}</label>
            </div>
            <div v-if="draft.ownTime" class="mt-2 grid grid-cols-2 gap-2">
              <input v-model="draft.date" type="date" class="input" :aria-label="t('content.fields.scheduledDate')">
              <input v-model="draft.time" type="time" class="input" :aria-label="t('content.fields.scheduledTime')">
            </div>
            <p class="hint">{{ t('content.tzHint') }}</p>
          </fieldset>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost btn-sm" @click="open = null">{{ t('common.cancel') }}</button>
            <button type="button" class="btn-primary btn-sm" :disabled="busy" @click="saveOne(d)">{{ t('common.save') }}</button>
          </div>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-xs text-muted">{{ t('publishing.manualNote') }}</p>

    <SidePanel :open="!!markFor" size="sm" :title="markFor ? t('publishing.markPostedOn', { p: PLATFORM_META[markFor.platform].label }) : ''" :subtitle="t('content.markPublishedHint')" @close="markFor = null">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label" :for="`${uid}-pd`">{{ t('content.publishedDate') }}</label><input :id="`${uid}-pd`" v-model="markForm.date" type="date" class="input"></div>
        <div><label class="label" :for="`${uid}-pt`">{{ t('content.fields.scheduledTime') }}</label><input :id="`${uid}-pt`" v-model="markForm.time" type="time" class="input"></div>
      </div>
      <div><label class="label" :for="`${uid}-pu`">{{ t('content.postUrl') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input :id="`${uid}-pu`" v-model.trim="markForm.url" type="url" class="input" placeholder="https://"></div>
      <p class="rounded-2xl bg-surface-2 p-3 text-sm text-muted">{{ t('content.noAutoPost') }}</p>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="busy" @click="confirmMark">{{ t('publishing.markPosted') }}</button>
      </template>
    </SidePanel>

    <SidePanel :open="!!previewFor" :title="previewFor ? t('publishing.previewOn', { p: PLATFORM_META[previewFor.platform].label }) : ''" @close="previewFor = null">
      <ContentPostPreview v-if="previewFor" :key="previewFor.id" :caption="captionFor(previewFor)" :images="imagesFor(previewFor)" :brand-name="brand?.name ?? ''" :brand-color="brand?.color"
        :platform="previewFor.platform" :format="content.format" />
    </SidePanel>
  </section>
</template>
