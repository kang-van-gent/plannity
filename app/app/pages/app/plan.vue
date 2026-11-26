<script setup lang="ts">
import { CalendarClock, Gem, Info, Lock, Minus, Plus, QrCode, RefreshCw, Store, TimerOff, Users } from '@lucide/vue'
import type { BrandCover, OrderInput, PaymentOrder, PaymentStatus, PlanKey } from '~/types'

// Plan & billing (pricing.md v0.2): the account's plan covers every brand it
// owns. Paid by PromptPay one month at a time — the plan (or add-on) starts
// only when the server marks the payment paid; nothing renews automatically.
definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('plan.title') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const isMock = useIsMock()

const me = useQuery(() => api.billing.me())
const orders = useQuery(() => api.credits.orders().then((list) => list.filter((o) => o.kind !== 'credits')))
const ent = computed(() => me.data.value)
const planName = (k: PlanKey) => t(`plan.names.${k}`)
const money = (satang: number) => formatTHB(satang, locale.value)
const date = (iso: string | null) => (iso ? formatDateTime(iso, locale.value, { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const pct = (used: number, max: number | null) => (max ? Math.min(100, (used / max) * 100) : 18)

const STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-sun/15 text-amber-700 dark:text-sun', awaiting_review: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  paid: 'bg-success/12 text-success', rejected: 'bg-danger/12 text-danger', failed: 'bg-danger/12 text-danger',
  expired: 'bg-slate-500/10 text-muted', refunded: 'bg-sky/15 text-sky-700 dark:text-sky',
}
const itemLabel = useOrderLabel()

// ---- renewals ----------------------------------------------------------------
// Each extra brand has its own end date; a renewal adds a month from that date
// (or from now if it already locked). The plan renews the same way.
const nowIso = new Date().toISOString()
const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5)) : null)
const soon = (iso: string | null) => { const d = daysLeft(iso); return d !== null && d <= RENEW_SOON_DAYS }
/** Paid plan to renew: the current one, or the last one if it lapsed. */
const renewPlanKey = computed<Exclude<PlanKey, 'solo'> | null>(() => (ent.value ? (ent.value.planKey !== 'solo' ? ent.value.planKey : ent.value.lastPlanKey) : null))
const includePlan = ref(true)
/** Brands that need their own month (Studio covers everything while it runs). */
const renewBrands = computed<BrandCover[]>(() => (!ent.value || (ent.value.planKey === 'studio' && includePlan.value) ? [] : ent.value.brands.filter((b) => b.kind === 'slot' || b.kind === 'none')))
const planPart = computed(() => (includePlan.value && renewPlanKey.value ? renewPlanKey.value : null))
const renewTotal = computed(() => (ent.value ? (planPart.value ? ent.value.pricing.plans[planPart.value].monthlySatang : 0) + renewBrands.value.length * ent.value.pricing.additionalBrandMonthlySatang : 0))
const brandNewEnd = (b: BrandCover) => addBillingMonths(renewalStart(b.paidUntil, nowIso), 1)
const planNewEnd = computed(() => (ent.value && planPart.value ? addBillingMonths(ent.value.planKey === planPart.value && ent.value.periodEnd ? ent.value.periodEnd : nowIso, 1) : null))
const renewAll = () => buy({ kind: 'renewal', planKey: planPart.value, brandIds: renewBrands.value.map((b) => b.id) }, 'renew')
const renewOne = (b: BrandCover) => buy({ kind: 'renewal', planKey: null, brandIds: [b.id] }, b.id)
const coverLabel = (b: BrandCover) => (b.kind === 'none' ? t('plan.cover.none') : b.kind === 'included' ? t('plan.cover.included') : t(`plan.cover.${b.kind}`, { date: date(b.until) }))
const COVER_STYLE = { included: 'bg-success/12 text-success', plan: 'bg-brand-500/12 text-brand-600 dark:text-brand-300', slot: 'bg-sky/15 text-sky-700 dark:text-sky', none: 'bg-danger/12 text-danger' } as const

