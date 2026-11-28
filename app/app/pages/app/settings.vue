<script setup lang="ts">
import { Camera, Database, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Monitor, Moon, Palette, RotateCcw, ShieldAlert, Sun, Trash2, User as UserIcon } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'
import type { NoticeType } from '~/composables/useNotify'
import type { ThemePref } from '~/composables/useTheme'
import type { FontSizePref } from '~/composables/useFontSize'
import { mockAdmin, type MockConfig } from '~/services/api/mock'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale, setLocale } = useLocale()
useSeoMeta({ title: () => t('nav.settings') })
const api = useApi()
const notify = useNotify()
const session = useSession()
const brands = useBrands()
const { refresh: refreshWallet } = useWallet()
const theme = useTheme()
const isMock = useIsMock()

const name = ref(session.user.value?.name ?? '')
watch(() => session.user.value?.name, (v) => { if (v) name.value = v })
const me = computed(() => session.user.value)
// Fresh account details (photo options, sign-in method) — the session copy can be older.
onMounted(async () => {
  try { const u = await api.auth.me(); if (session.user.value) session.user.value = { ...session.user.value, ...u } } catch { /* keep what we have */ }
})

// ---- profile photo ---------------------------------------------------------------
const photoInput = ref<HTMLInputElement | null>(null)
const photoBusy = ref<null | 'upload' | 'gravatar' | 'google' | 'none'>(null)
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
function photoError(e: unknown) {
  const code = isApiError(e) ? e.fieldErrors.avatar ?? e.fieldErrors.file : undefined
  if (code) notify.warning(t(`settings.photo.errors.${code}`))
  else notify.fromError(e)
}
async function onPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!PHOTO_TYPES.includes(file.type)) { notify.warning(t('settings.photo.errors.file_type')); return }
  if (file.size > 5 * 1024 * 1024) { notify.warning(t('settings.photo.errors.too_large')); return }
  photoBusy.value = 'upload'
  try {
    session.user.value = { ...session.user.value!, ...(await api.auth.uploadAvatar(file)) }
    notify.success(t('settings.photo.saved'))
  } catch (err) { photoError(err) } finally { photoBusy.value = null }
}
async function usePhoto(source: 'gravatar' | 'google' | 'none') {
  photoBusy.value = source
  try {
    session.user.value = { ...session.user.value!, ...(await api.auth.setAvatar(source)) }
    notify.success(source === 'none' ? t('settings.photo.removed') : t('settings.photo.saved'))
  } catch (err) { photoError(err) } finally { photoBusy.value = null }
}

// ---- password ------------------------------------------------------------------
const canChangePassword = computed(() => (me.value?.signInMethod ?? 'local') === 'local')
const pw = reactive({ current: '', next: '', show: false, saving: false, sending: false })
const pwErrors = reactive<{ current?: string; next?: string }>({})
const PW_MESSAGES: Record<string, string> = { wrong_password: 'settings.password.wrong', same_password: 'settings.password.same', password_short: 'validation.password_short', required: 'validation.required' }
async function changePassword() {
  pwErrors.current = pw.current ? undefined : t('validation.required')
  pwErrors.next = pw.next.length < 8 ? t('validation.password_short') : pw.next === pw.current ? t('settings.password.same') : undefined
  if (pwErrors.current || pwErrors.next) return
  pw.saving = true
  try {
    await api.auth.changePassword(pw.current, pw.next)
    Object.assign(pw, { current: '', next: '', show: false })
    notify.success(t('settings.password.changed'), t('settings.password.changedBody'))
  } catch (e) {
    if (isApiError(e) && (e.fieldErrors.currentPassword || e.fieldErrors.password)) {
      if (e.fieldErrors.currentPassword) pwErrors.current = t(PW_MESSAGES[e.fieldErrors.currentPassword] ?? 'validation.invalid')
      if (e.fieldErrors.password) pwErrors.next = t(PW_MESSAGES[e.fieldErrors.password] ?? 'validation.invalid')
    } else notify.fromError(e)
  } finally { pw.saving = false }
}
async function sendResetLink() {
  if (!me.value?.email) return
  pw.sending = true
  try {
    await api.auth.forgot(me.value.email)
    notify.success(t('settings.password.linkSent'), t('settings.password.linkSentBody', { email: me.value.email }))
  } catch (e) { notify.fromError(e) } finally { pw.sending = false }
}
const savingProfile = ref(false)
async function saveProfile() {
  if (!name.value.trim()) { notify.warning(t('validation.required')); return }
  savingProfile.value = true
  try {
    session.user.value = await api.auth.updateProfile({ name: name.value, locale: locale.value })
    notify.success(t('settings.profileSaved'))
  } catch (e) { notify.fromError(e) } finally { savingProfile.value = false }
}

