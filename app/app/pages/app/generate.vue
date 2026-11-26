<script setup lang="ts">
import { AlertTriangle, ArrowLeft, ArrowRight, Coins, Eye, Heart, History, Megaphone, ShoppingBag, Sparkles, Store } from '@lucide/vue'
import type { ContentFormat, GenerationInput, Holiday, Objective, Platform } from '~/types'
import { FORMATS, OBJECTIVES, PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('nav.generate') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const { wallet, refresh: refreshWallet } = useWallet()
const route = useRoute()
const idem = useIdempotencyKey()

const today = todayISO()
const form = reactive<GenerationInput>({
  brandId: '', dateFrom: addDays(today, 1), dateTo: addDays(today, 30), objective: 'engagement', campaign: '', promotion: '',
  keyDates: [], platforms: [], count: 12, formats: ['static', 'carousel', 'short_video'], pillarMix: null, notes: '',
})
const errors = reactive<Record<string, string>>({})
const step = ref(0)
const stepEl = ref<HTMLElement | null>(null)
// Step sections animate in via v-anim: up on first load, sideways when moving between steps.
const enterFrom = ref<'up' | 'left' | 'right'>('up')
const enter = computed(() => ({ from: enterFrom.value }))
const submitting = ref(false)
const STEP_KEYS = ['brand', 'details', 'confirm', 'progress', 'save'] as const

const brand = computed(() => brands.byId(form.brandId))
const jobs = useQuery(() => api.generation.list(null))
const holidays = useQuery(() => api.calendar.holidays(form.dateFrom, form.dateTo), { watch: [() => form.dateFrom, () => form.dateTo], immediate: false })

onMounted(async () => {
  refreshWallet()
  try { await brands.load() } catch (e) { notify.fromError(e) }
  const pre = typeof route.query.brand === 'string' ? route.query.brand : brands.currentBrandId.value
  const initial = brands.active.value.find((b) => b.id === pre) ?? brands.active.value[0]
  if (initial) selectBrand(initial.id)
  holidays.refresh()
})

function selectBrand(id: string) {
  form.brandId = id
  const b = brands.byId(id)
  if (!b) return
  form.platforms = b.profile.platforms.length ? [...b.profile.platforms] : ['facebook']
  if (form.pillarMix) form.pillarMix = evenMix(b.profile.pillars)
}

function setRange(kind: 'week' | 'month' | 'nextMonth') {
  if (kind === 'week') { form.dateFrom = addDays(today, 1); form.dateTo = addDays(today, 7) }
  else if (kind === 'month') { form.dateFrom = addDays(today, 1); form.dateTo = addDays(today, 30) }
  else { const s = startOfMonth(addMonths(today, 1)); form.dateFrom = s; form.dateTo = endOfMonth(s) }
}

function toggle<T>(list: T[], v: T) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}

function evenMix(pillars: string[]): Record<string, number> {
  const base = Math.floor(100 / pillars.length)
  return Object.fromEntries(pillars.map((p, i) => [p, i === 0 ? 100 - base * (pillars.length - 1) : base]))
}
const mixOn = computed({
  get: () => !!form.pillarMix,
  set: (v: boolean) => { form.pillarMix = v && brand.value ? evenMix(brand.value.profile.pillars) : null },
})
const mixSum = computed(() => Object.values(form.pillarMix ?? {}).reduce((a, b) => a + b, 0))

const objectiveIcons: Record<Objective, typeof Eye> = { awareness: Eye, engagement: Heart, consideration: Sparkles, conversion: ShoppingBag }
const holidayLabel = (h: Holiday) => `${formatDate(h.date, locale.value, { day: 'numeric', month: 'short' })} · ${h.title[locale.value]}`

const credits = computed(() => form.count)
const available = computed(() => wallet.value?.available ?? 0)
const enough = computed(() => available.value >= credits.value)

