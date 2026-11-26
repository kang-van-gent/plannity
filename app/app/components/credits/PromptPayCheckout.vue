<script setup lang="ts">
import { Check, Clock, Copy, Download, ImageUp, LoaderCircle, Monitor, RefreshCw, ShieldCheck, Smartphone, Upload, X } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'
import type { PaymentHandoff, PaymentOrder } from '~/types'

// PromptPay checkout: scan the one-time QR (amount fixed) → pay in any Thai
// banking app → send the slip, which Slip2Go checks. Credits/plans are added
// only when the server marks the order paid.
//
// On a computer the default is the mobile hand-off: a second QR opens this same
// order on the phone (no sign-in), where the customer pays and sends the slip;
// this panel follows the order by itself. With `handoffToken` the component *is*
// that phone page.
const props = defineProps<{ order: PaymentOrder; handoffToken?: string }>()
const emit = defineEmits<{ update: [PaymentOrder]; restart: []; linkExpired: [] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const config = useRuntimeConfig()
const onPhone = computed(() => !!props.handoffToken)

const payee = computed(() => props.order.payee ?? { promptpayId: String(config.public.promptpayId), name: String(config.public.promptpayName) })
const amountBaht = computed(() => props.order.amountSatang / 100)
// Slip2Go's QR when the server provided one (checked there: our receiver, exact
// amount); otherwise the same payload built locally. Our encoder only emits
// rect/path markup.
const qr = computed(() => qrSvg(props.order.qrPayload || promptPayPayload(payee.value.promptpayId, amountBaht.value)))
/** What this order buys: credits, a month of a plan, or brand add-ons. */
const orderLabel = useOrderLabel()
const item = computed(() => orderLabel(props.order))
const paidTitle = computed(() => {
  const o = props.order
  if (o.kind === 'plan' && o.planKey) return t('plan.activated', { plan: t(`plan.names.${o.planKey}`) })
  if (o.kind === 'brand_addon' || o.kind === 'renewal') return t('plan.addonActivated')
  return t('pay.paidTitle', { n: o.credits })
})
const expiresIn = computed(() => (props.order.expiresAt ? formatDateTime(props.order.expiresAt, locale.value) : ''))

async function copy(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); notify.success(t('pay.copied', { what: label })) } catch { /* selectable anyway */ }
}