const themes: { v: ThemePref; icon: typeof Sun }[] = [{ v: 'light', icon: Sun }, { v: 'dark', icon: Moon }, { v: 'system', icon: Monitor }]
function pickTheme(v: ThemePref, e: MouseEvent) { theme.set(v, { x: e.clientX, y: e.clientY }) }

const fontSize = useFontSize()
const fontSizes: { v: FontSizePref; px: number }[] = [{ v: 'sm', px: 13 }, { v: 'md', px: 15 }, { v: 'lg', px: 18 }, { v: 'xl', px: 21 }]

// Mock backend controls — visible only in demo mode.
const cfg = reactive<MockConfig>(isMock ? mockAdmin.getConfig() : { latency: 0, failRate: 0, itemFailRate: 0 })
watch(cfg, (v) => mockAdmin.setConfig({ ...v }), { deep: true })
async function resetDemo() {
  const ok = await notify.confirm({ title: t('settings.resetConfirm'), message: t('settings.resetConfirmBody'), tone: 'danger', confirmLabel: t('settings.reset') })
  if (!ok) return
  mockAdmin.reset()
  await brands.load(true).catch(() => {})
  await refreshWallet()
  notify.success(t('settings.resetDone'))
}

const previews: { type: NoticeType; key: string }[] = [
  { type: 'success', key: 'success' }, { type: 'warning', key: 'warning' }, { type: 'error', key: 'error' }, { type: 'cancel', key: 'cancel' }, { type: 'info', key: 'info' },
]
function preview(type: NoticeType) { notify.push(type, t(`settings.preview.${type}Title`), t(`settings.preview.${type}Body`)) }
async function previewConfirm() {
  const ok = await notify.confirm({ title: t('settings.preview.confirmTitle'), message: t('settings.preview.confirmBody'), details: [{ label: t('generate.creditsNeeded'), value: '12', emphasis: true }] })
  if (ok) notify.success(t('settings.preview.confirmed'))
}

