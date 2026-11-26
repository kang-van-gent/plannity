<script setup lang="ts">
import { Check, Clock, Copy, Download, ImageUp, RefreshCw, ShieldCheck, Upload, X } from '@lucide/vue'
import type { PaymentOrder } from '~/types'

// PromptPay checkout: scan the one-time QR (amount fixed) → pay in any Thai
// banking app → upload the slip. Credits are added only when the server marks
// the order paid (staff review today, Slip2Go auto-verification later).
const props = defineProps<{ order: PaymentOrder }>()
const emit = defineEmits<{ update: [PaymentOrder]; restart: [] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const config = useRuntimeConfig()

const payee = computed(() => props.order.payee ?? { promptpayId: String(config.public.promptpayId), name: String(config.public.promptpayName) })
const amountBaht = computed(() => props.order.amountSatang / 100)
// Our encoder only emits rect/path markup for a payload we build from server data.
const qr = computed(() => qrSvg(promptPayPayload(payee.value.promptpayId, amountBaht.value)))
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
    emit('update', await api.credits.uploadSlip(props.order.id, slip.value))
    clearSlip()
    notify.success(t('pay.slipSent'), t('pay.slipSentBody'))
  } catch (e) {
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
onBeforeUnmount(clearSlip)
</script>

<template>
  <div class="space-y-5">
    <!-- Paid -->
    <div v-if="order.status === 'paid'" class="flex flex-col items-center py-4 text-center">
      <ResultIcon type="success" :size="84" />
      <p class="mt-4 font-display text-2xl font-bold">{{ paidTitle }}</p>
      <p class="mt-1 text-sm text-muted">{{ order.kind === 'credits' || !order.kind ? t('pay.paidBody') : t('plan.activatedBody') }}</p>
    </div>

    <!-- Expired / failed -->
    <div v-else-if="order.status === 'expired' || order.status === 'failed'" class="flex flex-col items-center py-4 text-center">
      <ResultIcon type="warning" :size="72" />
      <p class="mt-4 font-display text-xl font-bold">{{ t('pay.expiredTitle') }}</p>
      <p class="mt-1 text-sm text-muted">{{ t('pay.expiredBody') }}</p>
      <button type="button" class="btn-primary mt-4" @click="emit('restart')"><RefreshCw class="size-4" />{{ t('pay.startOver') }}</button>
    </div>

    <!-- Slip received, being checked -->
    <div v-else-if="order.status === 'awaiting_review'" class="flex flex-col items-center py-2 text-center">
      <span class="relative grid size-20 place-items-center rounded-full bg-brand-500/10 text-brand-500">
        <span class="absolute inset-0 animate-ping rounded-full bg-brand-500/10" /><ShieldCheck class="size-9" />
      </span>
      <p class="mt-4 font-display text-xl font-bold">{{ t('pay.reviewTitle') }}</p>
      <p class="mt-1 max-w-sm text-sm text-muted">{{ t('pay.reviewBody') }}</p>
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
      <div v-if="order.status === 'rejected'" class="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm">
        <p class="font-semibold text-danger">{{ t('pay.rejectedTitle') }}</p>
        <p class="mt-0.5 text-muted">{{ order.reviewNote || t('pay.rejectedBody') }}</p>
      </div>

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
        <p class="mt-1 text-xs text-muted">{{ t('pay.qrHint') }}</p>
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
  </div>
</template>
