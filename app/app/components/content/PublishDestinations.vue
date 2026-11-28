<script setup lang="ts">
import { AlertTriangle, CalendarClock, Check, ChevronDown, Copy, Download, ExternalLink, Eye, Hand, Link2, LoaderCircle, Lock, MoreHorizontal, RotateCcw, Send, Undo2, X, Zap } from '@lucide/vue'
import type { AutopostInfo, Brand, Content, ContentImage, ContentStatePatch, DestinationInput, Platform, PublishDestination, SocialPlatform, TikTokCreator, TikTokPostOptions } from '~/types'
import { PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

/**
 * Where the post goes (plannity-context-social-publishing.md §4). One post →
 * one destination per platform; each inherits the post's caption, images and
 * date unless it has its own.
 *
 * Connected accounts (Facebook Page, Instagram, TikTok) post by themselves:
 *   - the post's time is in the future → "Schedule" (the server posts it then);
 *   - otherwise → "Post now".
 * Every other platform (or one not connected) is posted by hand: copy the
 * caption, download the images, post, then mark it posted.
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

const { t, tm, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const { downloadAll, zipping } = useImageDownloads()
const uid = useId()

const busy = ref(false)
/** Destination ids with a Post now / Schedule request in flight. */
const working = ref(new Set<string>())
const selected = computed(() => new Set(dests.value.map((d) => d.platform)))
const progress = computed(() => ({ done: dests.value.filter((d) => d.status === 'published').length, total: dests.value.length }))

// ---- which platforms post by themselves ------------------------------------
const auto = ref<AutopostInfo | null>(null)
async function loadAuto() {
  try { auto.value = await api.destinations.autopost(props.content.id) } catch { auto.value = null }
}
onMounted(loadAuto)

type Kind = 'auto' | 'reconnect' | 'connect' | 'locked' | 'manual'
function kindOf(d: PublishDestination): Kind {
  const a = auto.value
  if (!a || !a.platforms.includes(d.platform as SocialPlatform)) return 'manual'
  if (!a.available) return 'locked'
  const acc = a.accounts[d.platform as SocialPlatform]
  if (!acc) return 'connect'
  return acc.status === 'connected' ? 'auto' : 'reconnect'
}
const accountOf = (d: PublishDestination) => auto.value?.accounts[d.platform as SocialPlatform] ?? null
const accountName = (d: PublishDestination) => { const a = accountOf(d); return a ? (a.username ? `@${a.username}` : a.displayName ?? '') : '' }
const label = (p: Platform) => PLATFORM_META[p].label

// ---- when ---------------------------------------------------------------------
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 30_000) })
/** When this platform should go live (UTC), from its own time or the post's saved date + time. */
function dueOf(d: PublishDestination): string | null {
  if (d.scheduledAt) return d.scheduledAt
  if (!props.content.scheduledDate || !props.content.scheduledTime) return null
  return bangkokToUtc(props.content.scheduledDate, props.content.scheduledTime)
}
const isFuture = (d: PublishDestination) => { const due = dueOf(d); return !!due && Date.parse(due) > now.value + 60_000 }
function whenLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const b = utcToBangkok(iso)
  return `${formatDate(b.date, locale.value, { weekday: 'short', day: 'numeric', month: 'short' })} · ${b.time}`
}
function whenFor(d: PublishDestination): string {
  if (d.scheduledAt) return whenLabel(d.scheduledAt)
  if (!props.content.scheduledDate) return t('publishing.noDate')
  return `${formatDate(props.content.scheduledDate, locale.value, { weekday: 'short', day: 'numeric', month: 'short' })}${props.content.scheduledTime ? ` · ${props.content.scheduledTime}` : ''}`
}

// ---- platform list -------------------------------------------------------------
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
    if (cur.status === 'published' || cur.status === 'publishing') { notify.warning(t('publishing.cantRemovePublished'), t('publishing.cantRemovePublishedBody')); return }
    saveList(dests.value.filter((d) => d.platform !== p).map(toInput), t('publishing.removed', { p: label(p) }))
  } else {
    saveList([...dests.value.map(toInput), { platform: p }], t('publishing.added', { p: label(p) }))
  }
}

// ---- what gets posted where ------------------------------------------------------
/** What goes out: the platform's own caption, or the post caption plus any hashtags it doesn't contain yet. */
function captionFor(d: PublishDestination): string {
  if (d.captionOverride !== null) return d.captionOverride
  const caption = props.caption.trim()
  const tags = (props.content.hashtags ?? []).filter((h) => h && !caption.includes(h))
  return [caption, tags.join(' ')].filter(Boolean).join('\n\n')
}
const imagesFor = (d: PublishDestination) => effectiveImages(d, props.images)

