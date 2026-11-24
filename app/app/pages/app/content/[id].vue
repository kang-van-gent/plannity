<script setup lang="ts">
import { Archive, ArrowLeft, CalendarX2, Check, Copy, CopyPlus, History, Megaphone, MessageSquareHeart, RefreshCw, Save, Sparkles } from '@lucide/vue'
import { gsap } from 'gsap'
import type { Content, ContentFormModel, ContentRevision, ContentStatus } from '~/types'
import { CONTENT_STATUSES } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const { wallet, refresh: refreshWallet } = useWallet()
const route = useRoute()
const id = computed(() => String(route.params.id))

const content = ref<Content | null>(null)
const form = ref<ContentFormModel | null>(null)
const errors = ref<Record<string, string>>({})
const q = useQuery(async () => {
  const c = await api.contents.get(id.value)
  setContent(c)
  return c
}, { watch: [id] })
useSeoMeta({ title: () => content.value?.title ?? t('nav.library') })
onMounted(() => { brands.load().catch(() => {}); refreshWallet() })

let snapshot = ''
function setContent(c: Content) {
  content.value = c
  form.value = contentToForm(c)
  snapshot = JSON.stringify(form.value)
  errors.value = {}
}
const dirty = computed(() => !!form.value && JSON.stringify(form.value) !== snapshot)
const brand = computed(() => brands.byId(content.value?.brandId))

const saving = ref(false)
async function save(extra: Partial<Content> = {}, successTitle = t('common.saved')) {
  if (!content.value || !form.value) return false
  if (!form.value.title.trim()) { errors.value = { title: t('validation.required') }; notify.warning(t('errors.invalidInput')); return false }
  saving.value = true
  try {
    const { brandId: _b, ...input } = formToInput(form.value)
    const updated = await api.contents.update(content.value.id, { ...input, ...extra, version: content.value.version })
    setContent(updated)
    notify.success(successTitle, t('content.versionNow', { v: updated.version }))
    return true
  } catch (e) {
    if (isApiError(e)) {
      errors.value = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, t(`validation.${v}`)]))
      if (e.code === 'VERSION_CONFLICT') {
        notify.warning(t('errors.versionConflict'), t('errors.versionConflictHint'), { action: { label: t('common.reload'), handler: () => q.refresh() } })
        return false
      }
    }
    notify.fromError(e)
    return false
  } finally {
    saving.value = false
  }
}