async function requestDeletion() {
  const ok = await notify.confirm({ title: t('settings.deleteConfirm'), message: t('settings.deleteConfirmBody'), tone: 'danger', confirmLabel: t('settings.deleteRequest') })
  if (ok) notify.info(t('settings.deleteRequested'), t('settings.deleteRequestedBody'))
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <UiPageHeader :title="t('nav.settings')" :subtitle="t('settings.subtitle')" />

    <section v-anim class="card card-pad space-y-4">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><UserIcon class="size-5 text-brand-500" />{{ t('settings.profile') }}</h2>

      <!-- Profile photo: upload, email (Gravatar), Google, or initials -->
      <div class="flex flex-col gap-4 rounded-2xl bg-surface-2/60 p-4 sm:flex-row sm:items-center">
        <div class="relative self-center sm:self-auto">
          <UiAvatar :name="me?.name" :url="me?.avatarUrl" :size="80" />
          <button type="button" class="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border-2 border-surface bg-brand-500 text-white shadow-pop transition hover:bg-brand-600"
            :aria-label="t('settings.photo.upload')" :disabled="!!photoBusy" @click="photoInput?.click()">
            <LoaderCircle v-if="photoBusy === 'upload'" class="size-4 animate-spin" /><Camera v-else class="size-4" />
          </button>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPhoto">
        </div>
        <div class="min-w-0 flex-1 text-center sm:text-left">
          <p class="font-semibold">{{ t('settings.photo.title') }}</p>
          <p class="text-xs text-muted">{{ me?.avatarSource ? t(`settings.photo.source.${me.avatarSource}`) : t('settings.photo.source.none') }} · {{ t('settings.photo.hint') }}</p>
          <div class="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button type="button" class="btn-secondary btn-sm" :disabled="!!photoBusy" @click="photoInput?.click()"><Camera class="size-4" />{{ t('settings.photo.upload') }}</button>
            <button v-if="me?.avatarSource !== 'gravatar'" type="button" class="btn-secondary btn-sm" :disabled="!!photoBusy" @click="usePhoto('gravatar')">
              <LoaderCircle v-if="photoBusy === 'gravatar'" class="size-4 animate-spin" /><Mail v-else class="size-4" />{{ t('settings.photo.useEmail') }}
            </button>
            <button v-if="me?.hasGooglePhoto && me?.avatarSource !== 'google'" type="button" class="btn-secondary btn-sm" :disabled="!!photoBusy" @click="usePhoto('google')">
              <LoaderCircle v-if="photoBusy === 'google'" class="size-4 animate-spin" /><span v-else class="grid size-4 place-items-center rounded-full bg-white text-[0.625rem] font-bold text-[#4285F4]">G</span>{{ t('settings.photo.useGoogle') }}
            </button>
            <button v-if="me?.avatarSource" type="button" class="btn-ghost btn-sm text-danger" :disabled="!!photoBusy" @click="usePhoto('none')"><Trash2 class="size-4" />{{ t('settings.photo.remove') }}</button>
          </div>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="s-name">{{ t('auth.name') }}</label><input id="s-name" v-model="name" class="input" maxlength="80"></div>
        <div><label class="label" for="s-email">{{ t('auth.email') }}</label><input id="s-email" :value="session.user.value?.email" class="input opacity-70" readonly></div>
        <div><span class="label">{{ t('settings.timezone') }}</span><p class="input bg-surface-2/50">Asia/Bangkok (UTC+7)</p></div>
        <div><span class="label">{{ t('settings.emailStatus') }}</span><p class="input bg-surface-2/50">{{ session.user.value?.verifiedAt ? t('settings.verified') : t('settings.unverified') }}</p></div>
      </div>
      <div class="flex justify-end"><button type="button" class="btn-primary max-sm:w-full" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? t('common.saving') : t('common.save') }}</button></div>
    </section>

    <!-- Password -->
    <section v-anim class="card card-pad mt-5 space-y-4">
      <div>
        <h2 class="flex items-center gap-2 font-display text-lg font-bold"><KeyRound class="size-5 text-sky" />{{ t('settings.password.title') }}</h2>
        <p class="text-sm text-muted">{{ canChangePassword ? t('settings.password.subtitle') : t('settings.password.provider', { provider: me?.signInMethod === 'google' ? 'Google' : me?.signInMethod === 'apple' ? 'Apple' : 'Facebook' }) }}</p>
      </div>
      <form v-if="canChangePassword" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="changePassword">
        <div>
          <label class="label" for="pw-current">{{ t('settings.password.current') }}</label>
          <input id="pw-current" v-model="pw.current" :type="pw.show ? 'text' : 'password'" autocomplete="current-password" class="input" :class="pwErrors.current && 'input-error'" :aria-invalid="!!pwErrors.current">
          <p v-if="pwErrors.current" class="field-error">{{ pwErrors.current }}</p>
        </div>
        <div>
          <label class="label" for="pw-next">{{ t('settings.password.new') }}</label>
          <div class="relative">
            <input id="pw-next" v-model="pw.next" :type="pw.show ? 'text' : 'password'" autocomplete="new-password" class="input pr-11" :class="pwErrors.next && 'input-error'" :aria-invalid="!!pwErrors.next">
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg" :aria-label="t('auth.togglePassword')" @click="pw.show = !pw.show">
              <EyeOff v-if="pw.show" class="size-4" /><Eye v-else class="size-4" />
            </button>
          </div>
          <p v-if="pwErrors.next" class="field-error">{{ pwErrors.next }}</p>
          <p v-else class="hint">{{ t('auth.passwordHint') }}</p>
        </div>
        <div class="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" class="btn-ghost btn-sm self-start" :disabled="pw.sending" @click="sendResetLink">
            <LoaderCircle v-if="pw.sending" class="size-4 animate-spin" /><Mail v-else class="size-4" />{{ t('settings.password.forgot') }}
          </button>
          <button type="submit" class="btn-primary max-sm:w-full" :disabled="pw.saving"><KeyRound class="size-4" />{{ pw.saving ? t('common.saving') : t('settings.password.save') }}</button>
        </div>
      </form>
    </section>

    <section v-anim class="card card-pad mt-5 space-y-4">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Palette class="size-5 text-pink" />{{ t('settings.appearance') }}</h2>
      <div>
        <span class="label">{{ t('settings.theme') }}</span>
        <div class="grid grid-cols-3 gap-2 sm:gap-3">
          <button v-for="th in themes" :key="th.v" type="button" class="flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 text-center text-sm transition active:scale-[0.97] sm:flex-row sm:gap-3 sm:p-4 sm:text-left sm:text-base" :class="theme.pref.value === th.v ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="theme.pref.value === th.v" @click="pickTheme(th.v, $event)">
            <component :is="th.icon" class="size-5" /><span class="font-semibold">{{ t(`settings.themes.${th.v}`) }}</span>
          </button>
        </div>
      </div>
      <div>
        <span class="label">{{ t('settings.fontSize') }}</span>
        <div class="grid grid-cols-4 gap-2 sm:gap-3" role="group" :aria-label="t('settings.fontSize')">
          <button v-for="f in fontSizes" :key="f.v" type="button" class="flex flex-col items-center justify-end gap-1 rounded-2xl border-2 p-3 text-center transition active:scale-[0.97] sm:p-4" :class="fontSize.pref.value === f.v ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="fontSize.pref.value === f.v" @click="fontSize.set(f.v)">
            <span class="font-display font-bold leading-none" :style="{ fontSize: `${f.px}px` }" aria-hidden="true">Aa</span>
            <span class="text-xs font-semibold text-muted">{{ t(`settings.fontSizes.${f.v}`) }}</span>
          </button>
        </div>
        <p class="hint">{{ t('settings.fontSizeHint') }}</p>
      </div>
      <div>
        <span class="label">{{ t('common.language') }}</span>
        <div class="grid grid-cols-2 gap-2 sm:gap-3">
          <button v-for="l in (['th', 'en'] as const)" :key="l" type="button" class="rounded-2xl border-2 p-3 text-center font-semibold transition active:scale-[0.97] sm:p-4 sm:text-left" :class="locale === l ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="locale === l" @click="setLocale(l)">
            {{ l === 'th' ? 'ภาษาไทย' : 'English' }}
          </button>
        </div>
        <p class="hint">{{ t('settings.languageHint') }}</p>
      </div>
    </section>

    <section v-if="isMock" v-anim class="card card-pad mt-5 space-y-5 border-dashed border-sun">
      <div>
        <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Database class="size-5 text-sun" />{{ t('settings.demo') }}</h2>
        <p class="text-sm text-muted">{{ t('settings.demoHint') }}</p>
      </div>
      <div class="grid gap-5 sm:grid-cols-3">
        <label class="block text-sm"><span class="flex justify-between font-semibold">{{ t('settings.latency') }}<span class="text-muted">{{ cfg.latency }} ms</span></span><input v-model.number="cfg.latency" type="range" min="0" max="2000" step="50" class="mt-2 w-full accent-brand-500"></label>
        <label class="block text-sm"><span class="flex justify-between font-semibold">{{ t('settings.failRate') }}<span class="text-muted">{{ Math.round(cfg.failRate * 100) }}%</span></span><input v-model.number="cfg.failRate" type="range" min="0" max="0.6" step="0.05" class="mt-2 w-full accent-brand-500"></label>
        <label class="block text-sm"><span class="flex justify-between font-semibold">{{ t('settings.itemFailRate') }}<span class="text-muted">{{ Math.round(cfg.itemFailRate * 100) }}%</span></span><input v-model.number="cfg.itemFailRate" type="range" min="0" max="0.6" step="0.02" class="mt-2 w-full accent-brand-500"></label>
      </div>
      <div>
        <span class="label">{{ t('settings.previewTitle') }}</span>
        <div class="flex flex-wrap gap-2">
          <button v-for="p in previews" :key="p.type" type="button" class="btn-secondary btn-sm" @click="preview(p.type)"><ResultIcon :type="p.type" :size="18" :autoplay="false" />{{ t(`settings.preview.${p.key}`) }}</button>
          <button type="button" class="btn-secondary btn-sm" @click="previewConfirm">{{ t('settings.preview.confirm') }}</button>
        </div>
      </div>
      <button type="button" class="btn-secondary max-sm:w-full" @click="resetDemo"><RotateCcw class="size-4" />{{ t('settings.reset') }}</button>
    </section>

    <section v-anim class="card card-pad mt-5 space-y-3">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><ShieldAlert class="size-5 text-danger" />{{ t('settings.privacy') }}</h2>
      <p class="text-sm text-muted">{{ t('settings.privacyBody') }}</p>
      <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <NuxtLink to="/app/content" class="btn-secondary">{{ t('content.exportCsv') }}</NuxtLink>
        <NuxtLink to="/privacy" class="btn-ghost">{{ t('footer.privacy') }}</NuxtLink>
        <button type="button" class="btn-ghost text-danger sm:ml-auto" @click="requestDeletion">{{ t('settings.deleteRequest') }}</button>
      </div>
    </section>
  </div>
</template>