/** Things to fix first (platform rules we're sure of). For connected platforms they block posting. */
function warnings(d: PublishDestination): string[] {
  const out: string[] = []
  const cap = captionFor(d)
  const imgs = imagesFor(d)
  if (d.platform === 'instagram' && !imgs.length) out.push(t('publishing.warn.igNeedsImage'))
  if (d.platform === 'instagram' && imgs.length > 10) out.push(t('autopost.errors.ig_too_many_images'))
  if (d.platform === 'instagram' && cap.length > 2200) out.push(t('publishing.warn.tooLong', { n: 2200 }))
  if (d.platform === 'tiktok' && !imgs.length) out.push(t('autopost.errors.tiktok_needs_image'))
  if (d.platform === 'facebook' && !imgs.length && !cap.trim()) out.push(t('autopost.errors.empty_post'))
  if (d.platform === 'x' && cap.length > 280) out.push(t('publishing.warn.xLong'))
  if (props.content.format === 'short_video' && ['instagram', 'tiktok', 'youtube'].includes(d.platform)) out.push(t('publishing.warn.videoManual'))
  if (d.mediaOverrideIds && !imgs.length && props.images.length) out.push(t('publishing.warn.noImagesChosen'))
  return out
}
const blocked = (d: PublishDestination) => kindOf(d) === 'auto' && warnings(d).length > 0

/** A friendly reason for a failure code (platform codes fall back to the platform's own words). */
function reasonOf(code: string | null | undefined, message?: string | null): string {
  if (!code) return message || t('autopost.errors.generic')
  const known = tm<Record<string, string>>('autopost.errors')
  if (known[code]) return t(`autopost.errors.${code}`)
  if (code.startsWith('ig_container')) return t('autopost.errors.ig_container_error')
  return message || t('autopost.errors.generic')
}

async function copy(d: PublishDestination) {
  try {
    await navigator.clipboard.writeText(captionFor(d).trim())
    notify.success(t('content.copied'), label(d.platform))
  } catch {
    notify.error(t('content.copyFailed'))
  }
}

// ---- automatic posting ----------------------------------------------------------
function replaceDest(next: PublishDestination) {
  dests.value = dests.value.map((x) => (x.id === next.id ? next : x))
}
function setWorking(id: string, on: boolean) {
  const s = new Set(working.value)
  if (on) s.add(id)
  else s.delete(id)
  working.value = s
}

/** Post now / Schedule for one platform. TikTok asks its own questions first (privacy etc.). */
async function act(d: PublishDestination, mode: 'now' | 'schedule', opts?: { silent?: boolean; skipConfirm?: boolean; tiktok?: TikTokPostOptions }) {
  if (d.platform === 'tiktok' && !opts?.tiktok) return openTiktok([d], mode)
  if (mode === 'now' && !opts?.skipConfirm) {
    const ok = await notify.confirm({
      title: t('autopost.confirmTitle', { p: label(d.platform) }),
      message: t('autopost.confirmBody', { account: accountName(d) || label(d.platform), p: label(d.platform) }),
      confirmLabel: t('autopost.postNow'),
    })
    if (!ok) return false
  }
  setWorking(d.id, true)
  try {
    if (mode === 'now') {
      const r = await api.destinations.publish(d.id, opts?.tiktok)
      replaceDest(r.data)
      if (r.content) emit('content', r.content)
      const state = r.result?.state ?? (r.data.status === 'published' ? 'published' : r.data.status === 'failed' ? 'failed' : 'publishing')
      if (!opts?.silent) {
        if (state === 'published') notify.success(t('autopost.postedToast', { p: label(d.platform) }), accountName(d))
        else if (state === 'publishing') notify.info(t('autopost.postingToast', { p: label(d.platform) }), t('autopost.postingTiktokBody'))
        else notify.error(t('autopost.failedToast', { p: label(d.platform) }), reasonOf(r.result?.code ?? r.data.lastErrorCode, r.result?.message ?? r.data.lastErrorMessage))
      }
      return state !== 'failed'
    }
    const r = await api.destinations.schedule(d.id, opts?.tiktok)
    replaceDest(r.data)
    if (!opts?.silent) notify.success(t('autopost.scheduledToast', { when: whenLabel(r.data.dueAt) }), t('autopost.scheduledBody', { p: label(d.platform) }))
    return true
  } catch (e) {
    const code = isApiError(e) ? e.fieldErrors.publish : undefined
    if (code) {
      notify.error(t('autopost.failedToast', { p: label(d.platform) }), reasonOf(code, isApiError(e) ? e.message : null))
      if (code === 'not_connected' || code === 'reconnect_required' || code === 'plan_required') loadAuto()
    } else notify.fromError(e)
    refresh()
    return false
  } finally {
    setWorking(d.id, false)
  }
}

