<script setup lang="ts">
import { ArrowLeft, CalendarPlus, Ban, CircleX, FileText, LoaderCircle, Undo2, WandSparkles } from '@lucide/vue'
import { gsap } from 'gsap'
import type { Content, GenerationJob } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const { refresh: refreshWallet } = useWallet()
const route = useRoute()
const id = computed(() => String(route.params.id))

const job = ref<GenerationJob | null>(null)
const error = ref<unknown>(null)
const contents = reactive<Record<string, Content>>({})
const TERMINAL = ['completed', 'partial', 'failed', 'cancelled']
const isActive = computed(() => !!job.value && !TERMINAL.includes(job.value.status))
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false
let wasActive = false
useSeoMeta({ title: () => t('jobs.title') })

async function poll() {
  try {
    const j = await api.generation.get(id.value)
    error.value = null
    if (TERMINAL.includes(j.status) && wasActive) announce(j)
    wasActive = !TERMINAL.includes(j.status)
    job.value = j
    for (const it of j.items) {
      if (it.contentId && !contents[it.contentId]) api.contents.get(it.contentId).then((c) => { contents[c.id] = c; selected[c.id] ??= true; dates[c.id] ??= c.suggestedDate ?? '' }).catch(() => {})
    }
  } catch (e) {
    error.value = e
    if (!job.value) return
  }
  // Poll every 2 s while active (spec §18: 2–5 s), stop on terminal state.
  if (!stopped && (!job.value || isActive.value)) timer = setTimeout(poll, 2000)
}

function announce(j: GenerationJob) {
  refreshWallet()
  const released = j.failedCount + j.cancelledCount
  if (j.status === 'completed') notify.success(t('jobs.doneTitle'), t('jobs.doneBody', { n: j.completedCount }))
  else if (j.status === 'partial') notify.warning(t('jobs.partialTitle'), t('jobs.partialBody', { ok: j.completedCount, failed: j.failedCount, n: released }))
  else if (j.status === 'failed') notify.error(t('jobs.failedTitle'), t('jobs.failedBody', { n: released }))
}

onMounted(poll)
onBeforeUnmount(() => { stopped = true; clearTimeout(timer) })

const processed = computed(() => job.value ? job.value.completedCount + job.value.failedCount + job.value.cancelledCount : 0)
const pct = computed(() => job.value ? Math.round((processed.value / job.value.requestedCount) * 100) : 0)
const ring = ref<SVGCircleElement | null>(null)
const C = 2 * Math.PI * 52
watch(pct, (v) => {
  if (!ring.value) return
  const offset = C * (1 - v / 100)
  if (prefersReducedMotion()) ring.value.style.strokeDashoffset = String(offset)
  else gsap.to(ring.value, { strokeDashoffset: offset, duration: 0.8, ease: 'power2.out' })
}, { flush: 'post' })

async function cancel() {
  if (!job.value) return
  const pending = job.value.requestedCount - processed.value
  const ok = await notify.confirm({
    title: t('jobs.cancelConfirm'), message: t('jobs.cancelConfirmBody'), tone: 'danger', confirmLabel: t('jobs.cancelJob'), cancelLabel: t('jobs.keepRunning'),
    details: [{ label: t('jobs.pendingItems'), value: String(pending) }, { label: t('jobs.creditsBack'), value: `+${pending}`, emphasis: true }],
  })
  if (!ok) return
  try {
    const j = await api.generation.cancel(job.value.id)
    job.value = j
    wasActive = false
    refreshWallet()
    notify.cancel(t('jobs.cancelledTitle'), t('jobs.cancelledBody', { n: j.cancelledCount }))
  } catch (e) {
    notify.fromError(e)
  }
}

// Step 5: put results on the calendar or keep them as drafts.
const selected = reactive<Record<string, boolean>>({})
const dates = reactive<Record<string, string>>({})
const saving = ref(false)
const done = computed(() => job.value?.items.filter((i) => i.contentId && contents[i.contentId]).map((i) => contents[i.contentId!]!) ?? [])
const chosen = computed(() => done.value.filter((c) => selected[c.id]))

