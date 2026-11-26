<script setup lang="ts">
import { Handshake, Megaphone, MessagesSquare, Send, ShieldCheck, Users } from '@lucide/vue'
import type { Content, InquiryStatus, PromotionInput, PromotionService } from '~/types'
import { OBJECTIVES, PLATFORMS } from '~/types'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const opt = useSelectOptions()
useSeoMeta({ title: () => t('nav.promote') })
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const route = useRoute()

const list = useQuery(() => api.promotions.list())
const linked = ref<Content | null>(null)
const SERVICES: { key: PromotionService; icon: typeof Users }[] = [
  { key: 'creator_collab', icon: Users }, { key: 'community_promo', icon: MessagesSquare }, { key: 'campaign_consult', icon: Handshake },
]
const STATUS_STYLE: Record<InquiryStatus, string> = {
  submitted: 'bg-brand-500/12 text-brand-600 dark:text-brand-300', contacted: 'bg-sky/15 text-sky-700 dark:text-sky',
  quoted: 'bg-sun/20 text-amber-700 dark:text-sun', closed: 'bg-slate-500/10 text-muted',
}

const blank = () => ({ serviceType: 'creator_collab' as PromotionService, brandId: brands.currentBrandId.value ?? brands.active.value[0]?.id ?? '', platform: 'instagram' as PromotionInput['platform'], postUrl: '', objective: 'awareness' as PromotionInput['objective'], budget: 5000, brief: '', consent: false })
const form = reactive(blank())
const errors = reactive<Record<string, string>>({})
const sending = ref(false)

onMounted(async () => {
  await brands.load().catch(() => {})
  if (!form.brandId) form.brandId = brands.active.value[0]?.id ?? ''
  const cid = typeof route.query.content === 'string' ? route.query.content : null
  if (cid) {
    try {
      linked.value = await api.contents.get(cid)
      Object.assign(form, { brandId: linked.value.brandId, platform: linked.value.platform, objective: linked.value.objective, postUrl: linked.value.postUrl ?? '' })
    } catch (e) { notify.fromError(e) }
  }
})

