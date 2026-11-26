<script setup lang="ts">
import { isApiError, type ApiError } from '~/services/api/contract'
import type { PaymentOrder } from '~/types'

// Phone side of the mobile payment hand-off. Opened by scanning the QR on the
// computer: no sign-in — the signed, expiring token in the URL opens this one
// order only. The customer pays the PromptPay QR and sends the slip from here;
// the computer's checkout follows the same order and updates by itself.
definePageMeta({ layout: 'auth' })
const { t } = useLocale()
const api = useApi()
const route = useRoute()
const token = computed(() => String(route.params.token))
useSeoMeta({ title: () => t('pay.handoff.phoneTitle'), robots: 'noindex, nofollow' })
useHead({ meta: [{ name: 'referrer', content: 'no-referrer' }] })

const order = ref<PaymentOrder | null>(null)
const state = ref<'loading' | 'ready' | 'linkExpired' | 'error'>('loading')
const error = ref<ApiError | null>(null)
const orderLabel = useOrderLabel()

async function load() {
  state.value = 'loading'
  try {
    order.value = await api.handoff.get(token.value)
    state.value = 'ready'
  } catch (e) {
    error.value = isApiError(e) ? e : null
    state.value = isApiError(e) && (e.code === 'LINK_EXPIRED' || e.status === 404) ? 'linkExpired' : 'error'
  }
}
onMounted(load)
</script>

<template>
  <div>
    <h1 class="font-display text-3xl font-bold">{{ t('pay.handoff.phoneTitle') }}</h1>
    <p v-if="order" class="mt-1 text-sm text-muted">{{ orderLabel(order) }} · <span class="font-mono">{{ order.reference }}</span></p>

    <div class="mt-6">
      <div v-if="state === 'loading'" class="space-y-3" aria-busy="true">
        <div class="mx-auto aspect-square w-full max-w-[17rem] animate-pulse rounded-3xl bg-surface-2" />
        <div class="h-12 animate-pulse rounded-2xl bg-surface-2" />
      </div>

      <div v-else-if="state === 'linkExpired'" v-anim="{ from: 'scale' }" class="card flex flex-col items-center px-6 py-10 text-center" role="alert">
        <ResultIcon type="warning" :size="64" />
        <p class="mt-4 font-display text-xl font-bold">{{ t('pay.handoff.linkExpiredTitle') }}</p>
        <p class="mt-1 text-sm text-muted">{{ t('pay.handoff.linkExpiredBody') }}</p>
      </div>

      <UiErrorState v-else-if="state === 'error'" :error="error" @retry="load" />

      <CreditsPromptPayCheckout v-else-if="order" :order="order" :handoff-token="token" @update="order = $event" @link-expired="state = 'linkExpired'" />
    </div>
  </div>
</template>
