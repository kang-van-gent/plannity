<script setup lang="ts">
import { Database, Monitor, Moon, Palette, RotateCcw, ShieldAlert, Sun, User as UserIcon } from '@lucide/vue'
import type { NoticeType } from '~/composables/useNotify'
import type { ThemePref } from '~/composables/useTheme'
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
      <div class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="s-name">{{ t('auth.name') }}</label><input id="s-name" v-model="name" class="input" maxlength="80"></div>
        <div><label class="label" for="s-email">{{ t('auth.email') }}</label><input id="s-email" :value="session.user.value?.email" class="input opacity-70" readonly></div>
        <div><span class="label">{{ t('settings.timezone') }}</span><p class="input bg-surface-2/50">Asia/Bangkok (UTC+7)</p></div>
        <div><span class="label">{{ t('settings.emailStatus') }}</span><p class="input bg-surface-2/50">{{ session.user.value?.verifiedAt ? t('settings.verified') : t('settings.unverified') }}</p></div>
      </div>
      <div class="flex justify-end"><button type="button" class="btn-primary" :disabled="savingProfile" @click="saveProfile">{{ savingProfile ? t('common.saving') : t('common.save') }}</button></div>
    </section>

    <section v-anim class="card card-pad mt-5 space-y-4">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><Palette class="size-5 text-pink" />{{ t('settings.appearance') }}</h2>
      <div>
        <span class="label">{{ t('settings.theme') }}</span>
        <div class="grid gap-3 sm:grid-cols-3">
          <button v-for="th in themes" :key="th.v" type="button" class="flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition" :class="theme.pref.value === th.v ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="theme.pref.value === th.v" @click="pickTheme(th.v, $event)">
            <component :is="th.icon" class="size-5" /><span class="font-semibold">{{ t(`settings.themes.${th.v}`) }}</span>
          </button>
        </div>
      </div>
      <div>
        <span class="label">{{ t('common.language') }}</span>
        <div class="grid gap-3 sm:grid-cols-2">
          <button v-for="l in (['th', 'en'] as const)" :key="l" type="button" class="rounded-2xl border-2 p-4 text-left font-semibold transition" :class="locale === l ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'" :aria-pressed="locale === l" @click="setLocale(l)">
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
      <button type="button" class="btn-secondary" @click="resetDemo"><RotateCcw class="size-4" />{{ t('settings.reset') }}</button>
    </section>

    <section v-anim class="card card-pad mt-5 space-y-3">
      <h2 class="flex items-center gap-2 font-display text-lg font-bold"><ShieldAlert class="size-5 text-danger" />{{ t('settings.privacy') }}</h2>
      <p class="text-sm text-muted">{{ t('settings.privacyBody') }}</p>
      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/app/content" class="btn-secondary">{{ t('content.exportCsv') }}</NuxtLink>
        <NuxtLink to="/privacy" class="btn-ghost">{{ t('footer.privacy') }}</NuxtLink>
        <button type="button" class="btn-ghost ml-auto text-danger" @click="requestDeletion">{{ t('settings.deleteRequest') }}</button>
      </div>
    </section>
  </div>
</template>
