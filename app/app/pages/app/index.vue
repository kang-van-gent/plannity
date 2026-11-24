<script setup lang="ts">
import { ArrowRight, CalendarClock, CheckCircle2, Coins, FilePen, Hourglass, Plus, Rocket, Send, Store, WandSparkles } from '@lucide/vue'
import { gsap } from 'gsap'
import type { ContentStatus } from '~/types'
import { CONTENT_STATUSES } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('nav.dashboard') })
const api = useApi()
const { user } = useSession()
const brands = useBrands()
const { wallet } = useWallet()

const q = useQuery(() => api.dashboard(brands.currentBrandId.value), { watch: [brands.currentBrandId] })
watch(() => q.data.value?.wallet, (w) => { if (w) wallet.value = w })

const today = todayISO()
const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()))
const greeting = computed(() => t(hour < 12 ? 'dashboard.morning' : hour < 18 ? 'dashboard.afternoon' : 'dashboard.evening'))
const total = computed(() => CONTENT_STATUSES.reduce((a, s) => a + (q.data.value?.statusCounts[s] ?? 0), 0))
const noBrands = computed(() => brands.loaded.value && brands.active.value.length === 0)

const bar = ref<HTMLElement | null>(null)
watch(() => q.data.value, async () => {
  await nextTick()
  if (bar.value && !prefersReducedMotion()) gsap.fromTo(bar.value.children, { scaleX: 0 }, { scaleX: 1, duration: 0.9, stagger: 0.08, ease: 'power3.out', transformOrigin: 'left' })
})
const pct = (s: ContentStatus) => total.value ? `${((q.data.value?.statusCounts[s] ?? 0) / total.value) * 100}%` : '0%'
const brandOf = (id: string) => brands.byId(id)
</script>