// ---- buying ------------------------------------------------------------------
const addonQty = ref(1)
const creating = ref<string | null>(null)
const order = ref<PaymentOrder | null>(null)
let pollTimer: ReturnType<typeof setTimeout> | undefined

async function buy(input: OrderInput, key: string) {
  creating.value = key
  try {
    order.value = await api.credits.createOrder(input)
    orders.refresh({ silent: true })
  } catch (e) {
    notify.fromError(e)
  } finally {
    creating.value = null
  }
}
const choosePlan = (k: Exclude<PlanKey, 'solo'>) => buy({ kind: 'plan', planKey: k }, k)

function onOrderUpdate(o: PaymentOrder) {
  const was = order.value?.status
  order.value = o
  if (was !== o.status) settle(o)
  watchReview()
}
function watchReview() {
  clearTimeout(pollTimer)
  if (order.value?.status !== 'awaiting_review') return
  pollTimer = setTimeout(async () => {
    if (!order.value) return
    try { onOrderUpdate(await api.credits.getOrder(order.value.id)) } catch { watchReview() }
  }, 5000)
}
function settle(o: PaymentOrder) {
  orders.refresh({ silent: true })
  if (o.status === 'paid') {
    me.refresh({ silent: true })
    useEntitlements().load(true)
    brands.load(true) // brand gates (collaboration, tasks) change with the plan
    notify.success(o.kind === 'plan' && o.planKey ? t('plan.activated', { plan: planName(o.planKey) }) : o.kind === 'renewal' ? t('plan.renewed') : t('plan.addonActivated'), t('plan.activatedBody'))
  } else if (o.status === 'rejected') notify.warning(t('pay.rejectedTitle'), o.reviewNote ?? undefined)
}
function closeCheckout() { clearTimeout(pollTimer); order.value = null }
function resume(o: PaymentOrder) { order.value = o; watchReview() }
onBeforeUnmount(() => clearTimeout(pollTimer))

