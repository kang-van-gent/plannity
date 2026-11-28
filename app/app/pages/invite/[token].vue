<script setup lang="ts">
import { Check, LogIn, MailX, UserPlus, X } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'

// Public invitation landing. Works signed out; after log in / sign up the user
// comes back here (next=/invite/:token), so the invitation survives the round trip.
definePageMeta({ layout: 'auth' })
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const session = useSession()
const brands = useBrands()
const route = useRoute()
const token = computed(() => String(route.params.token))
const here = computed(() => `/invite/${token.value}`)

const q = useQuery(() => api.invitations.preview(token.value), { watch: [token] })
useSeoMeta({ title: () => t('invite.title'), robots: 'noindex, nofollow' })

const signedIn = ref(false)
onMounted(async () => { signedIn.value = await session.ensure() })
const myEmail = computed(() => session.user.value?.email?.toLowerCase() ?? '')
const inv = computed(() => q.data.value)
const wrongAccount = computed(() => signedIn.value && !!inv.value && myEmail.value !== inv.value.email.toLowerCase())
const invalidReason = computed(() => {
  if (q.error.value) return isApiError(q.error.value) && q.error.value.code === 'INVITE_INVALID' ? 'invalid' : null
  return inv.value && inv.value.status !== 'pending' ? inv.value.status : null
})
const authQuery = computed(() => ({ next: here.value, email: inv.value?.email }))

const busy = ref<'accept' | 'decline' | null>(null)
async function accept() {
  busy.value = 'accept'
  try {
    const { brandId } = await api.invitations.accept(token.value)
    await brands.load(true)
    brands.setScope(brandId)
    notify.success(t('invite.accepted', { brand: inv.value?.brandName ?? '' }))
    await navigateTo(`/app/brands/${brandId}`)
  } catch (e) {
    notify.fromError(e)
    q.refresh({ silent: true })
  } finally {
    busy.value = null
  }
}
async function decline() {
  busy.value = 'decline'
  try {
    await api.invitations.decline(token.value)
    notify.info(t('invite.declined'))
    await navigateTo('/app')
  } catch (e) {
    notify.fromError(e)
    q.refresh({ silent: true })
  } finally {
    busy.value = null
  }
}
async function switchAccount() {
  await session.logout()
  signedIn.value = false
  await navigateTo({ path: '/login', query: authQuery.value })
}
</script>

<template>
  <div>
    <div v-anim class="lg:hidden"><AppLogo variant="lockup" class="h-10" eager /></div>

    <div v-if="!q.data.value && !q.error.value" class="mt-8 space-y-3" aria-busy="true">
      <div class="skeleton size-16 rounded-3xl" /><div class="skeleton h-8 w-3/4" /><div class="skeleton h-4 w-full" /><div class="skeleton mt-6 h-12 w-full" />
    </div>

    <UiErrorState v-else-if="q.error.value && !invalidReason" class="mt-8" :error="q.error.value" @retry="q.refresh()" />

    <!-- Expired / accepted / cancelled / bad link -->
    <div v-else-if="invalidReason" class="mt-8 text-center">
      <span v-anim="{ from: 'pop' }" class="mx-auto grid size-16 place-items-center rounded-3xl bg-surface-2 text-muted"><MailX class="size-7" /></span>
      <h1 v-anim="1" class="mt-5 font-display text-3xl font-bold">{{ t('invite.invalidTitle') }}</h1>
      <p v-anim="2" class="mt-2 text-muted">{{ t(`invite.status.${invalidReason}`) }}</p>
      <NuxtLink v-anim="3" :to="signedIn ? '/app' : '/login'" class="btn-secondary mt-6 w-full">{{ signedIn ? t('invite.goHome') : t('auth.login') }}</NuxtLink>
    </div>

    <template v-else-if="inv">
      <div class="mt-6 lg:mt-0">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="inv.brandName" :logo="inv.brandLogoUrl" :color="inv.brandColor" :size="64" />
        <h1 v-anim="1" class="mt-5 font-display text-4xl font-bold">{{ t('invite.title') }}</h1>
        <p v-anim="2" class="mt-2 text-muted">{{ t('invite.body', { inviter: inv.inviterName, brand: inv.brandName, role: t(`roles.${inv.role}`) }) }}</p>
        <div v-anim="3" class="mt-5 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
          <p><span class="text-muted">{{ t('team.role') }}:</span> <b>{{ t(`roles.${inv.role}`) }}</b> — {{ t(`roles.${inv.role}Hint`) }}</p>
          <p class="text-muted">{{ t('invite.sentTo', { email: inv.email }) }} · {{ t('invite.expires', { date: formatDate(inv.expiresAt.slice(0, 10), locale, { day: 'numeric', month: 'long' }) }) }}</p>
        </div>
      </div>

      <!-- Signed out: come back here after log in / sign up -->
      <div v-if="!signedIn" v-anim="4" class="mt-6 grid gap-2">
        <NuxtLink :to="{ path: '/login', query: authQuery }" class="btn-primary btn-lg"><LogIn class="size-5" />{{ t('invite.loginToAccept') }}</NuxtLink>
        <NuxtLink :to="{ path: '/register', query: authQuery }" class="btn-secondary btn-lg"><UserPlus class="size-5" />{{ t('invite.signupToAccept') }}</NuxtLink>
      </div>

      <!-- Signed in with another email -->
      <div v-else-if="wrongAccount" v-anim="4" class="mt-6 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p class="font-semibold">{{ t('invite.signedInAs', { email: session.user.value?.email ?? '' }) }}</p>
        <p class="mt-1 text-muted">{{ t('invite.wrongAccount', { email: inv.email }) }}</p>
        <button type="button" class="btn-secondary mt-3 w-full" @click="switchAccount">{{ t('invite.switchAccount') }}</button>
      </div>

      <div v-else v-anim="4" class="mt-6 grid grid-cols-[1fr_2fr] gap-2">
        <button type="button" class="btn-secondary btn-lg" :disabled="!!busy" @click="decline"><X class="size-5" />{{ t('invite.decline') }}</button>
        <button type="button" class="btn-primary btn-lg" :disabled="!!busy" @click="accept"><Check class="size-5" />{{ busy === 'accept' ? t('common.loading') : t('invite.accept') }}</button>
      </div>
    </template>
  </div>
</template>
