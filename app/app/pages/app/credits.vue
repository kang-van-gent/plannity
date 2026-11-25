<script setup lang="ts">
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, Coins, CreditCard, FlaskConical, Gift, Lock, Receipt, RotateCcw, Wrench } from '@lucide/vue'
import type { LedgerType, PaymentOrder, PaymentStatus } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
useSeoMeta({ title: () => t('nav.credits') })
const api = useApi()
const notify = useNotify()
const { wallet, refresh: refreshWallet } = useWallet()

const ledger = useQuery(() => api.credits.ledger())
const orders = useQuery(() => api.credits.orders())
onMounted(refreshWallet)
const price = computed(() => wallet.value?.creditPriceSatang ?? 1000)
const ledgerLimit = ref(15)

const TYPE_META: Record<LedgerType, { icon: typeof Coins; cls: string }> = {
  trial_grant: { icon: Gift, cls: 'bg-pink/15 text-pink' },
  purchase: { icon: CreditCard, cls: 'bg-success/15 text-success' },
  reserve: { icon: Lock, cls: 'bg-brand-500/12 text-brand-500' },
  consume: { icon: ArrowUpRight, cls: 'bg-sun/20 text-amber-700 dark:text-sun' },
  release: { icon: RotateCcw, cls: 'bg-sky/20 text-sky-700 dark:text-sky' },
  adjustment: { icon: Wrench, cls: 'bg-slate-500/10 text-muted' },
}
const ORDER_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-sun/15 text-amber-700 dark:text-sun', paid: 'bg-success/12 text-success', failed: 'bg-danger/12 text-danger',
  expired: 'bg-slate-500/10 text-muted', refunded: 'bg-sky/15 text-sky-700 dark:text-sky',
}

// --- sandbox checkout -------------------------------------------------------
const custom = ref(20)
const creating = ref<number | null>(null)
const order = ref<PaymentOrder | null>(null)
const simulating = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | undefined

async function buy(credits: number) {
  if (!Number.isInteger(credits) || credits < 1 || credits > 500) { notify.warning(t('validation.invalid_credits')); return }
  creating.value = credits
  try {
    order.value = await api.credits.createOrder(credits)
    pollOrder()
  } catch (e) {
    notify.fromError(e)
  } finally {
    creating.value = null
  }
}

// The UI learns about payment only from the server-side order status, never
// from a client callback (spec §3).
async function pollOrder() {
  clearTimeout(pollTimer)
  if (!order.value) return
  try {
    const o = await api.credits.getOrder(order.value.id)
    const was = order.value.status
    order.value = o
    if (o.status !== 'pending') {
      if (was === 'pending') settle(o)
      return
    }
  } catch { /* transient; keep polling */ }
  pollTimer = setTimeout(pollOrder, 1500)
}

function settle(o: PaymentOrder) {
  refreshWallet()
  ledger.refresh({ silent: true })
  orders.refresh({ silent: true })
  if (o.status === 'paid') notify.success(t('credits.paid', { n: o.credits }), t('credits.paidBody'))
  else if (o.status === 'failed') notify.error(t('credits.payFailed'), t('credits.payFailedBody'))
  else if (o.status === 'expired') notify.warning(t('credits.expired'))
  setTimeout(() => { if (order.value?.id === o.id && o.status !== 'pending') order.value = null }, 1200)
}

async function simulate(outcome: 'paid' | 'failed') {
  if (!order.value || !api.credits.simulateWebhook) return
  simulating.value = true
  try { await api.credits.simulateWebhook(order.value.id, outcome) } catch (e) { notify.fromError(e) } finally { simulating.value = false }
}

