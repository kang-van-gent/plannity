<script setup lang="ts">
import { Eye, EyeOff, LogIn, Sparkles } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'
import { DEMO_EMAIL, DEMO_PASSWORD } from '~/services/api/mock/demo'

definePageMeta({ layout: 'auth', middleware: 'guest' })
const { t } = useLocale()
useSeoMeta({ title: () => t('auth.loginTitle') })
const session = useSession()
const notify = useNotify()
const api = useApi()
const isMock = useIsMock()
const route = useRoute()

// Pre-filled when arriving from an invitation link.
const form = reactive({ email: typeof route.query.email === 'string' ? route.query.email : '', password: '' })
const errors = reactive<Record<string, string>>({})
const show = ref(false)
const loading = ref(false)
const forgotOpen = ref(false)
const forgotEmail = ref('')
const forgotSending = ref(false)
const next = computed(() => safeNextPath(route.query.next))

// Back from a failed/cancelled social sign-in (/auth/callback → /login?oauth=…).
onMounted(() => {
  // Strapi sends people here after the link in the sign-up email (?confirmed=1).
  if (route.query.confirmed === '1') {
    notify.success(t('auth.emailConfirmed'), t('auth.emailConfirmedBody'))
    navigateTo({ query: { ...route.query, confirmed: undefined } }, { replace: true })
  }
  const reason = route.query.oauth
  if (typeof reason !== 'string') return
  const provider = ({ google: 'Google', facebook: 'Facebook', apple: 'Apple' } as Record<string, string>)[String(route.query.provider)] ?? ''
  if (reason === 'cancelled') notify.info(t('auth.oauthCancelled'), t('auth.oauthCancelledBody', { provider }))
  else if (reason === 'exists') notify.warning(t('auth.oauthExists'), t('auth.oauthExistsBody'))
  else notify.error(t('auth.oauthFailed'), t('auth.oauthFailedBody', { provider }))
  navigateTo({ query: { ...route.query, oauth: undefined, provider: undefined } }, { replace: true })
})

function fillDemo() {
  form.email = DEMO_EMAIL
  form.password = DEMO_PASSWORD
}

async function submit() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.email) errors.email = t('validation.required')
  if (!form.password) errors.password = t('validation.required')
  if (Object.keys(errors).length) return
  loading.value = true
  try {
    const user = await session.login(form.email, form.password)
    notify.success(t('auth.welcomeBack', { name: user.name }), t('auth.welcomeBackBody'))
    const next = safeNextPath(route.query.next)
    await navigateTo(next)
  } catch (e) {
    if (isApiError(e) && e.status === 401) {
      errors.password = t('auth.invalidCredentials')
      notify.error(t('auth.loginFailed'), t('auth.invalidCredentials'))
    } else notify.fromError(e, { retry: submit })
  } finally {
    loading.value = false
  }
}

async function sendReset() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.value)) { notify.warning(t('validation.email')); return }
  forgotSending.value = true
  try {
    await api.auth.forgot(forgotEmail.value)
    forgotOpen.value = false
    notify.success(t('auth.resetSent'), t('auth.resetSentBody'))
  } catch (e) {
    notify.fromError(e)
  } finally {
    forgotSending.value = false
  }
}
</script>

<template>
  <div>
    <div v-anim class="lg:hidden"><AppLogo variant="lockup" class="h-10" eager /></div>
    <h1 v-anim="1" class="mt-6 font-display text-4xl font-bold lg:mt-0">{{ t('auth.loginTitle') }}</h1>
    <p v-anim="2" class="mt-2 text-muted">{{ t('auth.loginSubtitle') }}</p>

    <button v-if="isMock" v-anim="3" type="button" class="mt-6 flex w-full items-center gap-3 rounded-2xl border border-dashed border-brand-300 bg-brand-500/5 p-3 text-left text-sm transition hover:bg-brand-500/10" @click="fillDemo">
      <span class="grid size-9 place-items-center rounded-xl bg-brand-500 text-white"><Sparkles class="size-4" /></span>
      <span class="flex-1"><span class="block font-semibold">{{ t('auth.useDemo') }}</span><span class="text-xs text-muted">{{ DEMO_EMAIL }} · {{ DEMO_PASSWORD }}</span></span>
    </button>

    <AuthSocialAuthButtons v-anim="4" class="mt-6" :next="next" />
    <div v-anim="4"><div class="my-5 flex items-center gap-3 text-xs font-semibold text-muted"><span class="h-px flex-1 bg-line" />{{ t('auth.orEmail') }}<span class="h-px flex-1 bg-line" /></div></div>

    <form v-anim="5" class="space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="email">{{ t('auth.email') }}</label>
        <input id="email" v-model.trim="form.email" type="email" autocomplete="email" class="input" :class="errors.email && 'input-error'" :aria-invalid="!!errors.email">
        <p v-if="errors.email" class="field-error">{{ errors.email }}</p>
      </div>
      <div>
        <div class="flex items-center justify-between">
          <label class="label" for="password">{{ t('auth.password') }}</label>
          <button type="button" class="mb-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300" @click="forgotOpen = true; forgotEmail = form.email">{{ t('auth.forgot') }}</button>
        </div>
        <div class="relative">
          <input id="password" v-model="form.password" :type="show ? 'text' : 'password'" autocomplete="current-password" class="input pr-11" :class="errors.password && 'input-error'" :aria-invalid="!!errors.password">
          <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" :aria-label="t('auth.togglePassword')" @click="show = !show">
            <EyeOff v-if="show" class="size-4" /><Eye v-else class="size-4" />
          </button>
        </div>
        <p v-if="errors.password" class="field-error">{{ errors.password }}</p>
      </div>
      <button type="submit" class="btn-primary btn-lg w-full" :disabled="loading"><LogIn class="size-5" />{{ loading ? t('common.loading') : t('auth.login') }}</button>
    </form>
    <p v-anim="5" class="mt-6 text-center text-sm text-muted">{{ t('auth.noAccount') }} <NuxtLink to="/register" class="font-semibold text-brand-600 hover:underline dark:text-brand-300">{{ t('nav.tryFree') }}</NuxtLink></p>

    <SidePanel :open="forgotOpen" size="sm" :title="t('auth.forgotTitle')" :subtitle="t('auth.forgotSubtitle')" @close="forgotOpen = false">
      <div>
        <label class="label" for="forgot-email">{{ t('auth.email') }}</label>
        <input id="forgot-email" v-model.trim="forgotEmail" type="email" class="input" autocomplete="email" @keydown.enter.prevent="sendReset">
        <p class="hint">{{ t('auth.forgotHint') }}</p>
      </div>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="forgotSending" @click="sendReset">{{ forgotSending ? t('common.sending') : t('auth.sendReset') }}</button>
      </template>
    </SidePanel>
  </div>
</template>