async function cancelSchedule(d: PublishDestination) {
  setWorking(d.id, true)
  try {
    const r = await api.destinations.unschedule(d.id)
    replaceDest(r.data)
    notify.info(t('autopost.unscheduledToast', { p: label(d.platform) }))
  } catch (e) {
    notify.fromError(e)
  } finally {
    setWorking(d.id, false)
  }
}

// Every connected platform that's ready to go, for "Post on all" / "Schedule all".
const ready = computed(() => dests.value.filter((d) => kindOf(d) === 'auto' && ['draft', 'failed'].includes(d.status) && !blocked(d)))
const allMode = computed<'now' | 'schedule'>(() => (ready.value.length && ready.value.every(isFuture) ? 'schedule' : 'now'))
async function actAll() {
  const list = ready.value
  if (!list.length) return
  if (allMode.value === 'now') {
    const ok = await notify.confirm({
      title: t('autopost.confirmAllTitle', { n: list.length }),
      message: t('autopost.confirmAllBody', { list: list.map((d) => label(d.platform)).join(', ') }),
      confirmLabel: t('autopost.postNow'),
    })
    if (!ok) return
  }
  const tiktokDest = list.find((d) => d.platform === 'tiktok')
  if (tiktokDest) return openTiktok(list, allMode.value)
  await runAll(list, allMode.value)
}
async function runAll(list: PublishDestination[], mode: 'now' | 'schedule', tiktok?: TikTokPostOptions) {
  let ok = 0
  for (const d of list) if (await act(d, mode, { silent: true, skipConfirm: true, tiktok: d.platform === 'tiktok' ? tiktok : undefined })) ok++
  if (!ok) return
  if (mode === 'schedule') notify.success(t('autopost.scheduledToast', { when: whenLabel(dueOf(list[0]!)) }), list.map((d) => label(d.platform)).join(', '))
  else notify.success(t('autopost.allDone', { n: ok }), list.map((d) => label(d.platform)).join(', '))
}

// ---- TikTok posting sheet (TikTok's Direct Post rules) ------------------------------
const tt = reactive({
  open: false, mode: 'now' as 'now' | 'schedule', queue: [] as PublishDestination[], loading: false, creator: null as TikTokCreator | null,
  privacy: '' as TikTokPostOptions['privacyLevel'] | '', allowComments: true, disclose: false, brandOrganic: false, brandedContent: false, error: '',
})
const privacyOptions = computed(() => (tt.creator?.privacyOptions ?? []).map((v) => ({
  value: v, label: t(`autopost.tiktok.privacyLevels.${v}`),
  disabled: tt.brandedContent && v === 'SELF_ONLY',
})))
async function openTiktok(queue: PublishDestination[], mode: 'now' | 'schedule') {
  const prev = queue.find((d) => d.platform === 'tiktok')?.options
  Object.assign(tt, {
    open: true, mode, queue, loading: true, creator: null, error: '',
    // Privacy is chosen every time (TikTok: no default); the other choices are remembered.
    privacy: '', allowComments: prev?.allowComments ?? true, disclose: !!(prev?.brandOrganic || prev?.brandedContent),
    brandOrganic: !!prev?.brandOrganic, brandedContent: !!prev?.brandedContent,
  })
  try {
    tt.creator = await api.destinations.tiktokCreator(props.content.id)
    if (tt.creator.privateOnly) tt.privacy = 'SELF_ONLY'
    if (tt.creator.commentDisabled) tt.allowComments = false
  } catch (e) {
    tt.open = false
    notify.error(t('autopost.tiktok.loadFailed'), isApiError(e) && e.fieldErrors.publish ? reasonOf(e.fieldErrors.publish, e.message) : undefined)
    loadAuto()
  } finally {
    tt.loading = false
  }
}
watch(() => tt.brandedContent, (on) => { if (on && tt.privacy === 'SELF_ONLY' && !tt.creator?.privateOnly) tt.privacy = '' })
async function confirmTiktok() {
  tt.error = ''
  if (!tt.privacy) { tt.error = t('autopost.tiktok.privacyPh'); return }
  if (tt.disclose && !tt.brandOrganic && !tt.brandedContent) { tt.error = t('autopost.tiktok.pickOne'); return }
  const options: TikTokPostOptions = {
    privacyLevel: tt.privacy, allowComments: tt.allowComments,
    brandOrganic: tt.disclose && tt.brandOrganic, brandedContent: tt.disclose && tt.brandedContent,
  }
  const queue = tt.queue
  const mode = tt.mode
  tt.open = false
  if (queue.length === 1) await act(queue[0]!, mode, { skipConfirm: true, tiktok: options })
  else await runAll(queue, mode, options)
}