async function saveToCalendar() {
  const bad = chosen.value.find((c) => !isValidISODate(dates[c.id]))
  if (bad) { notify.warning(t('jobs.needDates'), bad.title); return }
  saving.value = true
  let ok = 0
  const failed: string[] = []
  for (const c of chosen.value) {
    try {
      contents[c.id] = await api.contents.update(c.id, { version: c.version, scheduledDate: dates[c.id] })
      ok++
    } catch {
      failed.push(c.title)
    }
  }
  saving.value = false
  if (failed.length) notify.warning(t('jobs.savePartial', { ok, failed: failed.length }), failed.join(', '), { action: { label: t('common.retry'), handler: saveToCalendar } })
  else notify.success(t('jobs.savedToCalendar', { n: ok }), t('jobs.savedToCalendarBody'), { action: { label: t('nav.calendar'), handler: () => navigateTo('/app/calendar') } })
}

function keepDrafts() {
  notify.info(t('jobs.keptDrafts'), t('jobs.keptDraftsBody'))
  navigateTo('/app/content')
}
</script>

<template>
  <div>
    <NuxtLink to="/app/generate" class="btn-ghost btn-sm mb-4 -ml-2"><ArrowLeft class="size-4" />{{ t('nav.generate') }}</NuxtLink>
    <UiErrorState v-if="error && !job" :error="toApiError(error)" @retry="poll" />
    <UiSkeletonList v-else-if="!job" :rows="3" />
    <template v-else>
      <UiPageHeader :title="t('jobs.title')" :subtitle="`${job.brandName} · ${formatDateTime(job.createdAt, locale)}`">
        <UiJobStatus :status="job.status" />
        <button v-if="isActive" type="button" class="btn-secondary" @click="cancel"><Ban class="size-4" />{{ t('jobs.cancelJob') }}</button>
        <NuxtLink v-else to="/app/generate" class="btn-primary"><WandSparkles class="size-4" />{{ t('jobs.newJob') }}</NuxtLink>
      </UiPageHeader>

      <section v-anim class="card card-pad grid items-center gap-4 sm:gap-6 md:grid-cols-[auto_1fr]">
        <div class="relative mx-auto size-32 sm:size-36">
          <svg viewBox="0 0 120 120" class="size-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="10" class="text-surface-2" />
            <circle ref="ring" cx="60" cy="60" r="52" fill="none" stroke="url(#jobGrad)" stroke-width="10" stroke-linecap="round" :stroke-dasharray="C" :stroke-dashoffset="C" />
            <defs><linearGradient id="jobGrad" x1="0" x2="1"><stop offset="0" stop-color="#6C4CF5" /><stop offset=".6" stop-color="#FF6FAE" /><stop offset="1" stop-color="#FFB23F" /></linearGradient></defs>
          </svg>
          <div class="absolute inset-0 grid place-items-center text-center">
            <div><p class="font-display text-3xl font-bold tabular-nums">{{ pct }}%</p><p class="text-xs text-muted">{{ processed }}/{{ job.requestedCount }}</p></div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <div class="rounded-2xl bg-success/10 p-4"><p class="text-xs font-semibold text-success">{{ t('jobs.succeeded') }}</p><p class="font-display text-3xl font-bold">{{ job.completedCount }}</p></div>
          <div class="rounded-2xl bg-danger/10 p-4"><p class="text-xs font-semibold text-danger">{{ t('jobs.failed') }}</p><p class="font-display text-3xl font-bold">{{ job.failedCount }}</p></div>
          <div class="rounded-2xl bg-brand-500/10 p-4"><p class="text-xs font-semibold text-brand-600 dark:text-brand-300">{{ t('jobs.creditsUsed') }}</p><p class="font-display text-3xl font-bold">{{ job.completedCount }}</p></div>
          <div class="rounded-2xl bg-sky/15 p-4"><p class="text-xs font-semibold text-sky-700 dark:text-sky">{{ t('jobs.creditsReturned') }}</p><p class="font-display text-3xl font-bold">{{ job.failedCount + job.cancelledCount }}</p></div>
          <p v-if="isActive" class="col-span-2 flex items-center gap-2 text-sm text-muted lg:col-span-4"><LoaderCircle class="size-4 animate-spin text-brand-500" />{{ t('jobs.runningHint') }}</p>
        </div>
      </section>

      <h2 class="mb-3 mt-6 font-display text-xl font-bold sm:mt-8">{{ t('jobs.items') }}</h2>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <template v-for="it in job.items" :key="`${it.id}-${it.status}`">
          <NuxtLink v-if="it.status === 'succeeded' && it.contentId && contents[it.contentId]" v-anim="{ from: 'pop', scroll: false }" :to="`/app/content/${it.contentId}`" class="card pressable group p-4 hover:-translate-y-0.5 hover:shadow-pop">
            <div class="flex items-center gap-2 text-xs"><span class="font-bold text-muted">#{{ it.ordinal + 1 }}</span><UiPlatformBadge :platform="contents[it.contentId]!.platform" size="xs" /><span class="chip bg-surface-2 py-0.5 text-muted">{{ t(`formats.${contents[it.contentId]!.format}`) }}</span><span class="ml-auto text-muted">{{ formatDate(contents[it.contentId]!.suggestedDate, locale, { day: 'numeric', month: 'short' }) }}</span></div>
            <p class="mt-2 line-clamp-2 font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-300">{{ contents[it.contentId]!.title }}</p>
            <p class="mt-1 line-clamp-2 text-sm text-muted">{{ contents[it.contentId]!.hook }}</p>
            <p class="mt-2 text-xs font-semibold text-pink">{{ contents[it.contentId]!.pillar }}</p>
          </NuxtLink>
          <div v-else-if="it.status === 'failed'" v-anim="{ from: 'pop', scroll: false }" class="card border-danger/30 bg-danger/5 p-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-danger"><CircleX class="size-4" />#{{ it.ordinal + 1 }} {{ t('jobs.itemFailed') }}</div>
            <p class="mt-2 text-xs text-muted">{{ t(`jobs.errors.${it.errorCode}`) }} · {{ t('jobs.attempts', { n: it.attempts }) }}</p>
            <p class="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success"><Undo2 class="size-3.5" />{{ t('jobs.creditReleased') }}</p>
          </div>
          <div v-else-if="it.status === 'cancelled'" class="card p-4 opacity-60">
            <p class="flex items-center gap-2 text-sm font-semibold text-muted"><Ban class="size-4" />#{{ it.ordinal + 1 }} {{ t('jobs.status.cancelled') }}</p>
            <p class="mt-2 flex items-center gap-1.5 text-xs font-semibold text-success"><Undo2 class="size-3.5" />{{ t('jobs.creditReleased') }}</p>
          </div>
          <div v-else class="card relative overflow-hidden p-4">
            <div class="flex items-center gap-2 text-xs font-bold text-muted">#{{ it.ordinal + 1 }}
              <span v-if="it.status === 'running'" class="ml-auto flex items-center gap-1 text-brand-500"><LoaderCircle class="size-3.5 animate-spin" />{{ t('jobs.writing') }}</span>
              <span v-else class="ml-auto">{{ t('jobs.queued') }}</span>
            </div>
            <div class="skeleton mt-3 h-4 w-4/5" /><div class="skeleton mt-2 h-3 w-3/5" />
          </div>
        </template>
      </div>

      <section v-if="!isActive && done.length" v-anim class="card card-pad mt-8">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wider text-brand-500">{{ t('generate.stepNames.save') }}</p>
            <h2 class="font-display text-xl font-bold">{{ t('jobs.saveTitle') }}</h2>
            <p class="text-sm text-muted">{{ t('jobs.saveBody') }}</p>
          </div>
          <label class="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" class="size-4 accent-brand-500" :checked="chosen.length === done.length" @change="done.forEach((c) => (selected[c.id] = ($event.target as HTMLInputElement).checked))">{{ t('common.selectAll') }}</label>
        </div>
        <ul class="mt-4 divide-y divide-line">
          <li v-for="c in done" :key="c.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <input v-model="selected[c.id]" type="checkbox" class="size-4 accent-brand-500" :aria-label="c.title">
            <UiPlatformBadge :platform="c.platform" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ c.title }}</span>
            <span v-if="c.scheduledDate" class="chip bg-success/10 text-success">{{ t('jobs.onCalendar') }}</span>
            <input v-model="dates[c.id]" type="date" class="input py-1.5 max-sm:ml-7 max-sm:w-[calc(100%-1.75rem)] sm:w-40" :disabled="!selected[c.id]" :aria-label="t('content.fields.scheduledDate')">
          </li>
        </ul>
        <div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" class="btn-secondary" @click="keepDrafts"><FileText class="size-4" />{{ t('jobs.keepDrafts') }}</button>
          <button type="button" class="btn-primary" :disabled="saving || !chosen.length" @click="saveToCalendar"><CalendarPlus class="size-4" />{{ saving ? t('common.saving') : t('jobs.saveToCalendar', { n: chosen.length }) }}</button>
        </div>
      </section>
    </template>
  </div>
</template>