// --- status pipeline ------------------------------------------------------
const publishOpen = ref(false)
const publishForm = reactive({ date: todayISO(), time: '', url: '' })
async function setStatus(s: ContentStatus) {
  if (!content.value || !form.value || s === content.value.status) return
  if (statusBlocker({ scheduledDate: form.value.scheduledDate || null }, s) === 'needs_date') {
    errors.value = { scheduledDate: t('validation.needs_date') }
    notify.warning(t('content.needDateTitle'), t('content.needDateBody'))
    document.querySelector<HTMLInputElement>('input[type="date"]')?.focus()
    return
  }
  if (s === 'published') {
    Object.assign(publishForm, { date: form.value.scheduledDate || todayISO(), time: form.value.scheduledTime || '', url: content.value.postUrl ?? '' })
    publishOpen.value = true
    return
  }
  await save({ status: s }, t('content.statusChanged', { s: t(`status.${s}`) }))
}
async function confirmPublished() {
  if (publishForm.url && !/^https?:\/\//i.test(publishForm.url)) { notify.warning(t('validation.invalid_url')); return }
  const ts = new Date(`${publishForm.date}T${publishForm.time || '12:00'}:00+07:00`).toISOString()
  const ok = await save({ status: 'published', publishedAt: ts, postUrl: publishForm.url || null }, t('content.markedPublished'))
  if (ok) publishOpen.value = false
}

// --- actions --------------------------------------------------------------
async function copyCaption() {
  if (!form.value) return
  try {
    await navigator.clipboard.writeText(`${form.value.caption}`.trim())
    notify.success(t('content.copied'))
  } catch {
    notify.error(t('content.copyFailed'))
  }
}

async function duplicate() {
  if (!content.value) return
  try {
    const c = await api.contents.duplicate(content.value.id)
    notify.success(t('content.duplicated'), t('content.createdFree'), { action: { label: t('common.open'), handler: () => navigateTo(`/app/content/${c.id}`) } })
  } catch (e) { notify.fromError(e) }
}

async function removeDate() {
  if (!form.value) return
  form.value.scheduledDate = ''
  form.value.scheduledTime = ''
  await save(content.value?.status === 'scheduled' ? { status: 'approved' } : {}, t('content.dateRemoved'))
}

const regenKey = useIdempotencyKey()
const regenerating = ref(false)
const cardEl = ref<HTMLElement | null>(null)
async function regenerate() {
  if (!content.value) return
  if (dirty.value) { notify.warning(t('content.saveFirst'), t('content.saveFirstBody')); return }
  const ok = await notify.confirm({
    title: t('content.regenConfirm'), message: t('content.regenConfirmBody'), confirmLabel: t('content.regenerate'),
    details: [
      { label: t('generate.creditsNeeded'), value: '1', emphasis: true },
      { label: t('credits.available'), value: String(wallet.value?.available ?? 0) },
      { label: t('content.regenKeeps'), value: `v${content.value.version}` },
    ],
  })
  if (!ok) return
  regenerating.value = true
  if (cardEl.value && !prefersReducedMotion()) gsap.to(cardEl.value, { opacity: 0.45, scale: 0.985, duration: 0.3, ease: 'power2.out', overwrite: true })
  try {
    const c = await api.contents.regenerate(content.value.id, regenKey.key.value)
    regenKey.renew()
    setContent(c)
    refreshWallet()
    notify.success(t('content.regenerated'), t('content.regeneratedBody', { v: c.version }))
  } catch (e) {
    notify.fromError(e)
  } finally {
    regenerating.value = false
    if (cardEl.value) gsap.to(cardEl.value, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out', overwrite: true, clearProps: 'transform,opacity' })
  }
}

async function archive() {
  if (!content.value) return
  const ok = await notify.confirm({ title: t('content.archiveConfirm'), message: t('content.archiveConfirmBody'), confirmLabel: t('content.archive'), tone: 'danger' })
  if (!ok) return
  try {
    await api.contents.archive(content.value.id)
    notify.success(t('content.archived'), content.value.title)
    await navigateTo('/app/content')
  } catch (e) { notify.fromError(e) }
}

// --- revisions ------------------------------------------------------------
const revOpen = ref(false)
const revisions = ref<ContentRevision[] | null>(null)
async function openRevisions() {
  revOpen.value = true
  revisions.value = null
  try { revisions.value = await api.contents.revisions(id.value) } catch (e) { notify.fromError(e); revOpen.value = false }
}
function restore(r: ContentRevision) {
  if (!form.value) return
  Object.assign(form.value, { title: r.snapshot.title, concept: r.snapshot.concept, hook: r.snapshot.hook, caption: r.snapshot.caption, cta: r.snapshot.cta, hashtags: r.snapshot.hashtags.join(' '), visualBrief: r.snapshot.visualBrief, videoScript: r.snapshot.videoScript ?? '' })
  revOpen.value = false
  notify.info(t('content.restoredDraft', { v: r.version }), t('content.restoredDraftBody'))
}

const feedbackOpen = ref(false)
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return await notify.confirm({ title: t('content.leaveConfirm'), message: t('content.leaveConfirmBody'), confirmLabel: t('content.leave'), tone: 'warning', notifyOnCancel: false })
})
</script>