// ---- keep statuses fresh while something is posting or scheduled ------------------
let poll: ReturnType<typeof setTimeout> | undefined
async function refresh() {
  try {
    const before = new Map(dests.value.map((d) => [d.id, d.status]))
    const next = await api.destinations.list(props.content.id)
    dests.value = next
    for (const d of next) {
      const was = before.get(d.id)
      if ((was === 'publishing' || was === 'scheduled') && d.status === 'published') notify.success(t('autopost.postedToast', { p: label(d.platform) }), accountName(d))
      if ((was === 'publishing' || was === 'scheduled') && d.status === 'failed') notify.error(t('autopost.failedToast', { p: label(d.platform) }), reasonOf(d.lastErrorCode, d.lastErrorMessage))
    }
  } catch { /* the next tick tries again */ }
}
function schedulePoll() {
  clearTimeout(poll)
  const posting = dests.value.some((d) => d.status === 'publishing')
  const soon = dests.value.some((d) => d.status === 'scheduled' && d.dueAt && Date.parse(d.dueAt) - now.value < 10 * 60_000)
  if (!posting && !soon) return
  poll = setTimeout(async () => { await refresh(); schedulePoll() }, posting ? 4000 : 20_000)
}
watch(dests, schedulePoll, { immediate: true, deep: true })
onBeforeUnmount(() => { clearTimeout(poll); clearInterval(clock) })

// ---- customise one platform ---------------------------------------------------------
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
  if (await saveList(dests.value.map((x) => (x.id === d.id ? next : toInput(x))), t('publishing.savedFor', { p: label(d.platform) }))) open.value = null
}

