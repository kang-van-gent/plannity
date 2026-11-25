<script setup lang="ts">
import { Eye, EyeOff, MailCheck, UserPlus } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'

definePageMeta({ layout: 'auth', middleware: 'guest' })
const { t } = useLocale()
useSeoMeta({ title: () => t('auth.registerTitle') })
const session = useSession()
const notify = useNotify()
const isMock = useIsMock()
const config = useRuntimeConfig()

const step = ref<'form' | 'verify'>('form')
const route = useRoute()
// From an invitation link: pre-fill the invited email and return to the invitation afterwards.
const next = computed(() => safeNextPath(route.query.next, '/app/brands/new?onboarding=1'))
const form = reactive({ name: '', email: typeof route.query.email === 'string' ? route.query.email : '', password: '', acceptTerms: false })
const errors = reactive<Record<string, string>>({})
const show = ref(false)
const loading = ref(false)
const verifying = ref(false)

const strength = computed(() => {
  const p = form.password
  let s = 0
  if (p.length >= 8) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^\w]/.test(p) || p.length >= 12) s++
  return s
})

async function submit() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = t('validation.required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = t('validation.email')
  if (form.password.length < 8) errors.password = t('validation.password_short')
  if (!form.acceptTerms) errors.acceptTerms = t('validation.must_accept')
  if (Object.keys(errors).length) { notify.warning(t('errors.invalidInput'), t('errors.invalidInputHint')); return }
  loading.value = true
  try {
    await session.register({ ...form })
    step.value = 'verify'
    notify.info(t('auth.checkInbox'), t('auth.checkInboxBody', { email: form.email }))
  } catch (e) {
    if (isApiError(e) && e.fieldErrors) for (const [k, v] of Object.entries(e.fieldErrors)) errors[k] = t(`validation.${v}`)
    notify.fromError(e)
  } finally {
    loading.value = false
  }
}

async function verify() {
  verifying.value = true
  try {
    const granted = await session.verifyEmail()
    notify.success(t('auth.verified'), granted ? t('auth.trialGranted', { n: granted }) : t('auth.trialAlready'))
    await navigateTo(next.value)
  } catch (e) {
    notify.fromError(e, { retry: verify })
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="step === 'form'">
      <div v-anim class="lg:hidden"><AppLogo variant="lockup" class="h-10" eager /></div>
      <h1 v-anim="1" class="mt-6 font-display text-4xl font-bold lg:mt-0">{{ t('auth.registerTitle') }}</h1>
      <p v-anim="2" class="mt-2 text-muted">{{ t('auth.registerSubtitle', { n: config.public.trialCredits }) }}</p>
      <AuthSocialAuthButtons v-anim="3" class="mt-7" :next="next" />
      <p v-anim="3" class="mt-2.5 text-center text-xs text-muted">{{ t('auth.socialTerms') }} <NuxtLink to="/terms" target="_blank" class="font-semibold text-brand-600 underline dark:text-brand-300">{{ t('footer.terms') }}</NuxtLink> {{ t('common.and') }} <NuxtLink to="/privacy" target="_blank" class="font-semibold text-brand-600 underline dark:text-brand-300">{{ t('footer.privacy') }}</NuxtLink></p>
      <div v-anim="4"><div class="my-5 flex items-center gap-3 text-xs font-semibold text-muted"><span class="h-px flex-1 bg-line" />{{ t('auth.orEmail') }}<span class="h-px flex-1 bg-line" /></div></div>
      <form v-anim="5" class="space-y-4" novalidate @submit.prevent="submit">
        <div>
          <label class="label" for="name">{{ t('auth.name') }}</label>
          <input id="name" v-model="form.name" class="input" autocomplete="name" :class="errors.name && 'input-error'">
          <p v-if="errors.name" class="field-error">{{ errors.name }}</p>
        </div>
        <div>
          <label class="label" for="email">{{ t('auth.email') }}</label>
          <input id="email" v-model.trim="form.email" type="email" class="input" autocomplete="email" :class="errors.email && 'input-error'">
          <p v-if="errors.email" class="field-error">{{ errors.email }}</p>
        </div>
        <div>
          <label class="label" for="password">{{ t('auth.password') }}</label>
          <div class="relative">
            <input id="password" v-model="form.password" :type="show ? 'text' : 'password'" class="input pr-11" autocomplete="new-password" :class="errors.password && 'input-error'">
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" :aria-label="t('auth.togglePassword')" @click="show = !show">
              <EyeOff v-if="show" class="size-4" /><Eye v-else class="size-4" />
            </button>
          </div>
          <div class="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
            <span v-for="i in 4" :key="i" class="h-1.5 rounded-full transition-colors duration-300"
              :class="strength >= i ? ['bg-danger', 'bg-warning', 'bg-sky', 'bg-success'][strength - 1] : 'bg-line'" />
          </div>
          <p v-if="errors.password" class="field-error">{{ errors.password }}</p>
          <p v-else class="hint">{{ t('auth.passwordHint') }}</p>
        </div>
        <label class="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-3 text-sm" :class="errors.acceptTerms && 'border-danger'">
          <input v-model="form.acceptTerms" type="checkbox" class="mt-0.5 size-4 accent-brand-500">
          <span>{{ t('auth.acceptPrefix') }} <NuxtLink to="/terms" target="_blank" class="font-semibold text-brand-600 underline dark:text-brand-300">{{ t('footer.terms') }}</NuxtLink> {{ t('common.and') }} <NuxtLink to="/privacy" target="_blank" class="font-semibold text-brand-600 underline dark:text-brand-300">{{ t('footer.privacy') }}</NuxtLink></span>
        </label>
        <p v-if="errors.acceptTerms" class="field-error -mt-2">{{ errors.acceptTerms }}</p>
        <button type="submit" class="btn-primary btn-lg w-full" :disabled="loading"><UserPlus class="size-5" />{{ loading ? t('common.loading') : t('auth.register') }}</button>
      </form>
      <p class="mt-6 text-center text-sm text-muted">{{ t('auth.haveAccount') }} <NuxtLink to="/login" class="font-semibold text-brand-600 hover:underline dark:text-brand-300">{{ t('auth.login') }}</NuxtLink></p>
    </template>

    <div v-else class="text-center">
      <div v-anim="{ from: 'pop' }" class="mx-auto grid size-24 place-items-center rounded-[2rem] bg-gradient-to-br from-brand-500 to-pink text-white shadow-pop">
        <MailCheck class="size-11" />
      </div>
      <h1 v-anim="1" class="mt-6 font-display text-3xl font-bold">{{ t('auth.verifyTitle') }}</h1>
      <p v-anim="2" class="mt-2 text-muted">{{ t('auth.checkInboxBody', { email: form.email }) }}</p>
      <div v-if="isMock" v-anim="3" class="mt-6 rounded-3xl border border-dashed border-sun bg-sun/10 p-5 text-left">
        <p class="text-sm font-semibold text-amber-700 dark:text-sun">{{ t('common.mockBadge') }}</p>
        <p class="mt-1 text-sm text-muted">{{ t('auth.mockVerifyHint') }}</p>
        <button type="button" class="btn-primary mt-4 w-full" :disabled="verifying" @click="verify">{{ verifying ? t('common.loading') : t('auth.mockVerify') }}</button>
      </div>
    </div>
  </div>
</template>