function closeCheckout() {
  if (order.value?.status === 'pending') notify.info(t('credits.orderPending'), t('credits.orderPendingBody'))
  clearTimeout(pollTimer)
  order.value = null
  orders.refresh({ silent: true })
}
function resume(o: PaymentOrder) { order.value = o; pollOrder() }
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <div>
    <UiPageHeader :title="t('nav.credits')" :subtitle="t('credits.subtitle', { price: formatTHB(price, locale) })" />

    <div class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
      <div v-anim="0" class="relative col-span-2 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-pop sm:rounded-3xl sm:p-6 md:col-span-1">
        <Doodle variant="spark" class="absolute right-5 top-5 size-8 text-sun" />
        <p class="text-sm text-white/75">{{ t('credits.available') }}</p>
        <p class="font-display text-5xl font-bold tabular-nums">{{ wallet?.available ?? '–' }}</p>
        <p class="mt-1 text-sm text-white/75">{{ t('credits.noExpiry') }}</p>
      </div>
      <UiStatCard v-anim="1" :label="t('credits.reserved')" :value="wallet?.reserved ?? 0" :icon="Lock" tint="#62C5F4" :hint="t('credits.reservedHint')" />
      <UiStatCard v-anim="2" :label="t('credits.pricePer')" :value="price / 100" :icon="CircleDollarSign" tint="#FFB23F" :hint="t('credits.priceHint')" />
    </div>

    <section class="mt-8">
      <h2 v-anim class="font-display text-xl font-bold">{{ t('credits.buy') }}</h2>
      <div class="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-5">
        <button v-for="(p, i) in CREDIT_PACKAGES" :key="p" v-anim="i" type="button" class="card card-pad pressable group text-left hover:-translate-y-1 hover:border-brand-300 hover:shadow-pop" :disabled="creating !== null" @click="buy(p)">
          <Coins class="size-6 text-sun transition group-hover:rotate-12" />
          <p class="mt-3 font-display text-3xl font-bold">{{ p }}</p>
          <p class="text-sm text-muted">{{ t('credits.unit') }}</p>
          <p class="mt-2 font-semibold">{{ creating === p ? t('common.loading') : formatTHB(p * price, locale) }}</p>
        </button>
        <div v-anim="4" class="card card-pad col-span-2 sm:col-span-1">
          <label for="custom-credits" class="label">{{ t('credits.custom') }}</label>
          <input id="custom-credits" v-model.number="custom" type="number" min="1" max="500" class="input">
          <p class="mt-2 text-sm font-semibold">{{ formatTHB((custom || 0) * price, locale) }}</p>
          <button type="button" class="btn-primary mt-3 w-full" :disabled="creating !== null" @click="buy(custom)">{{ t('credits.buy') }}</button>
        </div>
      </div>
      <p v-anim class="mt-3 flex items-center gap-2 text-xs text-muted"><FlaskConical class="size-3.5" />{{ t('credits.sandboxNote') }}</p>
    </section>

    <div class="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_1fr]">
      <section v-anim class="card overflow-hidden">
        <h2 class="flex items-center gap-2 border-b border-line px-4 py-3.5 font-display text-lg font-bold sm:px-5 sm:py-4"><Receipt class="size-5 text-brand-500" />{{ t('credits.history') }}</h2>
        <UiErrorState v-if="ledger.error.value" compact :error="ledger.error.value" class="m-4" @retry="ledger.refresh()" />
        <UiSkeletonList v-else-if="!ledger.data.value" :rows="3" class="p-4" />
        <p v-else-if="!ledger.data.value.length" class="p-6 text-center text-sm text-muted">{{ t('credits.noHistory') }}</p>
        <div v-else>
          <!-- Phones: list rows instead of a sideways-scrolling table. -->
          <ul class="divide-y divide-line sm:hidden">
            <li v-for="l in ledger.data.value.slice(0, ledgerLimit)" :key="l.id" class="flex items-center gap-3 px-4 py-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-2xl" :class="TYPE_META[l.type].cls"><component :is="TYPE_META[l.type].icon" class="size-4" /></span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold">{{ t(`credits.types.${l.type}`) }}</p>
                <p class="text-xs text-muted">{{ formatDateTime(l.createdAt, locale) }}</p>
              </div>
              <div class="text-right">
                <p class="font-display text-base font-bold tabular-nums">
                  <span v-if="l.deltaAvailable" :class="l.deltaAvailable > 0 ? 'text-success' : ''">{{ l.deltaAvailable > 0 ? '+' : '' }}{{ l.deltaAvailable }}</span>
                  <span v-else class="text-sm font-semibold text-muted">{{ t('credits.reservedDelta', { n: (l.deltaReserved > 0 ? '+' : '') + l.deltaReserved }) }}</span>
                </p>
                <p class="text-[11px] text-muted tabular-nums">{{ t('credits.cols.balance') }} {{ l.availableAfter }}</p>
              </div>
            </li>
          </ul>
          <div class="hidden overflow-x-auto sm:block">
          <table class="w-full min-w-[34rem] text-sm">
            <thead class="bg-surface-2 text-left text-xs text-muted">
              <tr><th class="px-5 py-2.5 font-semibold">{{ t('credits.cols.time') }}</th><th class="px-3 py-2.5 font-semibold">{{ t('credits.cols.type') }}</th><th class="px-3 py-2.5 text-right font-semibold">{{ t('credits.cols.amount') }}</th><th class="px-5 py-2.5 text-right font-semibold">{{ t('credits.cols.balance') }}</th></tr>
            </thead>
            <tbody class="divide-y divide-line">
              <tr v-for="l in ledger.data.value.slice(0, ledgerLimit)" :key="l.id" class="hover:bg-surface-2/60">
                <td class="whitespace-nowrap px-5 py-3 text-muted">{{ formatDateTime(l.createdAt, locale) }}</td>
                <td class="px-3 py-3"><span class="chip" :class="TYPE_META[l.type].cls"><component :is="TYPE_META[l.type].icon" class="size-3.5" />{{ t(`credits.types.${l.type}`) }}</span></td>
                <td class="px-3 py-3 text-right font-semibold tabular-nums">
                  <span v-if="l.deltaAvailable" :class="l.deltaAvailable > 0 ? 'text-success' : ''">{{ l.deltaAvailable > 0 ? '+' : '' }}{{ l.deltaAvailable }}</span>
                  <span v-else class="text-muted">{{ t('credits.reservedDelta', { n: (l.deltaReserved > 0 ? '+' : '') + l.deltaReserved }) }}</span>
                </td>
                <td class="px-5 py-3 text-right tabular-nums">{{ l.availableAfter }}</td>
              </tr>
            </tbody>
          </table>
          </div>
          <button v-if="ledger.data.value.length > ledgerLimit" type="button" class="btn-ghost m-3 max-sm:w-[calc(100%-1.5rem)]" @click="ledgerLimit += 20"><ArrowDownLeft class="size-4" />{{ t('common.showMore') }}</button>
        </div>
      </section>

      <section v-anim class="card h-fit overflow-hidden">
        <h2 class="border-b border-line px-5 py-4 font-display text-lg font-bold">{{ t('credits.orders') }}</h2>
        <UiSkeletonList v-if="!orders.data.value && !orders.error.value" :rows="2" class="p-4" />
        <UiErrorState v-else-if="orders.error.value" compact :error="orders.error.value" class="m-4" @retry="orders.refresh()" />
        <p v-else-if="!orders.data.value?.length" class="p-6 text-center text-sm text-muted">{{ t('credits.noOrders') }}</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="o in orders.data.value" :key="o.id" class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:flex-nowrap sm:px-5">
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ t('credits.orderLine', { n: o.credits }) }} · {{ formatTHB(o.amountSatang, locale) }}</p>
              <p class="truncate text-xs text-muted">{{ o.id }} · {{ formatDateTime(o.createdAt, locale) }}</p>
            </div>
            <button v-if="o.status === 'pending'" type="button" class="btn-secondary btn-sm" @click="resume(o)">{{ t('credits.resume') }}</button>
            <span class="chip" :class="ORDER_STYLE[o.status]">{{ t(`credits.orderStatus.${o.status}`) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <SidePanel :open="!!order" size="sm" :title="t('credits.checkout')" :subtitle="order ? `${order.id} · ${order.providerRef}` : ''" :close-on-backdrop="false" @close="closeCheckout">
      <template v-if="order">
        <div class="rounded-2xl border-2 border-dashed border-sun bg-sun/10 p-4 text-sm">
          <p class="flex items-center gap-2 font-bold text-amber-700 dark:text-sun"><FlaskConical class="size-4" />{{ t('credits.testMode') }}</p>
          <p class="mt-1 text-muted">{{ t('credits.testModeBody') }}</p>
        </div>
        <dl class="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <div class="flex justify-between px-4 py-3"><dt class="text-muted">{{ t('credits.unit') }}</dt><dd class="font-semibold">{{ order.credits }}</dd></div>
          <div class="flex justify-between px-4 py-3"><dt class="text-muted">{{ t('credits.total') }}</dt><dd class="font-display text-xl font-bold text-brand-600 dark:text-brand-300">{{ formatTHB(order.amountSatang, locale) }}</dd></div>
          <div class="flex items-center justify-between px-4 py-3"><dt class="text-muted">{{ t('credits.status') }}</dt><dd><span class="chip" :class="ORDER_STYLE[order.status]">{{ t(`credits.orderStatus.${order.status}`) }}</span></dd></div>
        </dl>
        <div v-if="order.status === 'pending'" class="flex flex-col items-center gap-2 py-2 text-center text-sm text-muted">
          <span class="relative flex size-3"><span class="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" /><span class="relative inline-flex size-3 rounded-full bg-brand-500" /></span>
          {{ t('credits.waitingWebhook') }}
        </div>
        <div v-else class="flex justify-center py-2"><ResultIcon :key="order.status" :type="order.status === 'paid' ? 'success' : order.status === 'failed' ? 'error' : 'warning'" :size="72" /></div>
      </template>
      <template #footer>
        <template v-if="order?.status === 'pending' && api.credits.simulateWebhook">
          <button type="button" class="btn-secondary" :disabled="simulating" @click="simulate('failed')">{{ t('credits.simFail') }}</button>
          <button type="button" class="btn-primary" :disabled="simulating" @click="simulate('paid')">{{ simulating ? t('common.loading') : t('credits.simPay') }}</button>
        </template>
        <button v-else type="button" class="btn-secondary" @click="closeCheckout">{{ t('common.close') }}</button>
      </template>
    </SidePanel>
  </div>
</template>