async function submit() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.brandId) errors.brandId = t('validation.required')
  if (form.brief.trim().length < 10) errors.brief = t('validation.brief_short')
  if (!Number.isFinite(form.budget) || form.budget < 0) errors.budget = t('validation.invalid_budget')
  if (form.postUrl && !/^https?:\/\//i.test(form.postUrl)) errors.postUrl = t('validation.invalid_url')
  if (!form.consent) errors.consent = t('validation.consent_required')
  if (Object.keys(errors).length) { notify.warning(t('errors.invalidInput'), errors.consent ? t('promote.consentNeeded') : t('errors.invalidInputHint')); return }
  sending.value = true
  try {
    const inq = await api.promotions.create({
      serviceType: form.serviceType, brandId: form.brandId, contentId: linked.value?.id ?? null, platform: form.platform, postUrl: form.postUrl || null,
      objective: form.objective, budgetSatang: Math.round(form.budget * 100), brief: form.brief, consent: form.consent,
    })
    notify.success(t('promote.sent'), t('promote.sentBody', { ref: inq.reference }))
    Object.assign(form, blank())
    linked.value = null
    list.refresh({ silent: true })
  } catch (e) {
    if (isApiError(e)) for (const [k, v] of Object.entries(e.fieldErrors)) errors[k] = t(`validation.${v}`)
    notify.fromError(e)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <section v-anim class="relative mb-5 overflow-hidden rounded-[1.75rem] bg-ink p-5 text-white sm:mb-6 sm:rounded-[2rem] sm:p-10" data-parallax-root>
      <div v-parallax="-40" class="absolute -right-16 -top-20 size-72 rounded-full bg-brand-500/50 blur-3xl" />
      <div v-parallax="-20" class="absolute -bottom-24 left-10 size-64 rounded-full bg-pink/40 blur-3xl" />
      <div class="relative max-w-2xl">
        <span class="eyebrow bg-white/10 text-sun"><Megaphone class="size-3.5" />Upstify</span>
        <h1 class="mt-3 font-display text-[28px] font-bold leading-tight sm:text-4xl">{{ t('promote.title') }}</h1>
        <p class="mt-2 text-white/75">{{ t('promote.subtitle') }}</p>
        <ul class="mt-4 flex flex-wrap gap-2 text-xs">
          <li v-for="(x, i) in [t('promote.point1'), t('promote.point2'), t('promote.point3')]" :key="i" class="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ShieldCheck class="size-3.5 text-lime" />{{ x }}</li>
        </ul>
      </div>
    </section>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_1fr]">
      <form v-anim class="card card-pad space-y-5" novalidate @submit.prevent="submit">
        <div>
          <span class="label">{{ t('promote.service') }}</span>
          <div class="grid gap-2 sm:grid-cols-3 sm:gap-3">
            <button v-for="s in SERVICES" :key="s.key" type="button" class="pressable grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-2xl border-2 p-3 text-left sm:block sm:p-4" :class="form.serviceType === s.key ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="form.serviceType === s.key" @click="form.serviceType = s.key">
              <component :is="s.icon" class="row-span-2 mt-0.5 size-5" :class="form.serviceType === s.key ? 'text-brand-500' : 'text-muted'" />
              <p class="font-semibold sm:mt-2">{{ t(`promote.services.${s.key}`) }}</p>
              <p class="text-xs text-muted">{{ t(`promote.services.${s.key}Hint`) }}</p>
            </button>
          </div>
        </div>
        <div v-if="linked" class="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <UiPlatformBadge :platform="linked.platform" /><span class="min-w-0 flex-1 truncate"><span class="text-muted">{{ t('promote.linkedContent') }}:</span> <b>{{ linked.title }}</b></span>
          <button type="button" class="btn-ghost btn-sm" @click="linked = null">{{ t('common.remove') }}</button>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div><label class="label" for="p-brand">{{ t('generate.brand') }}</label><UiSelect id="p-brand" v-model="form.brandId" :options="opt.brandList(brands.active.value)" :invalid="!!errors.brandId" /><p v-if="errors.brandId" class="field-error">{{ errors.brandId }}</p></div>
          <div><label class="label" for="p-platform">{{ t('content.fields.platform') }}</label><UiSelect id="p-platform" v-model="form.platform" :options="opt.platforms.value" /></div>
          <div><label class="label" for="p-obj">{{ t('content.fields.objective') }}</label><UiSelect id="p-obj" v-model="form.objective" :options="opt.objectives.value" /></div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="p-url">{{ t('content.postUrl') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><input id="p-url" v-model.trim="form.postUrl" type="url" class="input" placeholder="https://" :class="errors.postUrl && 'input-error'"><p v-if="errors.postUrl" class="field-error">{{ errors.postUrl }}</p></div>
          <div><label class="label" for="p-budget">{{ t('promote.budget') }}</label><input id="p-budget" v-model.number="form.budget" type="number" min="0" step="500" class="input" :class="errors.budget && 'input-error'"><p class="hint">{{ formatTHB(Math.round((form.budget || 0) * 100), locale) }} · {{ t('promote.budgetHint') }}</p></div>
        </div>
        <div>
          <label class="label" for="p-brief">{{ t('promote.brief') }}</label>
          <textarea id="p-brief" v-model="form.brief" class="input" rows="5" maxlength="2000" :placeholder="t('promote.briefPh')" :class="errors.brief && 'input-error'" />
          <p v-if="errors.brief" class="field-error">{{ errors.brief }}</p>
        </div>
        <label class="flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm" :class="errors.consent ? 'border-danger bg-danger/5' : 'border-line'">
          <input v-model="form.consent" type="checkbox" class="mt-0.5 size-4 accent-brand-500">
          <span><b>{{ t('promote.consentTitle') }}</b><br><span class="text-muted">{{ t('promote.consentBody') }}</span></span>
        </label>
        <div class="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p class="text-center text-xs text-muted sm:text-left">{{ t('promote.noCredits') }}</p>
          <button type="submit" class="btn-primary max-sm:w-full" :disabled="sending"><Send class="size-4" />{{ sending ? t('common.sending') : t('promote.submit') }}</button>
        </div>
      </form>

      <section v-anim class="card h-fit overflow-hidden">
        <h2 class="border-b border-line px-5 py-4 font-display text-lg font-bold">{{ t('promote.myInquiries') }}</h2>
        <UiErrorState v-if="list.error.value" compact :error="list.error.value" class="m-4" @retry="list.refresh()" />
        <UiSkeletonList v-else-if="!list.data.value" :rows="2" class="p-4" />
        <p v-else-if="!list.data.value.length" class="p-6 text-center text-sm text-muted">{{ t('promote.none') }}</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="i in list.data.value" :key="i.id" class="px-4 py-3.5 text-sm sm:px-5 sm:py-4">
            <div class="flex items-center gap-2"><span class="font-mono text-xs font-bold">{{ i.reference }}</span><span class="chip ml-auto" :class="STATUS_STYLE[i.status]">{{ t(`promote.status.${i.status}`) }}</span></div>
            <p class="mt-1 font-semibold">{{ t(`promote.services.${i.serviceType}`) }} · {{ brands.byId(i.brandId)?.name }}</p>
            <p class="mt-1 line-clamp-2 text-muted">{{ i.brief }}</p>
            <p class="mt-1 text-xs text-muted">{{ formatTHB(i.budgetSatang, locale) }} · {{ formatDateTime(i.createdAt, locale) }}</p>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
