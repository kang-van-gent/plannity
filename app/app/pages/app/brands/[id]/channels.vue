<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleAlert, FlaskConical, Gem, Info, Link2, Loader2, Lock, LogOut, Plug, RefreshCw, XCircle } from '@lucide/vue'
import { isApiError } from '~/services/api/contract'
import type { ChannelProvider, MetaPageChoice, SocialCheck, SocialConnection, SocialPlatform, SocialTestResult } from '~/types'

/**
 * Brand → Social channels (plannity-context-social-publishing.md §4).
 * Each brand connects its own Facebook Page + linked Instagram (one Meta sign-in)
 * and TikTok account. Owners/admins on Team/Studio connect, test and disconnect;
 * everyone in the brand sees what's connected. "Test connection" only reads
 * from the platform — it never posts. Tokens stay on the server.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const brandQ = useQuery(() => api.brands.get(id.value), { watch: [id] })
const chQ = useQuery(() => api.social.list(id.value), { watch: [id] })
useSeoMeta({ title: () => `${t('channels.title')} · ${brandQ.data.value?.name ?? ''}` })

const brand = computed(() => brandQ.data.value)
const included = computed(() => !!brand.value?.features?.socialConnections)
const canManage = computed(() => roleCan(brand.value?.myRole, 'brand.update') && !brand.value?.locked) // owner/admin
const settings = computed(() => chQ.data.value?.settings ?? null)
const connections = computed(() => chQ.data.value?.connections ?? [])
const connOf = (p: SocialPlatform) => connections.value.find((c) => c.platform === p) ?? null

const CHANNELS: { platform: SocialPlatform; provider: ChannelProvider }[] = [
  { platform: 'facebook', provider: 'meta' },
  { platform: 'instagram', provider: 'meta' },
  { platform: 'tiktok', provider: 'tiktok' },
]
const label = (p: SocialPlatform) => PLATFORM_META[p].label
const providerReady = (p: ChannelProvider) => !!settings.value?.[p]
const anyReady = computed(() => !!settings.value && (settings.value.meta || settings.value.tiktok))

// ---- connect -----------------------------------------------------------------
const busy = ref<string | null>(null) // 'connect:meta' | 'test:<id>' | 'disconnect:<id>' | 'choose'
async function connect(provider: ChannelProvider) {
  busy.value = `connect:${provider}`
  try {
    const { url } = await api.social.connect(id.value, provider)
    window.location.assign(url)
  } catch (e) {
    busy.value = null
    if (isApiError(e) && e.fieldErrors.provider === 'not_configured') notify.warning(t('channels.errors.not_configured'))
    else notify.fromError(e)
  }
}

// ---- back from Meta/TikTok: ?social=choose|connected|error ---------------------
const pickRequest = ref<string | null>(null)
const pages = ref<MetaPageChoice[] | null>(null)
const pickedPage = ref<string | null>(null)
async function openPicker(requestId: string) {
  pickRequest.value = requestId
  pages.value = null
  pickedPage.value = null
  try {
    pages.value = await api.social.pages(id.value, requestId)
    if (pages.value.length === 1) pickedPage.value = pages.value[0]!.id
  } catch (e) {
    pickRequest.value = null
    if (isApiError(e) && e.code === 'CONFLICT') notify.warning(t('channels.errors.expired'))
    else notify.fromError(e)
  }
}
async function choosePage() {
  if (!pickRequest.value || !pickedPage.value) return
  busy.value = 'choose'
  try {
    const r = await api.social.choosePage(id.value, pickRequest.value, pickedPage.value)
    if (chQ.data.value) chQ.data.value = { ...chQ.data.value, connections: r.connections }
    pickRequest.value = null
    notify.success(t('channels.connectedToast', { list: r.connected.map(label).join(' + ') }))
  } catch (e) {
    if (isApiError(e) && e.code === 'CONFLICT') { pickRequest.value = null; notify.warning(t('channels.errors.expired')) }
    else notify.fromError(e)
  } finally {
    busy.value = null
  }
}

onMounted(() => {
  const q = route.query
  const social = typeof q.social === 'string' ? q.social : null
  if (!social) return
  if (social === 'choose' && typeof q.request === 'string') openPicker(q.request)
  else if (social === 'connected') notify.success(t('channels.connectedToast', { list: typeof q.platform === 'string' && q.platform in PLATFORM_META ? label(q.platform as SocialPlatform) : '' }))
  else if (social === 'error') {
    const reason = typeof q.reason === 'string' ? q.reason : 'failed'
    const key = ['denied', 'expired', 'no_pages', 'permission', 'failed'].includes(reason) ? reason : 'failed'
    if (key === 'denied') notify.info(t(`channels.errors.${key}`))
    else notify.warning(t(`channels.errors.${key}`))
  }
  // Clean the URL so a refresh doesn't repeat the message.
  router.replace({ query: {} })
})

// ---- test & disconnect --------------------------------------------------------
const results = ref<Record<string, SocialTestResult>>({})
async function test(c: SocialConnection) {
  busy.value = `test:${c.id}`
  try {
    const r = await api.social.test(c.id)
    results.value = { ...results.value, [c.id]: r }
    if (chQ.data.value) chQ.data.value = { ...chQ.data.value, connections: chQ.data.value.connections.map((x) => (x.id === c.id ? r.connection : x)) }
    if (r.ok) notify.success(t('channels.testOkTitle', { p: label(c.platform) }), t('channels.testOkBody'))
    else notify.warning(t('channels.testFailTitle', { p: label(c.platform) }), checkText(c.platform, r.checks.find((x) => !x.ok) ?? { key: 'reach', ok: false }))
  } catch (e) {
    notify.fromError(e)
  } finally {
    busy.value = null
  }
}
async function disconnect(c: SocialConnection) {
  const name = c.username ? `@${c.username}` : c.displayName || label(c.platform)
  const ok = await notify.confirm({ title: t('channels.disconnectTitle', { name }), message: t('channels.disconnectBody', { p: label(c.platform) }), confirmLabel: t('channels.disconnect'), tone: 'danger' })
  if (!ok) return
  busy.value = `disconnect:${c.id}`
  try {
    const list = await api.social.disconnect(c.id)
    if (chQ.data.value) chQ.data.value = { ...chQ.data.value, connections: list }
    const { [c.id]: _gone, ...rest } = results.value
    results.value = rest
    notify.success(t('channels.disconnected', { p: label(c.platform) }))
  } catch (e) {
    notify.fromError(e)
  } finally {
    busy.value = null
  }
}

/** The checks to show under a card: from this visit's test, else the last stored one. */
const checksOf = (c: SocialConnection): SocialCheck[] | null => results.value[c.id]?.checks ?? c.lastCheck
function checkText(p: SocialPlatform, ch: SocialCheck) {
  const k = `channels.checks.${ch.key}.${ch.ok ? 'ok' : 'fail'}`
  return t(k, { list: (ch.missing ?? []).join(', '), name: ch.name ?? '', used: ch.used ?? 0, total: ch.total ?? 0, p: label(p) })
}
const accountName = (c: SocialConnection) => (c.username ? `@${c.username}` : c.displayName) || c.externalAccountId
const igMissing = computed(() => !!connOf('facebook') && !connOf('instagram'))
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <UiErrorState v-if="brandQ.error.value" :error="brandQ.error.value" @retry="brandQ.refresh()" />
    <UiSkeletonList v-else-if="!brand || !brandQ.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-5 flex items-center gap-4">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="brand.name" :color="brand.color" :size="56" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[1.625rem] font-bold sm:text-3xl">{{ brand.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('channels.subtitle') }}</p>
        </div>
      </div>
      <BrandTabs :brand-id="brand.id" active="channels" />
      <BrandLockBanner :brand="brand" />

      <!-- Plan gate / readiness -->
      <section v-if="!included" v-anim class="mb-5 flex flex-wrap items-center gap-3 rounded-[1.5rem] bg-gradient-to-r from-brand-500/15 to-pink/15 p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-500/20 text-brand-600 dark:text-brand-300"><Gem class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">{{ t('channels.lockedTitle') }}</p>
          <p class="text-sm text-muted">{{ brand.isBillingOwner ? t('channels.lockedOwner') : t('channels.lockedMember') }}</p>
        </div>
        <NuxtLink v-if="brand.isBillingOwner" to="/app/plan" class="btn-primary w-full sm:w-auto">{{ t('plan.viewPlans') }}</NuxtLink>
      </section>
      <section v-else-if="settings && !anyReady" v-anim class="mb-5 flex items-start gap-3 rounded-[1.5rem] bg-sky/15 p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky/25 text-sky-700 dark:text-sky"><Plug class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">{{ t('channels.notSetUpTitle') }}</p>
          <p class="text-sm text-muted">{{ t('channels.notSetUpBody', { p: 'Meta / TikTok' }) }}</p>
        </div>
      </section>
      <section v-else v-anim class="mb-5 flex items-start gap-3 rounded-[1.5rem] bg-brand-500/10 p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-500/20 text-brand-600 dark:text-brand-300"><Link2 class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">{{ t('channels.readyTitle') }}</p>
          <p class="text-sm text-muted">{{ t('channels.readyBody') }}</p>
        </div>
      </section>
      <p v-if="settings?.fake" v-anim class="mb-4 flex items-start gap-2 rounded-2xl bg-warning/15 px-4 py-2.5 text-sm"><FlaskConical class="mt-0.5 size-4 shrink-0 text-warning" />{{ t('channels.fakeMode') }}</p>

      <UiErrorState v-if="chQ.error.value" :error="chQ.error.value" @retry="chQ.refresh()" />
      <div v-else class="grid gap-4 md:grid-cols-3">
        <article v-for="(c, i) in CHANNELS" :key="c.platform" v-anim="i" class="card card-pad flex flex-col" :data-platform="c.platform">
          <div class="flex items-center gap-2">
            <UiPlatformBadge :platform="c.platform" with-label />
            <template v-if="!included">
              <span class="chip ml-auto bg-surface-2 py-0.5 text-muted"><Lock class="size-3" />{{ t('channels.locked') }}</span>
            </template>
            <template v-else-if="connOf(c.platform)">
              <span v-if="connOf(c.platform)!.status === 'connected'" class="chip ml-auto whitespace-nowrap bg-success/15 py-0.5 text-success"><CheckCircle2 class="size-3" />{{ t('channels.connected') }}</span>
              <span v-else class="chip ml-auto whitespace-nowrap bg-danger/15 py-0.5 text-danger"><AlertTriangle class="size-3" />{{ t('channels.reconnectRequired') }}</span>
            </template>
            <span v-else-if="settings && !providerReady(c.provider)" class="chip ml-auto bg-surface-2 py-0.5 text-muted">{{ t('channels.notSetUp') }}</span>
            <span v-else class="chip ml-auto bg-surface-2 py-0.5 text-muted">{{ t('channels.notConnected') }}</span>
          </div>

          <!-- Connected account -->
          <template v-if="included && connOf(c.platform)">
            <div class="mt-4 flex items-center gap-3">
              <img v-if="connOf(c.platform)!.avatarUrl" :src="connOf(c.platform)!.avatarUrl!" alt="" class="size-11 rounded-full object-cover" referrerpolicy="no-referrer">
              <span v-else class="grid size-11 place-items-center rounded-full bg-surface-2 font-display font-bold text-muted">{{ accountName(connOf(c.platform)!).replace('@', '').slice(0, 1).toUpperCase() }}</span>
              <div class="min-w-0">
                <p class="truncate font-semibold" data-test="account">{{ accountName(connOf(c.platform)!) }}</p>
                <p v-if="connOf(c.platform)!.connectedBy" class="truncate text-xs text-muted">{{ t('channels.byOn', { name: connOf(c.platform)!.connectedBy!.name ?? '—', date: formatDateTime(connOf(c.platform)!.connectedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) }}</p>
              </div>
            </div>

            <!-- Test result -->
            <div class="mt-3 rounded-2xl bg-surface-2 p-3 text-sm" data-test="test-result">
              <p class="flex items-center gap-1.5 text-xs text-muted">
                <template v-if="connOf(c.platform)!.lastCheckedAt">
                  <span :class="connOf(c.platform)!.lastCheckOk ? 'text-success' : 'text-danger'" class="font-semibold">{{ connOf(c.platform)!.lastCheckOk ? t('channels.working') : t('channels.notWorking') }}</span>
                  · {{ t('channels.lastTest', { when: relativeTime(connOf(c.platform)!.lastCheckedAt!, locale) }) }}
                </template>
                <template v-else>{{ t('channels.neverTested') }}</template>
              </p>
              <ul v-if="checksOf(connOf(c.platform)!)?.length" class="mt-2 space-y-1">
                <li v-for="ch in checksOf(connOf(c.platform)!)" :key="ch.key" class="flex items-start gap-1.5">
                  <CheckCircle2 v-if="ch.ok" class="mt-0.5 size-3.5 shrink-0 text-success" />
                  <XCircle v-else class="mt-0.5 size-3.5 shrink-0 text-danger" />
                  <span>{{ checkText(c.platform, ch) }}</span>
                </li>
              </ul>
            </div>
            <p v-if="c.platform === 'tiktok' && settings?.tiktokPrivateOnly" class="mt-2 flex items-start gap-1.5 text-xs text-muted"><Info class="mt-0.5 size-3.5 shrink-0" />{{ t('channels.tiktokPrivate') }}</p>

            <div class="mt-auto flex flex-wrap gap-2 pt-4">
              <template v-if="canManage">
                <button type="button" class="btn-secondary flex-1" :disabled="!!busy" data-test="test" @click="test(connOf(c.platform)!)">
                  <Loader2 v-if="busy === `test:${connOf(c.platform)!.id}`" class="size-4 animate-spin" /><FlaskConical v-else class="size-4" />
                  {{ busy === `test:${connOf(c.platform)!.id}` ? t('channels.testing') : t('channels.test') }}
                </button>
                <button v-if="connOf(c.platform)!.status === 'reconnect_required'" type="button" class="btn-primary flex-1" :disabled="!!busy || !providerReady(c.provider)" @click="connect(c.provider)">
                  <RefreshCw class="size-4" />{{ t('channels.reconnect') }}
                </button>
                <button type="button" class="btn-ghost text-danger" :disabled="!!busy" :aria-label="t('channels.disconnect')" :title="t('channels.disconnect')" data-test="disconnect" @click="disconnect(connOf(c.platform)!)">
                  <Loader2 v-if="busy === `disconnect:${connOf(c.platform)!.id}`" class="size-4 animate-spin" /><LogOut v-else class="size-4" />
                </button>
              </template>
            </div>
          </template>

          <!-- Not connected -->
          <template v-else>
            <p class="mt-3 text-sm text-muted">{{ t(`channels.what.${c.platform}`) }}</p>
            <p v-if="included" class="mt-3 text-xs text-muted"><span class="font-semibold text-ink">{{ t('channels.needTitle') }}:</span> {{ t(`channels.need.${c.platform}`) }}</p>
            <p v-if="included && c.platform === 'instagram' && igMissing" class="mt-2 flex items-start gap-1.5 rounded-xl bg-warning/15 p-2 text-xs"><CircleAlert class="mt-0.5 size-3.5 shrink-0 text-warning" />{{ t('channels.igNotLinked') }}</p>
            <div class="mt-auto pt-4">
              <button v-if="!included" type="button" class="btn-secondary w-full" disabled :title="t('channels.lockedTitle')">
                <Lock class="size-4" />{{ t('channels.connectLocked') }}
              </button>
              <button v-else-if="canManage" type="button" class="btn-primary w-full" :disabled="!!busy || !providerReady(c.provider)" :data-test="`connect-${c.platform}`" @click="connect(c.provider)">
                <Loader2 v-if="busy === `connect:${c.provider}`" class="size-4 animate-spin" /><Plug v-else class="size-4" />
                {{ c.provider === 'meta' ? t('channels.connectWithMeta') : t('channels.connectWithTiktok') }}
              </button>
            </div>
          </template>
        </article>
      </div>

      <p v-if="included" v-anim class="mt-4 flex items-start gap-2 text-sm text-muted"><Info class="mt-0.5 size-4 shrink-0" />{{ t('channels.metaTogether') }}</p>
      <p v-if="included && !canManage" v-anim class="mt-2 flex items-start gap-2 text-sm text-muted"><Info class="mt-0.5 size-4 shrink-0" />{{ t('channels.adminsOnly') }}</p>
      <p v-anim class="mt-5 rounded-2xl bg-surface-2 p-4 text-sm text-muted">{{ t('channels.manualMeanwhile') }}</p>
    </template>

    <!-- Choose the Facebook Page after signing in with Meta -->
    <SidePanel :open="!!pickRequest" size="sm" :title="t('channels.choose.title')" :subtitle="t('channels.choose.subtitle', { brand: brand?.name ?? '' })" :guard="false" @close="pickRequest = null">
      <p v-if="!pages" class="flex items-center gap-2 text-sm text-muted"><Loader2 class="size-4 animate-spin" />{{ t('channels.choose.loading') }}</p>
      <div v-else class="space-y-2" role="radiogroup">
        <label v-for="p in pages" :key="p.id" class="flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition" :class="pickedPage === p.id ? 'border-brand-500 bg-brand-500/10' : 'border-line hover:bg-surface-2'" data-test="page-option">
          <input v-model="pickedPage" type="radio" name="page" :value="p.id" class="sr-only">
          <img v-if="p.pictureUrl" :src="p.pictureUrl" alt="" class="size-10 rounded-full object-cover" referrerpolicy="no-referrer">
          <span v-else class="grid size-10 place-items-center rounded-full bg-surface-2 font-display font-bold text-muted">{{ p.name.slice(0, 1).toUpperCase() }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ p.name }}</span>
            <span class="flex items-center gap-1 text-xs" :class="p.instagram ? 'text-ink' : 'text-muted'">
              <UiPlatformBadge v-if="p.instagram" platform="instagram" size="xs" />{{ p.instagram ? t('channels.choose.withIg', { u: p.instagram.username ?? p.instagram.name ?? '' }) : t('channels.choose.noIg') }}
            </span>
          </span>
          <CheckCircle2 v-if="pickedPage === p.id" class="size-5 shrink-0 text-brand-500" />
        </label>
      </div>
      <template #footer>
        <button type="button" class="btn-primary w-full" :disabled="!pickedPage || busy === 'choose'" data-test="choose-confirm" @click="choosePage">
          <Loader2 v-if="busy === 'choose'" class="size-4 animate-spin" />{{ t('channels.choose.confirm') }}
        </button>
      </template>
    </SidePanel>
  </div>
</template>