function validate(s: number): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (s >= 0) {
    if (!form.brandId) errors.brandId = t('validation.required')
    if (!isValidISODate(form.dateFrom)) errors.dateFrom = t('validation.invalid_date')
    if (!isValidISODate(form.dateTo)) errors.dateTo = t('validation.invalid_date')
    else if (form.dateTo < form.dateFrom) errors.dateTo = t('validation.date_order')
    else if (diffDays(form.dateTo, form.dateFrom) > 92) errors.dateTo = t('validation.range_too_long')
  }
  if (s >= 1) {
    if (!Number.isInteger(form.count) || form.count < 1 || form.count > 30) errors.count = t('validation.count_range')
    if (!form.platforms.length) errors.platforms = t('validation.pick_one')
    if (!form.formats.length) errors.formats = t('validation.pick_one')
    if (form.pillarMix && mixSum.value !== 100) errors.pillarMix = t('validation.mix_100')
    if (form.notes.length > 1000) errors.notes = t('validation.too_long')
  }
  const ok = !Object.keys(errors).length
  if (!ok) notify.warning(t('errors.invalidInput'), t('errors.invalidInputHint'))
  return ok
}

async function go(to: number) {
  if (to > step.value && !validate(step.value)) return
  enterFrom.value = to > step.value ? 'right' : 'left'
  step.value = to
  await nextTick()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function submit() {
  if (!validate(1)) return
  if (!enough.value) { notify.warning(t('errors.insufficientCredits'), t('generate.needMore', { n: credits.value - available.value })); return }
  submitting.value = true
  try {
    const job = await api.generation.create(JSON.parse(JSON.stringify(form)), idem.key.value)
    idem.renew()
    refreshWallet()
    notify.success(t('generate.started'), t('generate.startedBody', { n: job.requestedCount }))
    await navigateTo(`/app/jobs/${job.id}`)
  } catch (e) {
    if (isApiError(e) && Object.keys(e.fieldErrors).length) {
      for (const [k, v] of Object.entries(e.fieldErrors)) errors[k] = t(`validation.${v}`)
      if (errors.brandId || errors.dateFrom || errors.dateTo) step.value = 0
      else if (!e.fieldErrors.count || e.code !== 'INSUFFICIENT_CREDITS') step.value = 1
    }
    notify.fromError(e, { retry: submit })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div>
    <UiPageHeader :title="t('generate.title')" :subtitle="t('generate.subtitle')" />

    <UiEmptyState v-if="brands.loaded.value && !brands.active.value.length" :icon="Store" :title="t('generate.noBrandTitle')" :message="t('generate.noBrandBody')">
      <BrandCreateButton onboarding />
    </UiEmptyState>

    <div v-else class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-w-0">
        <ol v-anim class="card mb-4 flex items-center gap-1 overflow-x-auto p-1.5 sm:mb-5 sm:gap-2 sm:p-2" :aria-label="t('generate.steps')">
          <li v-for="(s, i) in STEP_KEYS" :key="s" class="flex min-w-fit flex-1 items-center gap-2 rounded-2xl px-2.5 py-2 transition sm:px-3"
            :class="i === step ? 'bg-brand-500 text-white shadow-pop' : i < step ? 'text-success' : 'text-muted'">
            <span class="grid size-6 place-items-center rounded-full text-xs font-bold" :class="i === step ? 'bg-white/25' : i < step ? 'bg-success/15' : 'bg-surface-2'">{{ i + 1 }}</span>
            <span class="whitespace-nowrap text-xs font-semibold sm:text-sm">{{ t(`generate.stepNames.${s}`) }}</span>
          </li>
        </ol>

        <div ref="stepEl" class="space-y-5">
          <!-- STEP 1: brand + date range -->
          <template v-if="step === 0">
            <section v-anim="enter" class="card card-pad">
              <h2 class="font-display text-lg font-bold">{{ t('generate.pickBrand') }}</h2>
              <div class="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
                <button v-for="b in brands.active.value" :key="b.id" type="button" class="pressable flex items-center gap-3 rounded-2xl border-2 p-3 text-left"
                  :class="form.brandId === b.id ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="form.brandId === b.id" @click="selectBrand(b.id)">
                  <UiBrandDot :name="b.name" :color="b.color" :size="40" />
                  <span class="min-w-0 flex-1"><span class="block truncate font-semibold">{{ b.name }}</span><span class="block truncate text-xs text-muted">{{ b.profile.industry }}</span></span>
                </button>
              </div>
              <p v-if="errors.brandId" class="field-error">{{ errors.brandId }}</p>
            </section>
            <section v-anim="enter" class="card card-pad">
              <h2 class="font-display text-lg font-bold">{{ t('generate.dateRange') }}</h2>
              <div class="mt-3 h-scroll sm:flex-wrap">
                <button type="button" class="chip-toggle" @click="setRange('week')">{{ t('generate.ranges.week') }}</button>
                <button type="button" class="chip-toggle" @click="setRange('month')">{{ t('generate.ranges.month') }}</button>
                <button type="button" class="chip-toggle" @click="setRange('nextMonth')">{{ t('generate.ranges.nextMonth') }}</button>
              </div>
              <div class="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
                <div><label class="label" for="g-from">{{ t('generate.from') }}</label><input id="g-from" v-model="form.dateFrom" type="date" class="input" :class="errors.dateFrom && 'input-error'"><p v-if="errors.dateFrom" class="field-error">{{ errors.dateFrom }}</p></div>
                <div><label class="label" for="g-to">{{ t('generate.to') }}</label><input id="g-to" v-model="form.dateTo" type="date" class="input" :min="form.dateFrom" :class="errors.dateTo && 'input-error'"><p v-if="errors.dateTo" class="field-error">{{ errors.dateTo }}</p></div>
              </div>
              <p class="hint">{{ t('generate.tzHint') }}</p>
            </section>
          </template>

          <!-- STEP 2: goal + mix -->
          <template v-else-if="step === 1">
            <section v-anim="enter" class="card card-pad">
              <h2 class="font-display text-lg font-bold">{{ t('generate.objective') }}</h2>
              <div class="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                <button v-for="o in OBJECTIVES" :key="o" type="button" class="pressable rounded-2xl border-2 p-3 text-left sm:p-4"
                  :class="form.objective === o ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="form.objective === o" @click="form.objective = o">
                  <component :is="objectiveIcons[o]" class="size-5" :class="form.objective === o ? 'text-brand-500' : 'text-muted'" />
                  <p class="mt-2 font-semibold">{{ t(`objectives.${o}`) }}</p>
                  <p class="text-xs text-muted">{{ t(`objectives.${o}Hint`) }}</p>
                </button>
              </div>
            </section>

            <section v-anim="enter" class="card card-pad space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div><label class="label" for="g-camp">{{ t('generate.campaign') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input id="g-camp" v-model="form.campaign" class="input" maxlength="200" :placeholder="t('generate.campaignPh')"></div>
                <div><label class="label" for="g-promo">{{ t('generate.promotion') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input id="g-promo" v-model="form.promotion" class="input" maxlength="300" :placeholder="t('generate.promotionPh')"></div>
              </div>
              <div>
                <span class="label">{{ t('generate.keyDates') }}</span>
                <div v-if="holidays.data.value?.length" class="flex flex-wrap gap-2">
                  <button v-for="h in holidays.data.value" :key="h.id" type="button" class="chip-toggle" :aria-pressed="form.keyDates.includes(h.id)" @click="toggle(form.keyDates, h.id)">
                    {{ holidayLabel(h) }}<AlertTriangle v-if="!h.verified" class="size-3.5 text-warning" :aria-label="t('calendar.unverified')" />
                  </button>
                </div>
                <p v-else class="text-sm text-muted">{{ t('generate.noKeyDates') }}</p>
                <p class="hint">{{ t('generate.keyDatesHint') }}</p>
              </div>
            </section>

            <section v-anim="enter" class="card card-pad space-y-5">
              <div>
                <label for="g-count" class="flex items-baseline justify-between"><span class="label mb-0">{{ t('generate.count') }}</span><span class="font-display text-3xl font-bold text-brand-500">{{ form.count }}</span></label>
                <input id="g-count" v-model.number="form.count" type="range" min="1" max="30" class="mt-2 w-full accent-brand-500">
                <div class="flex justify-between text-xs text-muted"><span>1</span><span>{{ t('generate.countHint') }}</span><span>30</span></div>
                <p v-if="errors.count" class="field-error">{{ errors.count }}</p>
              </div>
              <div>
                <span class="label">{{ t('brands.fields.platforms') }}</span>
                <div class="flex flex-wrap gap-2">
                  <button v-for="p in PLATFORMS" :key="p" type="button" class="chip-toggle" :aria-pressed="form.platforms.includes(p)" @click="toggle(form.platforms, p)"><UiPlatformBadge :platform="p" size="xs" />{{ PLATFORM_META[p].label }}</button>
                </div>
                <p v-if="errors.platforms" class="field-error">{{ errors.platforms }}</p>
              </div>
              <div>
                <span class="label">{{ t('generate.formats') }}</span>
                <div class="flex flex-wrap gap-2">
                  <button v-for="f in FORMATS" :key="f" type="button" class="chip-toggle" :aria-pressed="form.formats.includes(f)" @click="toggle(form.formats, f)">{{ t(`formats.${f}`) }}</button>
                </div>
                <p v-if="errors.formats" class="field-error">{{ errors.formats }}</p>
              </div>
              <div class="rounded-2xl bg-surface-2 p-4">
                <label class="flex cursor-pointer items-center justify-between gap-3">
                  <span><span class="font-semibold">{{ t('generate.pillarMix') }}</span><span class="block text-xs text-muted">{{ t('generate.pillarMixHint') }}</span></span>
                  <input v-model="mixOn" type="checkbox" class="switch">
                </label>
                <div v-if="form.pillarMix" class="mt-4 space-y-3">
                  <div v-for="(_, p) in form.pillarMix" :key="p" class="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-3 text-sm sm:grid-cols-[8rem_1fr_3rem]">
                    <span class="truncate font-medium">{{ p }}</span>
                    <input v-model.number="form.pillarMix![p]" type="range" min="0" max="100" step="5" class="accent-brand-500" :aria-label="String(p)">
                    <span class="text-right tabular-nums">{{ form.pillarMix![p] }}%</span>
                  </div>
                  <p class="text-sm font-semibold" :class="mixSum === 100 ? 'text-success' : 'text-warning'">{{ t('generate.mixSum', { n: mixSum }) }}</p>
                  <p v-if="errors.pillarMix" class="field-error">{{ errors.pillarMix }}</p>
                </div>
              </div>
              <div>
                <label class="label" for="g-notes">{{ t('generate.notes') }}</label>
                <textarea id="g-notes" v-model="form.notes" class="input" rows="3" maxlength="1000" :placeholder="t('generate.notesPh')" />
                <p class="hint flex justify-between"><span>{{ t('generate.notesHint') }}</span><span>{{ form.notes.length }}/1000</span></p>
              </div>
            </section>
          </template>

          <!-- STEP 3: summary + credits -->
          <template v-else>
            <section v-anim="enter" class="card card-pad">
              <h2 class="font-display text-lg font-bold">{{ t('generate.summary') }}</h2>
              <dl class="mt-4 grid grid-cols-2 gap-2 text-sm sm:gap-3">
                <div class="rounded-2xl bg-surface-2 p-3"><dt class="text-muted">{{ t('generate.brand') }}</dt><dd class="mt-1 flex items-center gap-2 font-semibold"><UiBrandDot :name="brand?.name" :color="brand?.color" :size="22" />{{ brand?.name }}</dd></div>
                <div class="rounded-2xl bg-surface-2 p-3"><dt class="text-muted">{{ t('generate.dateRange') }}</dt><dd class="mt-1 font-semibold">{{ formatDate(form.dateFrom, locale) }} – {{ formatDate(form.dateTo, locale) }}</dd></div>
                <div class="rounded-2xl bg-surface-2 p-3"><dt class="text-muted">{{ t('generate.objective') }}</dt><dd class="mt-1 font-semibold">{{ t(`objectives.${form.objective}`) }}</dd></div>
                <div class="rounded-2xl bg-surface-2 p-3"><dt class="text-muted">{{ t('generate.formats') }}</dt><dd class="mt-1 font-semibold">{{ form.formats.map((f) => t(`formats.${f}`)).join(', ') }}</dd></div>
                <div class="col-span-2 rounded-2xl bg-surface-2 p-3"><dt class="text-muted">{{ t('brands.fields.platforms') }}</dt><dd class="mt-1.5 flex flex-wrap gap-2"><UiPlatformBadge v-for="p in form.platforms" :key="p" :platform="p" with-label /></dd></div>
              </dl>
            </section>
            <section v-anim="enter" class="relative overflow-hidden rounded-[1.75rem] p-5 text-white shadow-pop sm:rounded-3xl sm:p-6" :class="enough ? 'bg-gradient-to-br from-brand-500 to-brand-700' : 'bg-gradient-to-br from-warning to-pink'">
              <Doodle variant="burst" class="absolute right-5 top-4 size-10 text-white/50" />
              <div class="grid grid-cols-3 gap-3 sm:gap-4">
                <div><p class="text-xs text-white/75 sm:text-sm">{{ t('generate.creditsNeeded') }}</p><p class="font-display text-3xl font-bold sm:text-4xl">{{ credits }}</p><p class="text-xs text-white/70">≈ {{ formatTHB(credits * (wallet?.creditPriceSatang ?? 1000), locale) }}</p></div>
                <div><p class="text-xs text-white/75 sm:text-sm">{{ t('credits.available') }}</p><p class="font-display text-3xl font-bold sm:text-4xl">{{ available }}</p></div>
                <div><p class="text-xs text-white/75 sm:text-sm">{{ t('generate.after') }}</p><p class="font-display text-3xl font-bold sm:text-4xl">{{ Math.max(0, available - credits) }}</p></div>
              </div>
              <div v-if="!enough" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/15 p-3 text-sm">
                <AlertTriangle class="size-5" /><span class="flex-1">{{ t('generate.needMore', { n: credits - available }) }}</span>
                <NuxtLink to="/app/credits" class="rounded-xl bg-white px-3 py-1.5 font-bold text-ink">{{ t('credits.buy') }}</NuxtLink>
              </div>
            </section>
            <ul v-anim="enter" class="space-y-2 text-sm text-muted">
              <li v-for="(r, i) in [t('generate.rule1'), t('generate.rule2'), t('generate.rule3')]" :key="i" class="flex gap-2"><Megaphone class="mt-0.5 size-4 shrink-0 text-brand-500" />{{ r }}</li>
            </ul>
          </template>
        </div>

        <!-- Phones/tablets: sticky action bar floating above the tab bar. -->
        <div v-anim class="sticky bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-30 mt-6 flex items-center gap-2 max-lg:rounded-[1.5rem] max-lg:border max-lg:border-line max-lg:bg-surface/90 max-lg:p-2 max-lg:shadow-panel max-lg:backdrop-blur-xl lg:static lg:bottom-auto">
          <button v-if="step > 0" type="button" class="btn-secondary max-sm:px-3.5" :aria-label="t('common.back')" @click="go(step - 1)"><ArrowLeft class="size-4" /><span class="max-sm:hidden">{{ t('common.back') }}</span></button>
          <button v-if="step < 2" type="button" class="btn-primary ml-auto max-lg:flex-1" @click="go(step + 1)">{{ t('common.next') }}<ArrowRight class="size-4" /></button>
          <button v-else type="button" class="btn-primary btn-lg ml-auto max-lg:flex-1 max-sm:px-4" :disabled="submitting || !enough" @click="submit">
            <Coins class="size-5" />{{ submitting ? t('generate.reserving') : t('generate.confirm', { n: credits }) }}
          </button>
        </div>
      </div>

      <aside class="space-y-4">
        <section v-anim class="card card-pad">
          <h2 class="flex items-center gap-2 font-display text-lg font-bold"><History class="size-5 text-brand-500" />{{ t('generate.history') }}</h2>
          <UiSkeletonList v-if="!jobs.loaded.value && !jobs.error.value" :rows="2" class="mt-3" />
          <UiErrorState v-else-if="jobs.error.value" compact :error="jobs.error.value" class="mt-3" @retry="jobs.refresh()" />
          <p v-else-if="!jobs.data.value?.length" class="mt-3 text-sm text-muted">{{ t('dashboard.noJobs') }}</p>
          <ul v-else class="mt-3 space-y-2">
            <li v-for="j in jobs.data.value.slice(0, 8)" :key="j.id">
              <NuxtLink :to="`/app/jobs/${j.id}`" class="pressable block rounded-2xl border border-line p-3 text-sm hover:border-brand-300">
                <div class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate font-semibold">{{ j.brandName }}</span><UiJobStatus :status="j.status" /></div>
                <p class="mt-1 text-xs text-muted">{{ t('jobs.summaryLine', { ok: j.completedCount, total: j.requestedCount, failed: j.failedCount }) }} · {{ formatDateTime(j.createdAt, locale) }}</p>
              </NuxtLink>
            </li>
          </ul>
        </section>
        <section v-anim class="rounded-3xl border border-dashed border-line p-5 text-sm text-muted">
          <p class="font-semibold text-fg">{{ t('generate.tipTitle') }}</p>
          <p class="mt-1">{{ t('generate.tipBody') }}</p>
        </section>
      </aside>
    </div>
  </div>
</template>