<template>
  <div>
    <UiPageHeader :title="`${greeting}, ${user?.name?.split(' ')[0] ?? ''}`" :subtitle="t('dashboard.subtitle', { date: formatDate(today, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) })">
      <NuxtLink to="/app/calendar" class="btn-secondary"><Plus class="size-4" />{{ t('content.newManual') }}</NuxtLink>
      <NuxtLink to="/app/generate" class="btn-primary"><WandSparkles class="size-4" />{{ t('nav.generate') }}</NuxtLink>
    </UiPageHeader>

    <UiEmptyState v-if="noBrands" :icon="Store" :title="t('dashboard.emptyTitle')" :message="t('dashboard.emptyBody', { n: wallet?.available ?? 0 })">
      <NuxtLink to="/app/brands/new?onboarding=1" class="btn-primary"><Rocket class="size-4" />{{ t('brands.create') }}</NuxtLink>
    </UiEmptyState>

    <template v-else>
      <UiErrorState v-if="q.error.value && !q.data.value" :error="q.error.value" @retry="q.refresh()" />
      <div v-else-if="!q.data.value" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div v-for="i in 4" :key="i" class="skeleton h-32" />
      </div>
      <template v-else>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UiStatCard v-anim="0" :label="t('credits.available')" :value="q.data.value.wallet.available" :icon="Coins" tint="#FFB23F" :hint="q.data.value.wallet.reserved ? t('credits.reservedShort', { n: q.data.value.wallet.reserved }) : t('credits.noExpiry')" />
          <UiStatCard v-anim="1" :label="t('dashboard.thisMonth')" :value="q.data.value.monthCount" :icon="CalendarClock" tint="#6C4CF5" />
          <UiStatCard v-anim="2" :label="t('dashboard.inProgress')" :value="(q.data.value.statusCounts.draft + q.data.value.statusCounts.in_review)" :icon="FilePen" tint="#FF6FAE" :hint="`${t('status.draft')} ${q.data.value.statusCounts.draft} · ${t('status.in_review')} ${q.data.value.statusCounts.in_review}`" />
          <UiStatCard v-anim="3" :label="t('status.published')" :value="q.data.value.statusCounts.published" :icon="Send" tint="#2FA86A" :hint="`${t('status.approved')} ${q.data.value.statusCounts.approved} · ${t('status.scheduled')} ${q.data.value.statusCounts.scheduled}`" />
        </div>

        <section v-anim class="card card-pad mt-4">
          <div class="flex items-center justify-between">
            <h2 class="font-display text-lg font-bold">{{ t('dashboard.pipeline') }}</h2>
            <span class="text-sm text-muted">{{ t('dashboard.totalItems', { n: total }) }}</span>
          </div>
          <div ref="bar" class="mt-4 flex h-4 overflow-hidden rounded-full bg-surface-2">
            <span v-for="s in CONTENT_STATUSES" :key="s" class="h-full" :class="STATUS_META[s].dot" :style="{ width: pct(s) }" />
          </div>
          <div class="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span v-for="s in CONTENT_STATUSES" :key="s" class="inline-flex items-center gap-2"><span class="size-2.5 rounded-full" :class="STATUS_META[s].dot" />{{ t(`status.${s}`) }} <b>{{ q.data.value.statusCounts[s] }}</b></span>
          </div>
        </section>

        <div class="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <section v-anim class="card card-pad">
            <div class="flex items-center justify-between">
              <h2 class="font-display text-lg font-bold">{{ t('dashboard.upcoming') }}</h2>
              <NuxtLink to="/app/calendar" class="btn-ghost btn-sm">{{ t('nav.calendar') }}<ArrowRight class="size-3.5" /></NuxtLink>
            </div>
            <ul v-if="q.data.value.upcoming.length" class="mt-3 divide-y divide-line">
              <li v-for="(c, i) in q.data.value.upcoming" :key="c.id" v-anim="i">
                <NuxtLink :to="`/app/content/${c.id}`" class="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 transition hover:bg-surface-2">
                  <div class="w-14 shrink-0 rounded-2xl bg-surface-2 py-1.5 text-center">
                    <p class="text-[10px] font-bold uppercase text-muted">{{ formatDate(c.scheduledDate, locale, { weekday: 'short' }) }}</p>
                    <p class="font-display text-lg font-bold leading-none">{{ formatDate(c.scheduledDate, locale, { day: 'numeric' }) }}</p>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-semibold">{{ c.title }}</p>
                    <p class="mt-0.5 flex items-center gap-2 text-xs text-muted"><UiPlatformBadge :platform="c.platform" size="xs" />{{ brandOf(c.brandId)?.name }}<span v-if="c.scheduledTime">· {{ c.scheduledTime }}</span></p>
                  </div>
                  <UiStatusBadge :status="c.status" small />
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="mt-6 rounded-2xl bg-surface-2 p-6 text-center text-sm text-muted">{{ t('dashboard.noUpcoming') }}</p>
          </section>

          <div class="space-y-4">
            <section v-anim class="card card-pad">
              <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Hourglass class="size-5 text-pink" />{{ t('dashboard.backlog') }}</h2>
              <ul v-if="q.data.value.backlog.length" class="mt-3 space-y-2">
                <li v-for="c in q.data.value.backlog" :key="c.id">
                  <NuxtLink :to="`/app/content/${c.id}`" class="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-sm transition hover:border-brand-300">
                    <span class="w-16 shrink-0 text-xs font-semibold" :class="(c.scheduledDate ?? '') < today ? 'text-danger' : 'text-muted'">{{ formatDate(c.scheduledDate, locale, { day: 'numeric', month: 'short' }) }}</span>
                    <span class="min-w-0 flex-1 truncate font-medium">{{ c.title }}</span>
                    <UiStatusBadge :status="c.status" small />
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="mt-3 flex items-center gap-2 text-sm text-muted"><CheckCircle2 class="size-4 text-success" />{{ t('dashboard.noBacklog') }}</p>
            </section>

            <section v-anim class="card card-pad">
              <div class="flex items-center justify-between">
                <h2 class="font-display text-lg font-bold">{{ t('dashboard.recentJobs') }}</h2>
                <NuxtLink to="/app/generate" class="btn-ghost btn-sm">{{ t('nav.generate') }}<ArrowRight class="size-3.5" /></NuxtLink>
              </div>
              <ul v-if="q.data.value.recentJobs.length" class="mt-3 space-y-2">
                <li v-for="j in q.data.value.recentJobs" :key="j.id">
                  <NuxtLink :to="`/app/jobs/${j.id}`" class="block rounded-2xl border border-line px-3 py-2.5 transition hover:border-brand-300">
                    <div class="flex items-center gap-2 text-sm">
                      <span class="min-w-0 flex-1 truncate font-semibold">{{ j.brandName }}</span>
                      <UiJobStatus :status="j.status" />
                    </div>
                    <div class="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span class="bg-success" :style="{ width: `${(j.completedCount / j.requestedCount) * 100}%` }" />
                      <span class="bg-danger" :style="{ width: `${(j.failedCount / j.requestedCount) * 100}%` }" />
                    </div>
                    <p class="mt-1.5 text-xs text-muted">{{ t('jobs.summaryLine', { ok: j.completedCount, total: j.requestedCount, failed: j.failedCount }) }} · {{ formatDateTime(j.createdAt, locale) }}</p>
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="mt-3 text-sm text-muted">{{ t('dashboard.noJobs') }}</p>
            </section>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
