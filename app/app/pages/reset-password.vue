<script setup lang="ts">
import { Eye, EyeOff, KeyRound, LinkIcon } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'

// Landing page for the link in the "reset password" email (?code=…).
definePageMeta({ layout: 'auth' })
const { t } = useLocale()
useSeoMeta({ title: () => t('auth.resetTitle'), robots: 'noindex, nofollow' })
const route = useRoute()
const session = useSession()
const notify = useNotify()

const code = computed(() => (typeof route.query.code === 'string' ? route.query.code : ''))
const linkBad = ref(!code.value)
const password = ref('')
const show = ref(false)
const error = ref('')
const saving = ref(false)

async function submit() {
  error.value = ''
  if (password.value.length < 8) { error.value = t('validation.password_short'); return }
  saving.value = true
  try {
    const user = await session.resetPassword(code.value, password.value)
    notify.success(t('auth.resetDone'), t('auth.welcomeBack', { name: user.name }))
    await navigateTo('/app')
  } catch (e) {
    // Strapi answers 400 for a code that's wrong or already used.
    if (isApiError(e) && e.status === 400) linkBad.value = true
    else notify.fromError(e, { retry: submit })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div v-anim class="lg:hidden"><AppLogo variant="lockup" class="h-10" eager /></div>

    <template v-if="linkBad">
      <span v-anim="1" class="mt-6 grid size-12 place-items-center rounded-2xl bg-sun/15 text-sun lg:mt-0"><LinkIcon class="size-6" /></span>
      <h1 v-anim="2" class="mt-4 font-display text-4xl font-bold">{{ t('auth.resetLinkBad') }}</h1>
      <p v-anim="3" class="mt-2 text-muted">{{ t('auth.resetLinkBadBody') }}</p>
      <NuxtLink v-anim="4" to="/login" class="btn-primary btn-lg mt-8 w-full">{{ t('auth.resetRequestNew') }}</NuxtLink>
    </template>

    <template v-else>
      <h1 v-anim="1" class="mt-6 font-display text-4xl font-bold lg:mt-0">{{ t('auth.resetTitle') }}</h1>
      <p v-anim="2" class="mt-2 text-muted">{{ t('auth.resetSubtitle') }}</p>
      <form v-anim="3" class="mt-8 space-y-4" novalidate @submit.prevent="submit">
        <div>
          <label class="label" for="new-password">{{ t('auth.newPassword') }}</label>
          <div class="relative">
            <input id="new-password" v-model="password" :type="show ? 'text' : 'password'" autocomplete="new-password" class="input pr-11" :class="error && 'input-error'" :aria-invalid="!!error" autofocus>
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" :aria-label="t('auth.togglePassword')" @click="show = !show">
              <EyeOff v-if="show" class="size-4" /><Eye v-else class="size-4" />
            </button>
          </div>
          <p v-if="error" class="field-error">{{ error }}</p>
          <p v-else class="hint">{{ t('auth.passwordHint') }}</p>
        </div>
        <button type="submit" class="btn-primary btn-lg w-full" :disabled="saving"><KeyRound class="size-5" />{{ saving ? t('common.saving') : t('auth.resetSave') }}</button>
      </form>
      <p v-anim="4" class="mt-6 text-center text-sm text-muted"><NuxtLink to="/login" class="font-semibold text-brand-600 hover:underline dark:text-brand-300">{{ t('auth.backToLogin') }}</NuxtLink></p>
    </template>
  </div>
</template>