async function demoExpire() {
  if (!api.billing.simulateExpire) return
  await api.billing.simulateExpire()
  await Promise.all([me.refresh({ silent: true }), brands.load(true)])
  notify.info(t('plan.demoExpired'), t('plan.demoExpiredBody'))
}
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <UiPageHeader :title="t('plan.title')" :subtitle="t('plan.subtitle')" />
    <UiErrorState v-if="me.error.value" :error="me.error.value" @retry="me.refresh()" />
    <UiSkeletonList v-else-if="!ent" :rows="3" />
    <template v-else>
      <!-- Current plan + usage -->
      <section v-anim class="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div class="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-500 to-pink p-6 text-white">
          <Doodle variant="petal" class="absolute -right-8 -top-8 size-36 text-white/15" />
          <p class="relative text-sm text-white/80">{{ t('plan.current') }}</p>
          <p class="relative mt-1 flex items-center gap-2 font-display text-4xl font-bold"><Gem class="size-7" />{{ planName(ent.planKey) }}</p>
          <p class="relative mt-2 flex items-center gap-1.5 text-sm text-white/85"><CalendarClock class="size-4" />{{ ent.periodEnd ? t('plan.paidUntil', { date: date(ent.periodEnd) }) : t('plan.freeForever') }}</p>
          <p v-for="u in ent.upcoming" :key="u.periodStart" class="relative mt-1 text-xs text-white/75">{{ t('plan.then', { plan: planName(u.planKey), date: date(u.periodStart) }) }}</p>
        </div>
        <div class="card card-pad">
          <p class="flex items-center gap-2 text-sm font-semibold text-muted"><Store class="size-4" />{{ t('plan.brands') }}</p>
          <p class="mt-1 font-display text-3xl font-bold">{{ ent.brandLimit === null ? `${ent.brandsOwned} · ${t('plan.unlimited')}` : t('plan.of', { used: ent.brands.filter((b) => !b.locked).length, max: ent.brandLimit }) }}</p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><span class="block h-full rounded-full bg-gradient-to-r from-sky to-brand-500" :style="{ width: `${pct(ent.brands.filter((b) => !b.locked).length, ent.brandLimit)}%` }" /></div>
        </div>
        <div class="card card-pad">
          <p class="flex items-center gap-2 text-sm font-semibold text-muted"><Users class="size-4" />{{ t('plan.seats') }}</p>
          <p class="mt-1 font-display text-3xl font-bold">{{ t('plan.of', { used: ent.seatsUsed, max: ent.seatLimit }) }}</p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><span class="block h-full rounded-full bg-gradient-to-r from-pink to-sun" :style="{ width: `${pct(ent.seatsUsed, ent.seatLimit)}%` }" /></div>
          <p v-if="ent.seatsUsed >= ent.seatLimit && ent.features.collaboration" class="mt-2 text-xs text-muted">{{ t('plan.seatsFull') }}</p>
        </div>
      </section>
      <BillingRenewNotice on-plan-page class="mt-4" />

      <!-- Plans -->
      <section class="mt-10">
        <BillingPlanCards mode="app" :pricing="ent.pricing" :current="ent.planKey" :busy="(['solo', 'team', 'studio'].includes(creating ?? '') ? creating : null) as PlanKey | null" @choose="choosePlan" />
        <p v-anim class="mt-6 text-center text-sm text-muted">{{ t('plan.sharedNote', { price: money(ent.pricing.aiContentCreditSatang), addon: money(ent.pricing.additionalBrandMonthlySatang) }) }}</p>
      </section>

      <!-- Renew everything: one payment for the plan + every extra brand -->
      <section id="renew" v-anim class="mt-8 scroll-mt-24 overflow-hidden rounded-[1.75rem] border-2 border-brand-500/30 bg-surface">
        <div class="flex flex-wrap items-start gap-3 border-b border-line p-5 sm:p-6">
          <span class="grid size-11 place-items-center rounded-2xl bg-brand-500/12 text-brand-500"><RefreshCw class="size-5" /></span>
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl font-bold">{{ t('plan.renewAll') }}</h2>
            <p class="mt-0.5 text-sm text-muted">{{ t('plan.renewAllBody') }}</p>
          </div>
        </div>
        <p v-if="!renewPlanKey && !renewBrands.length" class="p-5 text-sm text-muted sm:p-6">{{ t('plan.nothingToRenew') }}</p>
        <template v-else>
          <ul class="divide-y divide-line">
            <li v-if="renewPlanKey" class="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input v-model="includePlan" type="checkbox" class="size-5 accent-brand-500" :aria-label="t('plan.includePlan', { plan: planName(renewPlanKey) })">
                <span class="min-w-0">
                  <span class="block font-semibold"><Gem class="mr-1 inline size-4 text-brand-500" />{{ t('plan.renewPlanLine', { plan: planName(renewPlanKey) }) }}</span>
                  <span class="text-xs" :class="ent.planKey === 'solo' ? 'text-danger' : soon(ent.periodEnd) ? 'font-semibold text-amber-700 dark:text-sun' : 'text-muted'">
                    {{ ent.planKey === 'solo' ? t('plan.lapsedPlan', { date: date(ent.lastPlanEnd) }) : soon(ent.periodEnd) ? t('plan.expiresSoon', { n: daysLeft(ent.periodEnd) ?? 0 }) : t('plan.paidUntil', { date: date(ent.periodEnd) }) }}
                    <template v-if="planNewEnd"> → {{ t('plan.newEnd', { date: date(planNewEnd) }) }}</template>
                  </span>
                </span>
              </label>
              <span class="font-semibold tabular-nums">{{ money(ent.pricing.plans[renewPlanKey].monthlySatang) }}</span>
            </li>
            <li v-for="b in renewBrands" :key="b.id" class="flex flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
              <UiBrandDot :name="b.name" :color="b.color" :size="28" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">{{ t('plan.renewBrandLine', { name: b.name }) }}</span>
                <span class="text-xs" :class="b.locked ? 'text-danger' : soon(b.until) ? 'font-semibold text-amber-700 dark:text-sun' : 'text-muted'">
                  {{ b.locked ? t('plan.cover.none') : soon(b.until) ? t('plan.expiresSoon', { n: daysLeft(b.until) ?? 0 }) : coverLabel(b) }} → {{ t('plan.newEnd', { date: date(brandNewEnd(b)) }) }}
                </span>
              </span>
              <span class="font-semibold tabular-nums">{{ money(ent.pricing.additionalBrandMonthlySatang) }}</span>
            </li>
          </ul>
          <div class="flex flex-wrap items-center gap-3 bg-surface-2 px-5 py-4 sm:px-6">
            <p v-if="ent.planKey === 'studio' && includePlan" class="min-w-0 flex-1 text-xs text-muted">{{ t('plan.studioNote', { date: date(ent.periodEnd) }) }}</p>
            <span v-else class="flex-1" />
            <button type="button" class="btn-primary max-sm:w-full" :disabled="!!creating || renewTotal <= 0" @click="renewAll">
              <QrCode class="size-4" />{{ t('plan.payAmount', { amount: money(renewTotal) }) }}
            </button>
          </div>
        </template>
      </section>

      <!-- Every owned brand and what covers it -->
      <section id="brands" v-anim class="card mt-6 scroll-mt-24 overflow-hidden">
        <div class="border-b border-line px-5 py-4 sm:px-6">
          <h2 class="flex items-center gap-2 font-display text-xl font-bold"><Store class="size-5 text-sky" />{{ t('plan.brandsTitle') }}</h2>
          <p class="mt-0.5 text-sm text-muted">{{ t('plan.brandsBody', { price: money(ent.pricing.additionalBrandMonthlySatang) }) }}</p>
        </div>
        <ul class="divide-y divide-line">
          <li v-for="b in ent.brands" :key="b.id" class="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap sm:px-6" :class="b.locked && 'bg-danger/[0.04]'">
            <UiBrandDot :name="b.name" :color="b.color" :size="32" />
            <div class="min-w-0 flex-1">
              <NuxtLink :to="`/app/brands/${b.id}`" class="block truncate font-semibold hover:underline">{{ b.name }}</NuxtLink>
              <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span class="chip py-0.5" :class="COVER_STYLE[b.kind]"><Lock v-if="b.locked" class="size-3" />{{ coverLabel(b) }}</span>
                <span v-if="!b.locked && b.kind !== 'included' && soon(b.until)" class="chip bg-sun/20 py-0.5 text-amber-700 dark:text-sun">{{ t('plan.expiresSoon', { n: daysLeft(b.until) ?? 0 }) }}</span>
                <span v-if="b.archivedAt" class="chip bg-surface-2 py-0.5 text-muted">{{ t('brands.archivedChip') }}</span>
              </p>
            </div>
            <button v-if="b.kind === 'slot' || b.kind === 'none'" type="button" class="btn-sm max-sm:w-full" :class="b.locked ? 'btn-primary' : 'btn-secondary'" :disabled="!!creating" @click="renewOne(b)">
              <RefreshCw class="size-3.5" />{{ b.locked ? t('plan.unlock', { price: money(ent.pricing.additionalBrandMonthlySatang) }) : t('plan.renewOne', { price: money(ent.pricing.additionalBrandMonthlySatang) }) }}
            </button>
          </li>
        </ul>
      </section>

      <!-- Slots for brands you haven't created yet -->
      <section id="addon" v-anim class="card card-pad mt-6 grid scroll-mt-24 items-center gap-5 md:grid-cols-[1fr_auto]">
        <div>
          <h2 class="flex items-center gap-2 font-display text-xl font-bold"><Plus class="size-5 text-sky" />{{ t('plan.newSlotsTitle') }}</h2>
          <p class="mt-1 text-sm text-muted">{{ t('plan.newSlotsBody', { price: money(ent.pricing.additionalBrandMonthlySatang) }) }}</p>
          <p v-if="ent.freeSlots" class="mt-2 text-sm font-semibold text-success">{{ t('plan.freeSlots', { n: ent.freeSlots }) }}</p>
        </div>
        <p v-if="ent.planKey === 'studio'" class="text-sm font-semibold text-success">{{ t('plan.addonStudio') }}</p>
        <div v-else class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-1 rounded-2xl bg-surface-2 p-1" role="group" :aria-label="t('plan.addonQty')">
            <button type="button" class="btn-icon btn-ghost" aria-label="−" :disabled="addonQty <= 1" @click="addonQty--"><Minus class="size-4" /></button>
            <span class="w-8 text-center font-display text-xl font-bold tabular-nums" aria-live="polite">{{ addonQty }}</span>
            <button type="button" class="btn-icon btn-ghost" aria-label="+" :disabled="addonQty >= 20" @click="addonQty++"><Plus class="size-4" /></button>
          </div>
          <button type="button" class="btn-primary" :disabled="!!creating" @click="buy({ kind: 'brand_addon', quantity: addonQty }, 'addon')">
            <QrCode class="size-4" />{{ t('plan.addonBuy', { amount: money(ent.pricing.additionalBrandMonthlySatang * addonQty) }) }}
          </button>
        </div>
      </section>

      <div v-anim class="mt-6 grid gap-3 rounded-[1.5rem] bg-surface-2 p-4 text-sm text-muted sm:grid-cols-2">
        <p class="flex gap-2"><Info class="mt-0.5 size-4 shrink-0" />{{ t('plan.billingNote') }}</p>
        <p class="flex gap-2"><Info class="mt-0.5 size-4 shrink-0" />{{ t('plan.proration') }}</p>
      </div>

      <!-- Payments -->
      <section v-anim class="card mt-8 overflow-hidden">
        <h2 class="border-b border-line px-4 py-3.5 font-display text-lg font-bold sm:px-5">{{ t('plan.payments') }}</h2>
        <UiSkeletonList v-if="!orders.data.value && !orders.error.value" :rows="2" class="p-4" />
        <p v-else-if="!orders.data.value?.length" class="p-6 text-center text-sm text-muted">{{ t('plan.noPayments') }}</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="o in orders.data.value" :key="o.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:flex-nowrap sm:px-5">
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ itemLabel(o) }} · {{ money(o.amountSatang) }}</p>
              <p class="truncate text-xs text-muted">{{ o.reference || o.id }} · {{ formatDateTime(o.createdAt, locale) }}</p>
            </div>
            <span class="chip" :class="STATUS_STYLE[o.status]">{{ t(`credits.orderStatus.${o.status}`) }}</span>
            <button v-if="['pending', 'rejected', 'awaiting_review'].includes(o.status)" type="button" class="btn-secondary btn-sm" @click="resume(o)">{{ t('credits.resume') }}</button>
          </li>
        </ul>
      </section>

      <!-- Demo-only: see what a lapsed plan does -->
      <section v-if="isMock && api.billing.simulateExpire && ent.planKey !== 'solo'" class="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-sun bg-sun/10 p-4 text-sm">
        <TimerOff class="size-5 text-amber-600 dark:text-sun" />
        <p class="min-w-0 flex-1"><b>{{ t('plan.demoTitle') }}</b> · {{ t('plan.demoExpiredBody') }}</p>
        <button type="button" class="btn-secondary btn-sm" @click="demoExpire">{{ t('plan.demoExpire') }}</button>
      </section>
    </template>

    <SidePanel :open="!!order" :title="t('pay.title')" :subtitle="t('pay.subtitle')" :guard="false" @close="closeCheckout">
      <CreditsPromptPayCheckout v-if="order" :order="order" @update="onOrderUpdate" @restart="closeCheckout" />
    </SidePanel>
  </div>
</template>