<template>
  <div>
    <NuxtLink to="/app/content" class="btn-ghost btn-sm mb-4 -ml-2"><ArrowLeft class="size-4" />{{ t('nav.library') }}</NuxtLink>
    <UiErrorState v-if="q.error.value && !content" :error="q.error.value" @retry="q.refresh()" />
    <UiSkeletonList v-else-if="!content || !form" :rows="3" />
    <template v-else>
      <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div class="min-w-0 flex-1">
          <div v-anim class="flex flex-wrap items-center gap-2 text-sm">
            <UiBrandDot :name="brand?.name" :color="brand?.color" :size="22" /><span class="font-semibold">{{ brand?.name }}</span>
            <UiPlatformBadge :platform="content.platform" with-label />
            <span v-if="content.source === 'ai'" class="chip bg-sun/15 text-amber-700 dark:text-sun"><Sparkles class="size-3" />AI · v{{ content.version }}</span>
            <span v-else class="chip bg-surface-2 text-muted">{{ t('content.manual') }} · v{{ content.version }}</span>
          </div>
          <h1 v-anim="1" class="mt-2 font-display text-2xl font-bold sm:text-3xl">{{ form.title || t('content.untitled') }}</h1>
        </div>
        <div v-anim="2" class="flex flex-wrap gap-2">
          <button type="button" class="btn-secondary btn-sm" @click="copyCaption"><Copy class="size-4" />{{ t('content.copyCaption') }}</button>
          <button type="button" class="btn-secondary btn-sm" @click="duplicate"><CopyPlus class="size-4" />{{ t('content.duplicate') }}</button>
          <button type="button" class="btn-secondary btn-sm" :disabled="regenerating" @click="regenerate"><RefreshCw class="size-4" :class="regenerating && 'animate-spin'" />{{ t('content.regenerate') }} · 1</button>
          <NuxtLink :to="`/app/promote?content=${content.id}`" class="btn-secondary btn-sm"><Megaphone class="size-4" />{{ t('content.promote') }}</NuxtLink>
          <button type="button" class="btn-ghost btn-sm text-danger" @click="archive"><Archive class="size-4" />{{ t('content.archive') }}</button>
        </div>
      </div>

      <!-- Status pipeline: draft → in_review → approved → scheduled → published (user-confirmed) -->
      <div v-anim class="card mb-5 p-2">
        <div class="grid grid-cols-5 gap-1">
          <button v-for="(s, i) in CONTENT_STATUSES" :key="s" type="button" class="relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center text-[11px] font-semibold transition sm:text-sm"
            :class="content.status === s ? 'bg-brand-500 text-white shadow-pop' : CONTENT_STATUSES.indexOf(content.status) > i ? 'text-success hover:bg-surface-2' : 'text-muted hover:bg-surface-2'"
            :aria-pressed="content.status === s" :disabled="saving" @click="setStatus(s)">
            <span class="grid size-6 place-items-center rounded-full" :class="content.status === s ? 'bg-white/25' : CONTENT_STATUSES.indexOf(content.status) > i ? 'bg-success/15' : 'bg-surface-2'">
              <Check v-if="CONTENT_STATUSES.indexOf(content.status) > i" class="size-3.5" /><template v-else>{{ i + 1 }}</template>
            </span>
            {{ t(`status.${s}`) }}
          </button>
        </div>
        <p class="px-2 pb-1 pt-2 text-xs text-muted">{{ t('content.statusHint') }}</p>
      </div>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div ref="cardEl" v-anim class="card card-pad">
          <ContentForm v-model="form" :brands="brands.active.value" :errors="errors" brand-locked />
        </div>
        <aside class="space-y-4">
          <section v-anim class="card card-pad">
            <h2 class="font-display text-lg font-bold">{{ t('content.schedule') }}</h2>
            <p class="mt-2 text-sm">
              <template v-if="content.scheduledDate"><b>{{ formatDate(content.scheduledDate, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</b><span v-if="content.scheduledTime"> · {{ content.scheduledTime }} ({{ t('content.bangkok') }})</span></template>
              <span v-else class="text-muted">{{ t('content.unscheduled') }}<template v-if="content.suggestedDate"> · {{ t('content.suggested') }} {{ formatDate(content.suggestedDate, locale) }}</template></span>
            </p>
            <p v-if="content.publishedAt" class="mt-2 text-sm text-success">{{ t('content.publishedAt', { date: formatDateTime(content.publishedAt, locale) }) }}</p>
            <a v-if="content.postUrl" :href="content.postUrl" target="_blank" rel="noopener noreferrer" class="mt-1 block truncate text-sm text-brand-600 underline dark:text-brand-300">{{ content.postUrl }}</a>
            <div class="mt-3 flex flex-wrap gap-2">
              <button v-if="!content.scheduledDate && content.suggestedDate" type="button" class="btn-secondary btn-sm" @click="form.scheduledDate = content.suggestedDate!; save({}, t('content.dateAssigned'))">{{ t('content.useSuggested') }}</button>
              <button v-if="content.scheduledDate" type="button" class="btn-ghost btn-sm" @click="removeDate"><CalendarX2 class="size-4" />{{ t('content.removeDate') }}</button>
            </div>
          </section>
          <section v-if="content.rationale" v-anim class="card card-pad">
            <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Sparkles class="size-4 text-sun" />{{ t('content.why') }}</h2>
            <p class="mt-2 text-sm text-muted">{{ content.rationale }}</p>
          </section>
          <section v-anim class="card card-pad space-y-2">
            <button type="button" class="btn-secondary w-full" @click="openRevisions"><History class="size-4" />{{ t('content.revisions') }}</button>
            <button type="button" class="btn-ghost w-full" @click="feedbackOpen = true"><MessageSquareHeart class="size-4" />{{ t('content.rateThis') }}</button>
            <p class="text-xs text-muted">{{ t('content.updated', { date: formatDateTime(content.updatedAt, locale) }) }}</p>
          </section>
        </aside>
      </div>

      <!-- Sticky save bar appears when there are unsaved edits -->
      <Transition enter-active-class="transition duration-300 ease-out" enter-from-class="translate-y-full opacity-0" leave-active-class="transition duration-200 ease-in" leave-to-class="translate-y-full opacity-0">
        <div v-if="dirty" class="sticky bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-30 mt-6 flex items-center gap-3 rounded-3xl border border-brand-300 bg-surface/95 p-3 pl-5 shadow-panel backdrop-blur">
          <span class="size-2.5 animate-pulse rounded-full bg-warning" />
          <p class="flex-1 text-sm font-semibold">{{ t('content.unsaved') }}</p>
          <button type="button" class="btn-ghost btn-sm" @click="setContent(content)">{{ t('content.discard') }}</button>
          <button type="button" class="btn-primary" :disabled="saving" @click="save()"><Save class="size-4" />{{ saving ? t('common.saving') : t('common.save') }}</button>
        </div>
      </Transition>

      <SidePanel :open="publishOpen" size="sm" :title="t('content.markPublished')" :subtitle="t('content.markPublishedHint')" @close="publishOpen = false">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="pub-date">{{ t('content.publishedDate') }}</label><input id="pub-date" v-model="publishForm.date" type="date" class="input"></div>
          <div><label class="label" for="pub-time">{{ t('content.fields.scheduledTime') }}</label><input id="pub-time" v-model="publishForm.time" type="time" class="input"></div>
        </div>
        <div><label class="label" for="pub-url">{{ t('content.postUrl') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input id="pub-url" v-model.trim="publishForm.url" type="url" class="input" placeholder="https://"></div>
        <p class="rounded-2xl bg-surface-2 p-3 text-sm text-muted">{{ t('content.noAutoPost') }}</p>
        <template #footer>
          <button type="button" class="btn-secondary" @click="publishOpen = false">{{ t('common.cancel') }}</button>
          <button type="button" class="btn-primary" :disabled="saving" @click="confirmPublished">{{ t('content.markPublished') }}</button>
        </template>
      </SidePanel>

      <SidePanel :open="revOpen" :title="t('content.revisions')" :subtitle="t('content.revisionsHint')" @close="revOpen = false">
        <UiSkeletonList v-if="!revisions" :rows="3" />
        <p v-else-if="!revisions.length" class="text-sm text-muted">{{ t('content.noRevisions') }}</p>
        <article v-for="r in revisions ?? []" :key="r.id" class="rounded-2xl border border-line p-4">
          <div class="flex items-center gap-2 text-xs">
            <span class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300">v{{ r.version }}</span>
            <span class="chip bg-surface-2 text-muted">{{ t(`content.revReason.${r.reason}`) }}</span>
            <span class="ml-auto text-muted">{{ formatDateTime(r.createdAt, locale) }}</span>
          </div>
          <p class="mt-2 font-semibold">{{ r.snapshot.title }}</p>
          <p class="mt-1 line-clamp-2 text-sm text-muted">{{ r.snapshot.hook }}</p>
          <button type="button" class="btn-ghost btn-sm mt-2 -ml-2" @click="restore(r)">{{ t('content.restoreToEditor') }}</button>
        </article>
      </SidePanel>

      <AppFeedbackPanel :open="feedbackOpen" :content-id="content.id" @close="feedbackOpen = false" />
    </template>
  </div>
</template>