// ---- mark posted (by hand) ------------------------------------------------------------
const markFor = ref<PublishDestination | null>(null)
const markForm = reactive({ date: todayISO(), time: '', url: '' })
function openMark(d: PublishDestination) {
  const n = utcToBangkok(new Date().toISOString())
  Object.assign(markForm, { date: n.date, time: n.time, url: d.externalPostUrl ?? '' })
  markFor.value = d
}
async function setPublished(d: PublishDestination, published: boolean, input: { publishedAt?: string; postUrl?: string | null } = {}) {
  busy.value = true
  try {
    const r = await api.destinations.markPublished(d.id, { published, ...input })
    const next = dests.value.map((x) => (x.id === r.data.id ? r.data : x))
    dests.value = next
    if (r.content) emit('content', r.content)
    const p = label(d.platform)
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
  const ok = await notify.confirm({ title: t('publishing.undoConfirm', { p: label(d.platform) }), message: t('publishing.undoConfirmBody'), confirmLabel: t('publishing.undo'), tone: 'warning' })
  if (ok) await setPublished(d, false)
}

// ---- manual tools menu (connected platforms keep them one tap away) ----------------------
const toolsFor = ref<string | null>(null)

// ---- preview ---------------------------------------------------------------------------
const PREVIEWABLE: Platform[] = ['facebook', 'instagram', 'tiktok']
const previewFor = ref<PublishDestination | null>(null)

const connectedAccounts = computed(() => (auto.value ? (Object.entries(auto.value.accounts) as [SocialPlatform, NonNullable<AutopostInfo['accounts'][SocialPlatform]>][]) : []))
const channelsLink = computed(() => `/app/brands/${props.content.brandId}/channels`)
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

    <!-- Choose platforms (a lightning mark = posts automatically) -->
    <div class="mt-4 flex flex-wrap gap-2" role="group" :aria-label="t('publishing.choose')">
      <button v-for="p in PLATFORMS" :key="p" type="button" class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95"
        :class="selected.has(p) ? 'border-brand-400 bg-brand-500/10 text-fg' : 'border-line text-muted hover:bg-surface-2'"
        :aria-pressed="selected.has(p)" :disabled="!canEdit || busy" @click="toggle(p)">
        <UiPlatformBadge :platform="p" size="xs" />{{ PLATFORM_META[p].label }}
        <Zap v-if="auto?.available && auto.accounts[p as SocialPlatform]?.status === 'connected'" class="size-3 text-sun" :aria-label="t('autopost.auto')" />
        <Check v-if="selected.has(p)" class="size-3.5 text-brand-500" />
      </button>
    </div>

    <!-- Post / schedule everything that's connected and ready -->
    <div v-if="canEdit && ready.length > 1" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-brand-500/[0.07] p-3">
      <Zap class="size-4 shrink-0 text-brand-500" />
      <p class="min-w-0 flex-1 text-sm">
        <b>{{ ready.map((d) => PLATFORM_META[d.platform].label).join(' · ') }}</b>
        <span class="block text-xs text-muted">{{ allMode === 'schedule' ? whenLabel(dueOf(ready[0]!)) : t('autopost.accountsBody') }}</span>
      </p>
      <button type="button" class="btn-primary btn-sm" :disabled="working.size > 0" @click="actAll">
        <CalendarClock v-if="allMode === 'schedule'" class="size-4" /><Send v-else class="size-4" />
        {{ allMode === 'schedule' ? t('autopost.scheduleAll', { n: ready.length }) : t('autopost.postAll', { n: ready.length }) }}
      </button>
    </div>

    <!-- One card per platform -->
    <ul class="mt-4 space-y-3">
      <li v-for="d in dests" :key="d.id" class="rounded-2xl border p-3 transition-colors sm:p-4"
        :class="d.status === 'failed' ? 'border-danger/40 bg-danger/[0.03]' : d.status === 'published' ? 'border-success/30' : 'border-line'">
        <!-- Header: platform, where it posts, status -->
        <div class="flex flex-wrap items-center gap-2">
          <UiPlatformBadge :platform="d.platform" with-label />
          <span v-if="kindOf(d) === 'auto'" class="chip bg-sun/15 py-0.5 text-amber-700 dark:text-sun"><Zap class="size-3" />{{ t('autopost.auto') }} · {{ accountName(d) }}</span>
          <span v-else class="chip bg-surface-2 py-0.5 text-muted"><Hand class="size-3" />{{ t('autopost.manual') }}</span>
          <span class="flex-1" />
          <span v-if="d.status === 'published'" class="chip bg-success/15 text-success"><Check class="size-3" />{{ t('publishing.posted') }}<template v-if="d.publishedAt"> · {{ formatDateTime(d.publishedAt, locale) }}</template></span>
          <span v-else-if="d.status === 'publishing'" class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300"><LoaderCircle class="size-3 animate-spin" />{{ t('autopost.posting') }}</span>
          <span v-else-if="d.status === 'scheduled'" class="chip bg-brand-500/10 text-brand-600 dark:text-brand-300"><CalendarClock class="size-3" />{{ t('autopost.scheduledFor', { when: whenLabel(d.dueAt) }) }}</span>
          <span v-else-if="d.status === 'failed'" class="chip bg-danger/10 text-danger"><AlertTriangle class="size-3" />{{ t('autopost.failed') }}</span>
          <span v-else class="chip bg-surface-2 text-muted">{{ t('autopost.notPosted') }}</span>
          <!-- Connected platforms keep the by-hand tools in a small menu -->
          <div v-if="canEdit && kindOf(d) === 'auto' && d.status !== 'publishing'" class="relative">
            <button type="button" class="btn-icon btn-ghost !p-1.5" :aria-label="t('autopost.manualTools')" :aria-expanded="toolsFor === d.id" @click="toolsFor = toolsFor === d.id ? null : d.id"><MoreHorizontal class="size-4" /></button>
            <div v-if="toolsFor === d.id" class="absolute right-0 top-full z-20 mt-1 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-panel" @click="toolsFor = null">
              <p class="px-2.5 pb-1 pt-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-muted">{{ t('autopost.manualTools') }}</p>
              <button type="button" class="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2" @click="copy(d)"><Copy class="size-4" />{{ t('publishing.copy') }}</button>
              <button type="button" class="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-40" :disabled="!imagesFor(d).length" @click="downloadAll(content.id, imagesFor(d), `${content.title}-${d.platform}`)"><Download class="size-4" />{{ t('publishing.download', { n: imagesFor(d).length }) }}</button>
              <button v-if="d.status === 'published' && d.mode === 'manual'" type="button" class="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2" @click="undo(d)"><Undo2 class="size-4" />{{ t('publishing.undo') }}</button>
              <button v-else-if="d.status !== 'published'" type="button" class="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2" @click="openMark(d)"><Check class="size-4" />{{ t('publishing.markPosted') }}</button>
            </div>
          </div>
        </div>

        <!-- Details: when, overrides -->
        <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span v-if="d.status !== 'published' && d.status !== 'scheduled' && !(kindOf(d) === 'auto' && isFuture(d) && canEdit)">{{ whenFor(d) }}</span>
          <span v-if="d.captionOverride !== null" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.ownCaption') }}</span>
          <span v-if="d.mediaOverrideIds" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.imagesOf', { n: imagesFor(d).length, total: images.length }) }}</span>
          <span v-if="d.scheduledAt" class="chip bg-sky/15 py-0.5 text-sky-700 dark:text-sky">{{ t('publishing.ownTime') }}</span>
        </div>

        <!-- Why it failed -->
        <div v-if="d.status === 'failed'" class="mt-2 flex items-start gap-2 rounded-xl bg-danger/10 p-2.5 text-xs text-danger">
          <AlertTriangle class="mt-0.5 size-3.5 shrink-0" /><span>{{ reasonOf(d.lastErrorCode, d.lastErrorMessage) }}</span>
        </div>
        <p v-else-if="d.lastErrorCode === 'date_removed' && d.status === 'draft'" class="mt-2 text-xs text-warning">{{ t('autopost.errors.date_removed') }}</p>
        <p v-if="d.status === 'publishing' && d.platform === 'tiktok'" class="mt-2 text-xs text-muted">{{ t('autopost.tiktok.processing') }}</p>

        <ul v-if="!['published', 'publishing'].includes(d.status) && warnings(d).length" class="mt-2 space-y-0.5 text-xs text-warning">
          <li v-for="w in warnings(d)" :key="w">• {{ w }}</li>
        </ul>

        <!-- Not connected / needs reconnecting -->
        <NuxtLink v-if="canEdit && (kindOf(d) === 'connect' || kindOf(d) === 'reconnect')" :to="channelsLink"
          class="mt-2 flex items-center gap-1.5 text-xs font-semibold" :class="kindOf(d) === 'reconnect' ? 'text-warning' : 'text-brand-600 dark:text-brand-300'">
          <Link2 class="size-3.5" />{{ kindOf(d) === 'reconnect' ? t('autopost.reconnectHint', { p: PLATFORM_META[d.platform].label }) : t('autopost.connectHint', { p: PLATFORM_META[d.platform].label }) }} →
        </NuxtLink>

        <a v-if="d.externalPostUrl" :href="d.externalPostUrl" target="_blank" rel="noopener noreferrer" class="mt-2 flex items-center gap-1 truncate text-xs text-brand-600 underline dark:text-brand-300">
          <ExternalLink class="size-3 shrink-0" />{{ d.externalPostUrl }}
        </a>

        <!-- Actions -->
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <!-- Connected: post / schedule -->
          <template v-if="kindOf(d) === 'auto' && canEdit">
            <template v-if="d.status === 'draft' || d.status === 'failed'">
              <button v-if="isFuture(d)" type="button" class="btn-primary btn-sm" :disabled="working.has(d.id) || blocked(d)" @click="act(d, 'schedule')">
                <LoaderCircle v-if="working.has(d.id)" class="size-4 animate-spin" /><CalendarClock v-else class="size-4" />{{ t('autopost.schedule', { when: whenLabel(dueOf(d)) }) }}
              </button>
              <button type="button" :class="isFuture(d) ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'" :disabled="working.has(d.id) || blocked(d)" @click="act(d, 'now')">
                <LoaderCircle v-if="working.has(d.id) && !isFuture(d)" class="size-4 animate-spin" /><RotateCcw v-else-if="d.status === 'failed'" class="size-4" /><Send v-else class="size-4" />
                {{ d.status === 'failed' ? t('autopost.retry') : isFuture(d) ? t('autopost.postNowInstead') : t('autopost.postNow') }}
              </button>
            </template>
            <template v-else-if="d.status === 'scheduled'">
              <button type="button" class="btn-secondary btn-sm" :disabled="working.has(d.id)" @click="act(d, 'now')"><Send class="size-4" />{{ t('autopost.postNowInstead') }}</button>
              <button type="button" class="btn-ghost btn-sm" :disabled="working.has(d.id)" @click="cancelSchedule(d)"><X class="size-4" />{{ t('autopost.cancelSchedule') }}</button>
            </template>
            <a v-else-if="d.status === 'published' && d.externalPostUrl" :href="d.externalPostUrl" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm"><ExternalLink class="size-4" />{{ t('autopost.viewPost') }}</a>
          </template>

          <!-- Manual: copy, download, mark posted -->
          <template v-else>
            <button type="button" class="btn-secondary btn-sm" @click="copy(d)"><Copy class="size-4" />{{ t('publishing.copy') }}</button>
            <button type="button" class="btn-secondary btn-sm" :disabled="!imagesFor(d).length || zipping" @click="downloadAll(content.id, imagesFor(d), `${content.title}-${d.platform}`)">
              <Download class="size-4" />{{ imagesFor(d).length ? t('publishing.download', { n: imagesFor(d).length }) : t('publishing.noImages') }}
            </button>
          </template>

          <button v-if="PREVIEWABLE.includes(d.platform)" type="button" class="btn-ghost btn-sm" @click="previewFor = d"><Eye class="size-4" />{{ t('publishing.preview') }}</button>
          <button v-if="canEdit && d.status !== 'published' && d.status !== 'publishing'" type="button" class="btn-ghost btn-sm" :aria-expanded="open === d.id" @click="edit(d)">
            <ChevronDown class="size-4 transition" :class="open === d.id && 'rotate-180'" />{{ t('publishing.customize') }}
          </button>
          <span class="flex-1" />
          <template v-if="canEdit">
            <template v-if="kindOf(d) !== 'auto'">
              <button v-if="d.status === 'published'" type="button" class="btn-ghost btn-sm" :disabled="busy" @click="undo(d)"><Undo2 class="size-4" />{{ t('publishing.undo') }}</button>
              <button v-else type="button" class="btn-primary btn-sm" :disabled="busy" @click="openMark(d)"><Check class="size-4" />{{ t('publishing.markPosted') }}</button>
            </template>
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
                <span v-if="draft.imageIds.includes(img.id)" class="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-brand-500 text-[0.5625rem] font-bold text-white">{{ draft.imageIds.indexOf(img.id) + 1 }}</span>
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
              <UiDatePicker v-model="draft.date" :aria-label="t('content.fields.scheduledDate')" />
              <UiTimePicker v-model="draft.time" :aria-label="t('content.fields.scheduledTime')" />
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

    <p v-if="canEdit && dests.some((d) => kindOf(d) === 'auto' && d.status === 'draft' && !dueOf(d))" class="mt-3 flex items-center gap-1.5 text-xs text-muted">
      <CalendarClock class="size-3.5" />{{ t('autopost.needsTime') }}
    </p>

    <!-- Automatic posting: connected accounts, or what it takes to get them -->
    <div v-if="auto && !auto.available" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line p-3 text-sm">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300"><Lock class="size-4" /></span>
      <span class="min-w-0 flex-1"><b>{{ t('autopost.planTitle') }}</b><span class="block text-xs text-muted">{{ auto.reason === 'brand_locked' ? t('autopost.lockedBody') : t('autopost.planBody') }}</span></span>
      <NuxtLink v-if="auto.reason === 'plan_required'" to="/app/plan" class="btn-secondary btn-sm">{{ t('autopost.planCta') }}</NuxtLink>
    </div>
    <NuxtLink v-else-if="auto" :to="channelsLink" class="mt-4 flex items-center gap-3 rounded-2xl border border-line p-3 text-sm transition hover:bg-surface-2">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-sun/15 text-amber-700 dark:text-sun"><Zap class="size-4" /></span>
      <span class="min-w-0 flex-1">
        <b>{{ t('autopost.accountsTitle') }}</b>
        <span class="block truncate text-xs text-muted">
          <template v-if="connectedAccounts.length">{{ connectedAccounts.map(([p, a]) => `${PLATFORM_META[p].label} ${a.username ? '@' + a.username : a.displayName ?? ''}`).join(' · ') }}</template>
          <template v-else>{{ t('autopost.noAccounts') }}</template>
        </span>
      </span>
      <span class="chip shrink-0 bg-surface-2 py-0.5 text-muted">{{ t('autopost.manage') }} →</span>
    </NuxtLink>

    <!-- Mark posted by hand -->
    <SidePanel :open="!!markFor" size="sm" :title="markFor ? t('publishing.markPostedOn', { p: PLATFORM_META[markFor.platform].label }) : ''" :subtitle="t('content.markPublishedHint')" @close="markFor = null">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="label" :for="`${uid}-pd`">{{ t('content.publishedDate') }}</label><UiDatePicker :id="`${uid}-pd`" v-model="markForm.date" /></div>
        <div><label class="label" :for="`${uid}-pt`">{{ t('content.fields.scheduledTime') }}</label><UiTimePicker :id="`${uid}-pt`" v-model="markForm.time" /></div>
      </div>
      <div><label class="label" :for="`${uid}-pu`">{{ t('content.postUrl') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input :id="`${uid}-pu`" v-model.trim="markForm.url" type="url" class="input" placeholder="https://"></div>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="busy" @click="confirmMark">{{ t('publishing.markPosted') }}</button>
      </template>
    </SidePanel>

    <!-- TikTok posting sheet: TikTok requires these choices before every post -->
    <SidePanel :open="tt.open" size="sm" :title="tt.mode === 'schedule' ? t('autopost.tiktok.scheduleTitle') : t('autopost.tiktok.title')" @close="tt.open = false">
      <div v-if="tt.loading" class="space-y-3" aria-busy="true">
        <div class="skeleton h-16 rounded-2xl" /><div class="skeleton h-12 rounded-2xl" /><div class="skeleton h-24 rounded-2xl" />
      </div>
      <template v-else-if="tt.creator">
        <div class="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
          <img v-if="tt.creator.avatarUrl" :src="tt.creator.avatarUrl" alt="" class="size-10 rounded-full object-cover">
          <UiPlatformBadge v-else platform="tiktok" />
          <div class="min-w-0">
            <p class="text-xs text-muted">{{ t('autopost.tiktok.postingAs') }}</p>
            <p class="truncate font-semibold">{{ tt.creator.nickname }}<span v-if="tt.creator.username" class="font-normal text-muted"> · @{{ tt.creator.username }}</span></p>
          </div>
        </div>

        <div>
          <label class="label" :for="`${uid}-tt-privacy`">{{ t('autopost.tiktok.privacy') }}</label>
          <UiSelect :id="`${uid}-tt-privacy`" v-model="tt.privacy" :options="privacyOptions" :placeholder="t('autopost.tiktok.privacyPh')" :disabled="tt.creator.privateOnly" :invalid="!!tt.error && !tt.privacy" />
          <p v-if="tt.creator.privateOnly" class="hint">{{ t('autopost.tiktok.privateOnly') }}</p>
          <p v-else-if="tt.brandedContent" class="hint">{{ t('autopost.tiktok.brandedNotPrivate') }}</p>
        </div>

        <label class="flex items-center justify-between gap-3 rounded-2xl border border-line p-3 text-sm" :class="tt.creator.commentDisabled && 'opacity-60'">
          <span>{{ t('autopost.tiktok.allowComments') }}<span v-if="tt.creator.commentDisabled" class="block text-xs text-muted">{{ t('autopost.tiktok.commentsOff') }}</span></span>
          <input v-model="tt.allowComments" type="checkbox" class="size-5 accent-brand-500" :disabled="tt.creator.commentDisabled">
        </label>

        <div class="rounded-2xl border border-line p-3 text-sm">
          <label class="flex items-center justify-between gap-3">
            <span>{{ t('autopost.tiktok.disclose') }}<span class="block text-xs text-muted">{{ t('autopost.tiktok.discloseHint') }}</span></span>
            <input v-model="tt.disclose" type="checkbox" class="size-5 accent-brand-500">
          </label>
          <div v-if="tt.disclose" class="mt-3 space-y-2 border-t border-line pt-3">
            <label class="flex items-start gap-2.5">
              <input v-model="tt.brandOrganic" type="checkbox" class="mt-0.5 size-4 accent-brand-500">
              <span><b>{{ t('autopost.tiktok.yourBrand') }}</b><span class="block text-xs text-muted">{{ t('autopost.tiktok.yourBrandHint') }}</span></span>
            </label>
            <label class="flex items-start gap-2.5" :class="tt.creator.privateOnly && 'opacity-50'">
              <input v-model="tt.brandedContent" type="checkbox" class="mt-0.5 size-4 accent-brand-500" :disabled="tt.creator.privateOnly">
              <span><b>{{ t('autopost.tiktok.branded') }}</b><span class="block text-xs text-muted">{{ t('autopost.tiktok.brandedHint') }}</span></span>
            </label>
          </div>
        </div>

        <p v-if="tt.error" class="field-error">{{ tt.error }}</p>
        <p class="text-xs text-muted">
          {{ t('autopost.tiktok.consent') }}
          <template v-if="tt.disclose && tt.brandedContent">
            <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline dark:text-brand-300">{{ t('autopost.tiktok.policy') }}</a>
            {{ t('autopost.tiktok.consentAnd') }}
          </template>
          <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline dark:text-brand-300">{{ t('autopost.tiktok.music') }}</a>.
        </p>
        <p v-if="tt.mode === 'now'" class="text-xs text-muted">{{ t('autopost.tiktok.processing') }}</p>
      </template>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="tt.loading || !tt.creator" @click="confirmTiktok">
          <CalendarClock v-if="tt.mode === 'schedule'" class="size-4" /><Send v-else class="size-4" />
          {{ tt.mode === 'schedule' ? t('autopost.schedule', { when: whenLabel(dueOf(tt.queue.find((x) => x.platform === 'tiktok') ?? tt.queue[0]!)) }) : t('autopost.postNow') }}
        </button>
      </template>
    </SidePanel>

    <SidePanel :open="!!previewFor" :title="previewFor ? t('publishing.previewOn', { p: PLATFORM_META[previewFor.platform].label }) : ''" @close="previewFor = null">
      <ContentPostPreview v-if="previewFor" :key="previewFor.id" :caption="captionFor(previewFor)" :images="imagesFor(previewFor)" :brand-name="brand?.name ?? ''" :brand-color="brand?.color"
        :platform="previewFor.platform" :format="content.format" />
    </SidePanel>
  </section>
</template>