/** Saves the QR as a PNG (for paying from the same phone: open it in the banking app's "scan from gallery"). */
async function saveQr() {
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.value)}`
  await img.decode()
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.drawImage(img, 0, 0, 1024, 1024)
  c.toBlob((b) => b && saveBlob(b, `PromptPay-${props.order.reference}.png`), 'image/png')
}

// ---- slip upload -------------------------------------------------------------
const slipInput = ref<HTMLInputElement | null>(null)
const slip = ref<File | null>(null)
const slipPreview = ref('')
/** One key per chosen file: a retried send is processed once (no second Slip2Go check). */
let slipKey = ''
const uploading = ref(false)
const reviewing = ref(false)

async function pickSlip(list: FileList | null) {
  const f = list?.[0]
  if (slipInput.value) slipInput.value.value = ''
  if (!f) return
  const type = await sniffFile(f)
  if (!type || type === 'image/gif') { notify.warning(t('errors.codes.FILE_TYPE'), t('pay.slipRules')); return }
  if (f.size > 5 * 1024 * 1024) { notify.warning(t('errors.codes.FILE_TOO_LARGE'), t('pay.slipRules')); return }
  if (slipPreview.value) URL.revokeObjectURL(slipPreview.value)
  slip.value = f
  slipKey = crypto.randomUUID()
  slipPreview.value = URL.createObjectURL(f)
}
function clearSlip() {
  if (slipPreview.value) URL.revokeObjectURL(slipPreview.value)
  slip.value = null
  slipPreview.value = ''
}
async function submitSlip() {
  if (!slip.value) return
  uploading.value = true
  try {
    const o = props.handoffToken
      ? await api.handoff.uploadSlip(props.handoffToken, slip.value, slipKey)
      : await api.credits.uploadSlip(props.order.id, slip.value)
    emit('update', o)
    clearSlip()
    lateUpload.value = false
    // Slip2Go answers right away: say what happened in the customer's words.
    if (o.status === 'paid') notify.success(t('pay.result.paid'))
    else if (o.status === 'rejected' || (o.status === 'pending' && o.resultCode)) notify.warning(t('pay.rejectedTitle'), resultText.value(o.resultCode))
    else if (o.status === 'awaiting_review') notify.info(t('pay.reviewTitle'), o.resultCode ? resultText.value(o.resultCode) : t('pay.reviewBody'))
    else notify.success(t('pay.slipSent'), t('pay.slipSentBody'))
  } catch (e) {
    if (isApiError(e) && e.code === 'LINK_EXPIRED') { emit('linkExpired'); return }
    notify.fromError(e, { retry: submitSlip })
  } finally {
    uploading.value = false
  }
}

/** Demo mode only: stands in for the staff / Slip2Go decision. */
async function demoReview(outcome: 'paid' | 'rejected') {
  if (!api.credits.simulateReview) return
  reviewing.value = true
  try {
    await api.credits.simulateReview(props.order.id, outcome)
    emit('update', await api.credits.getOrder(props.order.id))
  } catch (e) {
    notify.fromError(e)
  } finally {
    reviewing.value = false
  }
}
const isMock = useIsMock()
/** Expired orders still take a slip: the customer may have paid in time. */
const lateUpload = ref(false)
const resultText = computed(() => (code: string | null | undefined) => (code ? t(`pay.result.${code}`) : t('pay.rejectedBody')))
const showRejection = computed(() => props.order.status === 'rejected' || (props.order.status === 'pending' && !!props.order.resultCode))

// ---- live status: poll until the order settles ----------------------------------
// Every 3 s while the payment can still change (waiting for a slip — possibly
// from the phone — or checking one, or activating); slower while staff review
// it; stopped once it is final. Paused while the tab is hidden.
const FAST_MS = 3000
const REVIEW_MS = 10_000
function pollDelay(o: PaymentOrder): number | null {
  switch (o.status) {
    case 'pending': case 'rejected': case 'verifying': return FAST_MS
    case 'awaiting_review': return REVIEW_MS
    case 'paid': return o.fulfilled === false ? FAST_MS : null
    // A late slip can still arrive for an expired order once the customer says they paid.
    case 'expired': return lateUpload.value ? FAST_MS : null
    default: return null // failed, cancelled, refunded
  }
}
let pollTimer: ReturnType<typeof setTimeout> | undefined
let polling = false
function schedulePoll() {
  clearTimeout(pollTimer)
  const d = pollDelay(props.order)
  if (d !== null) pollTimer = setTimeout(poll, d)
}
async function poll() {
  if (document.hidden) return // resumed by visibilitychange
  if (polling || uploading.value) return schedulePoll()
  polling = true
  try {
    const o = props.handoffToken ? await api.handoff.get(props.handoffToken) : await api.credits.getOrder(props.order.id)
    emit('update', o)
  } catch (e) {
    if (props.handoffToken && isApiError(e) && e.code === 'LINK_EXPIRED') { polling = false; emit('linkExpired'); return }
    /* transient: keep watching */
  }
  polling = false
  await nextTick()
  schedulePoll()
}
function onVisible() { if (!document.hidden && pollDelay(props.order) !== null) { clearTimeout(pollTimer); poll() } }
watch(() => [props.order.status, props.order.fulfilled, lateUpload.value], schedulePoll)

// ---- mobile hand-off (computer side) ----------------------------------------------
type Mode = 'phone' | 'here'
const mode = ref<Mode>('here')
/** Mouse + hover device: offer the phone hand-off. */
const desktop = ref(false)
const handoff = ref<PaymentHandoff | null>(null)
const handoffQr = computed(() => (handoff.value ? qrSvg(handoff.value.url) : ''))
const handoffState = ref<'idle' | 'loading' | 'error'>('idle')
let handoffTimer: ReturnType<typeof setTimeout> | undefined
/** The order can still be paid from a phone. */
const payable = computed(() => ['pending', 'rejected'].includes(props.order.status) || (props.order.status === 'expired' && lateUpload.value))

async function loadHandoff() {
  clearTimeout(handoffTimer)
  if (onPhone.value || mode.value !== 'phone' || !payable.value) return
  handoffState.value = 'loading'
  try {
    handoff.value = await api.credits.createHandoff(props.order.id)
    handoffState.value = 'idle'
    // New code shortly before this one expires, so a scan never lands on a dead link.
    const refreshIn = Math.max(30_000, Date.parse(handoff.value.expiresAt) - Date.now() - 2 * 60_000)
    handoffTimer = setTimeout(loadHandoff, refreshIn)
  } catch {
    handoffState.value = 'error'
  }
}
watch([mode, payable], ([m, p]) => { if (m === 'phone' && p && !handoff.value) loadHandoff() })

onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  schedulePoll()
  // A computer (mouse + hover): pay on the phone by default. Touch devices pay right here.
  if (!onPhone.value && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    desktop.value = true
    mode.value = 'phone'
    loadHandoff()
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  clearTimeout(pollTimer)
  clearTimeout(handoffTimer)
  clearSlip()
})
</script>

<template>
  <div class="space-y-5">
    <!-- Paid: delivered, or payment received and still activating -->
    <div v-if="order.status === 'paid'" class="flex flex-col items-center py-4 text-center">
      <ResultIcon type="success" :size="84" />
      <template v-if="order.fulfilled === false">
        <p class="mt-4 font-display text-2xl font-bold">{{ t('pay.activatingTitle') }}</p>
        <p class="mt-1 text-sm text-muted">{{ t('pay.activatingBody') }}</p>
      </template>
      <template v-else>
        <p class="mt-4 font-display text-2xl font-bold">{{ paidTitle }}</p>
        <p class="mt-1 text-sm text-muted">{{ order.kind === 'credits' || !order.kind ? t('pay.paidBody') : t('plan.activatedBody') }}</p>
      </template>
      <p v-if="onPhone" class="mt-4 max-w-xs rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{{ t('pay.handoff.phonePaid') }}</p>
    </div>

    <!-- Being checked with the bank right now -->
    <div v-else-if="order.status === 'verifying'" class="flex flex-col items-center py-4 text-center" role="status">
      <span class="relative grid size-20 place-items-center rounded-full bg-brand-500/10 text-brand-500">
        <span class="absolute inset-0 animate-ping rounded-full bg-brand-500/10" /><ShieldCheck class="size-9" />
      </span>
      <p class="mt-4 font-display text-xl font-bold">{{ t('pay.verifyingTitle') }}</p>
      <p class="mt-1 max-w-sm text-sm text-muted">{{ t('pay.verifyingBody') }}</p>
    </div>

    <!-- Expired / failed (a slip can still be sent: the customer may have paid in time) -->
    <div v-else-if="(order.status === 'expired' || order.status === 'failed') && !lateUpload" class="flex flex-col items-center py-4 text-center">
      <ResultIcon type="warning" :size="72" />
      <p class="mt-4 font-display text-xl font-bold">{{ t('pay.expiredTitle') }}</p>
      <p class="mt-1 text-sm text-muted">{{ onPhone ? t('pay.handoff.phoneExpired') : t('pay.expiredBody') }}</p>
      <div class="mt-4 flex flex-wrap justify-center gap-2">
        <button v-if="!onPhone" type="button" class="btn-primary" @click="emit('restart')"><RefreshCw class="size-4" />{{ t('pay.startOver') }}</button>
        <button v-if="order.status === 'expired'" type="button" class="btn-secondary" @click="lateUpload = true"><ImageUp class="size-4" />{{ t('pay.alreadyPaid') }}</button>
      </div>
    </div>

    <!-- With staff: couldn't be confirmed automatically -->
    <div v-else-if="order.status === 'awaiting_review'" class="flex flex-col items-center py-2 text-center">
      <span class="relative grid size-20 place-items-center rounded-full bg-sun/15 text-amber-600 dark:text-sun">
        <ShieldCheck class="size-9" />
      </span>
      <p class="mt-4 font-display text-xl font-bold">{{ t('pay.reviewTitle') }}</p>
      <p class="mt-1 max-w-sm text-sm text-muted">{{ order.resultCode ? resultText(order.resultCode) : t('pay.reviewBody') }}</p>
      <p class="mt-3 text-xs text-muted">{{ t('pay.reference') }}: <b class="font-mono">{{ order.reference }}</b></p>
      <div v-if="isMock && api.credits.simulateReview" class="mt-5 w-full rounded-2xl border border-dashed border-sun bg-sun/10 p-3 text-left text-sm">
        <p class="font-semibold text-amber-700 dark:text-sun">{{ t('pay.demoTitle') }}</p>
        <p class="text-xs text-muted">{{ t('pay.demoBody') }}</p>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button type="button" class="btn-secondary btn-sm" :disabled="reviewing" @click="demoReview('rejected')"><X class="size-3.5" />{{ t('pay.demoReject') }}</button>
          <button type="button" class="btn-primary btn-sm" :disabled="reviewing" @click="demoReview('paid')"><Check class="size-3.5" />{{ t('pay.demoApprove') }}</button>
        </div>
      </div>
    </div>

    <!-- Pending (or rejected → pay/upload again) -->
    <template v-else>
      <div v-if="showRejection" class="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm" role="alert">
        <p class="font-semibold text-danger">{{ t('pay.rejectedTitle') }}</p>
        <p class="mt-0.5 text-muted">{{ order.reviewNote || resultText(order.resultCode) }}</p>
      </div>

      <!-- Computer: pay on the phone (default) or right here -->
      <div v-if="desktop" class="segmented flex w-full" role="group" :aria-label="t('pay.title')">
        <button type="button" class="flex items-center justify-center gap-1.5" :aria-pressed="mode === 'phone'" @click="mode = 'phone'"><Smartphone class="size-4" />{{ t('pay.handoff.tabPhone') }}</button>
        <button type="button" class="flex items-center justify-center gap-1.5" :aria-pressed="mode === 'here'" @click="mode = 'here'"><Monitor class="size-4" />{{ t('pay.handoff.tabHere') }}</button>
      </div>

      <section v-if="desktop && mode === 'phone'" class="space-y-4">
        <div class="flex flex-col items-center rounded-3xl border border-line bg-surface p-5 text-center shadow-soft">
          <p class="font-display text-lg font-bold">{{ t('pay.handoff.scanTitle') }}</p>
          <p class="mt-0.5 font-display text-2xl font-bold tabular-nums">{{ formatTHB(order.amountSatang, locale) }}</p>
          <div class="relative mt-3 grid size-56 place-items-center rounded-2xl bg-white p-3">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-if="handoffQr" class="size-full [&>svg]:size-full" role="img" :aria-label="t('pay.handoff.scanAlt')" v-html="handoffQr" />
            <LoaderCircle v-else-if="handoffState === 'loading'" class="size-8 animate-spin text-slate-400" />
            <div v-if="handoffState === 'error'" class="absolute inset-0 grid place-items-center rounded-2xl bg-white/95 p-4 text-sm text-ink">
              <div>
                <p>{{ t('pay.handoff.loadFailed') }}</p>
                <button type="button" class="btn-secondary btn-sm mt-2" @click="loadHandoff"><RefreshCw class="size-3.5" />{{ t('pay.handoff.newCode') }}</button>
              </div>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted">{{ t('pay.handoff.refreshes') }}</p>
        </div>
        <ol class="space-y-2 text-sm">
          <li v-for="(k, i) in ['s1', 's2', 's3']" :key="k" class="flex items-start gap-3">
            <span class="grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-600 dark:text-brand-300">{{ i + 1 }}</span>
            <span class="pt-0.5">{{ t(`pay.handoff.${k}`) }}</span>
          </li>
        </ol>
        <div class="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm" role="status" aria-live="polite">
          <span class="relative flex size-2.5 shrink-0"><span class="absolute inset-0 animate-ping rounded-full bg-brand-500/60" /><span class="relative size-2.5 rounded-full bg-brand-500" /></span>
          <div><p class="font-semibold">{{ t('pay.handoff.waiting') }}</p><p class="text-xs text-muted">{{ t('pay.handoff.waitingBody') }}</p></div>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{{ t('pay.reference') }}: <b class="font-mono">{{ order.reference }}</b></span>
          <span v-if="expiresIn" class="inline-flex items-center gap-1"><Clock class="size-3.5" />{{ t('pay.payBefore', { date: expiresIn }) }}</span>
        </div>
        <p class="text-xs text-muted">{{ t('pay.handoff.privacy') }}</p>
      </section>

      <template v-else>
      <p v-if="onPhone" class="text-sm text-muted">{{ t('pay.handoff.phoneIntro') }}</p>
      <!-- 1 · Pay -->
      <section>
        <p class="section-label">1 · {{ t('pay.step1') }}</p>
        <div class="overflow-hidden rounded-3xl border border-line bg-white text-ink shadow-soft">
          <div class="bg-[#113566] px-4 py-2.5 text-center text-sm font-bold tracking-wide text-white">THAI QR PAYMENT</div>
          <div class="flex flex-col items-center px-5 pb-5 pt-3">
            <p class="rounded-full bg-[#113566]/10 px-3 py-1 text-xs font-bold text-[#113566]">PromptPay</p>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="mt-2 w-full max-w-[15rem] [&>svg]:h-auto [&>svg]:w-full" role="img" :aria-label="t('pay.qrAlt', { amount: formatTHB(order.amountSatang, locale) })" v-html="qr" />
            <p class="mt-2 font-display text-3xl font-bold tabular-nums">{{ formatTHB(order.amountSatang, locale) }}</p>
            <p class="mt-1 text-sm font-semibold">{{ payee.name }}</p>
            <p class="text-xs text-slate-500">PromptPay {{ formatPromptPayId(payee.promptpayId) }}</p>
          </div>
        </div>
        <dl class="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt class="text-muted">{{ t('pay.amount') }}</dt>
            <dd class="flex items-center gap-2 font-semibold tabular-nums">{{ amountBaht.toFixed(2) }} ฿
              <button type="button" class="btn-icon btn-ghost p-1" :aria-label="t('pay.copyAmount')" @click="copy(amountBaht.toFixed(2), t('pay.amount'))"><Copy class="size-3.5" /></button>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt class="text-muted">{{ t('pay.reference') }}</dt>
            <dd class="flex items-center gap-2 font-mono font-semibold">{{ order.reference }}
              <button type="button" class="btn-icon btn-ghost p-1" :aria-label="t('pay.copyRef')" @click="copy(order.reference, t('pay.reference'))"><Copy class="size-3.5" /></button>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt class="text-muted">{{ order.kind === 'credits' || !order.kind ? t('pay.credits') : t('plan.title') }}</dt><dd class="text-right font-semibold">{{ order.kind === 'credits' || !order.kind ? order.credits : item }}</dd>
          </div>
        </dl>
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <button type="button" class="btn-ghost btn-sm -ml-2" @click="saveQr"><Download class="size-3.5" />{{ t('pay.saveQr') }}</button>
          <span v-if="expiresIn" class="inline-flex items-center gap-1"><Clock class="size-3.5" />{{ t('pay.payBefore', { date: expiresIn }) }}</span>
        </div>
        <p class="mt-1 text-xs text-muted">{{ onPhone ? t('pay.handoff.phoneSave') : t('pay.qrHint') }}</p>
        <p class="mt-1 text-xs text-muted">{{ t('pay.qrNote') }}</p>
      </section>

      <!-- 2 · Upload slip -->
      <section>
        <p class="section-label">2 · {{ t('pay.step2') }}</p>
        <input ref="slipInput" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :aria-label="t('pay.chooseSlip')" @change="pickSlip(($event.target as HTMLInputElement).files)">
        <div v-if="slipPreview" class="flex items-center gap-3 rounded-2xl border border-line p-3">
          <img :src="slipPreview" :alt="slip?.name" class="h-20 w-14 shrink-0 rounded-lg object-cover">
          <div class="min-w-0 flex-1 text-sm"><p class="truncate font-semibold">{{ slip?.name }}</p><p class="text-xs text-muted">{{ formatBytes(slip?.size ?? 0) }}</p></div>
          <button type="button" class="btn-icon btn-ghost" :aria-label="t('common.remove')" @click="clearSlip"><X class="size-4" /></button>
        </div>
        <button v-else type="button" class="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line p-5 text-sm text-muted transition hover:border-brand-300 hover:text-fg" @click="slipInput?.click()">
          <ImageUp class="size-6" /><span class="font-semibold">{{ t('pay.chooseSlip') }}</span><span class="text-xs">{{ t('pay.slipRules') }}</span>
        </button>
        <button type="button" class="btn-primary mt-3 w-full" :disabled="!slip || uploading" @click="submitSlip">
          <Upload class="size-4" />{{ uploading ? t('common.sending') : t('pay.submitSlip') }}
        </button>
      </section>
      </template>
    </template>
  </div>
</template>
