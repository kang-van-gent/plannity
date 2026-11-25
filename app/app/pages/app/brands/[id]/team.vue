<script setup lang="ts">
import { ArrowLeft, Check, Copy, Crown, LogOut, Mail, RefreshCw, Send, Trash2, UserPlus, Users, X } from '@lucide/vue'
import type { BrandInvitation, BrandMember, BrandRole, InviteResult } from '~/types'
import { isApiError } from '~/services/api/contract'
import { INVITABLE_ROLES, leaveError, removeError, roleCan, roleChangeError } from '~/utils/permissions'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()
const brands = useBrands()
const route = useRoute()
const id = computed(() => String(route.params.id))

const brandQ = useQuery(() => api.brands.get(id.value), { watch: [id] })
const q = useQuery(() => api.team.get(id.value), { watch: [id] })
useSeoMeta({ title: () => `${t('team.title')} · ${brandQ.data.value?.name ?? ''}` })

const myRole = computed<BrandRole | null>(() => brandQ.data.value?.myRole ?? null)
const team = computed(() => q.data.value)
const owners = computed(() => team.value?.members.filter((m) => m.role === 'owner').length ?? 0)
const seatsLeft = computed(() => (team.value ? team.value.maxSeats - team.value.seatsUsed : 0))
const canInvite = computed(() => roleCan(myRole.value, 'member.invite'))
const solo = computed(() => !!team.value && team.value.members.length <= 1 && !team.value.invitations.length)
const me = computed(() => team.value?.members.find((m) => m.isYou))

// Roles the current user may give `m` (Owners: any; Admins: not ownership).
function roleOptions(m: BrandMember): BrandRole[] {
  if (!myRole.value) return []
  return (['owner', 'admin', 'editor', 'viewer'] as BrandRole[]).filter((r) => r === m.role || !roleChangeError(myRole.value!, m.role, r, owners.value))
}
const canRemove = (m: BrandMember) => !m.isYou && !!myRole.value && !removeError(myRole.value, m.role, owners.value)
const canLeave = computed(() => !!me.value && !leaveError(me.value.role, owners.value))

const busy = ref<string | null>(null)
async function act(key: string, fn: () => Promise<unknown>, done?: string) {
  busy.value = key
  try {
    await fn()
    if (done) notify.success(done)
    await q.refresh({ silent: true })
  } catch (e) {
    notify.fromError(e)
    await q.refresh({ silent: true }) // e.g. someone else already changed it
  } finally {
    busy.value = null
  }
}

function changeRole(m: BrandMember, role: BrandRole) {
  if (role === m.role) return
  act(`role:${m.id}`, () => api.team.updateRole(id.value, m.id, role), t('team.roleChanged', { name: m.name, role: t(`roles.${role}`) }))
}
async function remove(m: BrandMember) {
  const ok = await notify.confirm({ title: t('team.removeConfirm', { name: m.name, brand: brandQ.data.value?.name ?? '' }), message: t('team.removeConfirmBody'), confirmLabel: t('team.remove'), tone: 'danger' })
  if (ok) act(`rm:${m.id}`, () => api.team.remove(id.value, m.id), t('team.removed'))
}
async function cancelInvite(i: BrandInvitation) {
  const ok = await notify.confirm({ title: t('team.cancelConfirm', { email: i.email }), confirmLabel: t('team.cancelInvite'), tone: 'warning', notifyOnCancel: false })
  if (ok) act(`cx:${i.id}`, () => api.team.cancel(id.value, i.id), t('team.cancelled'))
}
async function resend(i: BrandInvitation) {
  busy.value = `rs:${i.id}`
  try {
    showResult(await api.team.resend(id.value, i.id), true)
  } catch (e) {
    notify.fromError(e)
  } finally {
    busy.value = null
    q.refresh({ silent: true })
  }
}
async function leave() {
  const name = brandQ.data.value?.name ?? ''
  const ok = await notify.confirm({ title: t('team.leaveConfirm', { brand: name }), message: t('team.leaveConfirmBody'), confirmLabel: t('team.leave'), tone: 'danger' })
  if (!ok) return
  try {
    await api.team.leave(id.value)
    await brands.load(true)
    if (brands.scope.value === id.value) brands.setScope('all')
    notify.success(t('team.left', { brand: name }))
    await navigateTo('/app/brands')
  } catch (e) {
    notify.fromError(e)
  }
}

// ---- invite panel ----------------------------------------------------------
const inviteOpen = ref(false)
const form = reactive({ email: '', role: 'editor' as BrandRole })
const formError = ref('')
const sending = ref(false)
const result = ref<(InviteResult & { resent?: boolean }) | null>(null)
const copied = ref(false)

function openInvite() {
  Object.assign(form, { email: '', role: 'editor' })
  formError.value = ''
  result.value = null
  inviteOpen.value = true
}
function showResult(r: InviteResult, resent = false) {
  if (r.emailSent) {
    notify.success(resent ? t('team.resent') : t('team.invited'), t('team.invitedEmailed', { email: r.invitation.email }))
    inviteOpen.value = false
    return
  }
  result.value = { ...r, resent }
  copied.value = false
  inviteOpen.value = true
}
async function sendInvite() {
  formError.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { formError.value = t('validation.email'); return }
  sending.value = true
  try {
    showResult(await api.team.invite(id.value, { email: form.email.trim(), role: form.role }))
    q.refresh({ silent: true })
  } catch (e) {
    if (isApiError(e) && e.fieldErrors.email) formError.value = t(`validation.${e.fieldErrors.email}`)
    notify.fromError(e)
  } finally {
    sending.value = false
  }
}
async function copyLink() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value.inviteUrl)
    copied.value = true
    notify.success(t('team.linkCopied'))
  } catch {
    // Clipboard blocked: the link stays selectable in the field.
  }
}
const initials = (s: string) => s.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <NuxtLink to="/app/brands" class="btn-ghost btn-sm mb-4 -ml-2"><ArrowLeft class="size-4" />{{ t('nav.brands') }}</NuxtLink>

    <UiErrorState v-if="brandQ.error.value || q.error.value" :error="(brandQ.error.value ?? q.error.value)!" @retry="brandQ.refresh(); q.refresh()" />
    <UiSkeletonList v-else-if="!brandQ.data.value || !team || !q.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-5 flex items-center gap-4">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="brandQ.data.value.name" :color="brandQ.data.value.color" :size="56" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[26px] font-bold sm:text-3xl">{{ brandQ.data.value.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('team.subtitle', { brand: brandQ.data.value.name }) }}</p>
        </div>
      </div>
      <BrandTabs :brand-id="brandQ.data.value.id" active="team" />

      <!-- Seats -->
      <section v-anim class="card card-pad">
        <div class="flex flex-wrap items-center gap-3">
          <span class="grid size-10 place-items-center rounded-2xl bg-brand-500/10 text-brand-500"><Users class="size-5" /></span>
          <div class="min-w-0 flex-1">
            <p class="font-display text-lg font-bold">{{ t('team.seats', { used: team.seatsUsed, max: team.maxSeats }) }}</p>
            <p class="text-xs text-muted">{{ t('team.seatsHint') }}</p>
          </div>
          <button v-if="canInvite" type="button" class="btn-primary max-sm:w-full" :disabled="seatsLeft <= 0" @click="openInvite"><UserPlus class="size-4" />{{ t('team.invite') }}</button>
        </div>
        <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2" role="meter" :aria-valuenow="team.seatsUsed" :aria-valuemax="team.maxSeats">
          <span class="h-full rounded-full bg-gradient-to-r from-brand-500 to-pink transition-all" :style="{ width: `${Math.min(100, (team.seatsUsed / team.maxSeats) * 100)}%` }" />
        </div>
        <div v-if="canInvite && seatsLeft <= 0" class="mt-4 rounded-2xl bg-sun/15 p-3 text-sm">
          <p class="font-semibold text-amber-700 dark:text-sun">{{ t('team.seatLimitTitle') }}</p>
          <p class="mt-0.5 text-muted">{{ t('team.seatLimitBody', { n: team.maxSeats }) }}</p>
        </div>
      </section>

      <!-- Solo: invite prompt -->
      <UiEmptyState v-if="solo && canInvite" :icon="UserPlus" :title="t('team.emptyTitle')" :message="t('team.emptyBody')" class="mt-4">
        <button type="button" class="btn-primary" :disabled="seatsLeft <= 0" @click="openInvite"><UserPlus class="size-4" />{{ t('team.invite') }}</button>
      </UiEmptyState>

      <!-- Members -->
      <section v-anim class="card mt-4 overflow-hidden">
        <h2 class="border-b border-line px-4 py-3.5 font-display text-lg font-bold sm:px-5">{{ t('team.members') }} <span class="text-sm font-semibold text-muted">· {{ team.members.length }}</span></h2>
        <ul class="divide-y divide-line">
          <li v-for="m in team.members" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pink font-display text-sm font-bold text-white">{{ initials(m.name || m.email) }}</span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 truncate font-semibold">
                {{ m.name }}
                <span v-if="m.isYou" class="chip bg-brand-500/10 py-0.5 text-brand-600 dark:text-brand-300">{{ t('team.you') }}</span>
                <span v-if="m.role === 'owner' && owners === 1" class="chip bg-sun/15 py-0.5 text-amber-700 dark:text-sun"><Crown class="size-3" />{{ t('team.lastOwner') }}</span>
              </p>
              <p class="truncate text-xs text-muted">{{ m.email }} · {{ t('team.joined', { date: formatDate(m.joinedAt.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) }}</p>
            </div>
            <div class="flex w-full items-center gap-2 sm:w-auto">
              <select v-if="roleOptions(m).length > 1" class="input pill flex-1 sm:flex-none" :value="m.role" :disabled="busy === `role:${m.id}`" :aria-label="`${t('team.role')}: ${m.name}`"
                @change="changeRole(m, ($event.target as HTMLSelectElement).value as BrandRole)">
                <option v-for="r in roleOptions(m)" :key="r" :value="r">{{ t(`roles.${r}`) }}</option>
              </select>
              <span v-else class="chip bg-surface-2 text-muted">{{ t(`roles.${m.role}`) }}</span>
              <button v-if="canRemove(m)" type="button" class="btn-icon btn-ghost text-danger" :disabled="busy === `rm:${m.id}`" :aria-label="`${t('team.remove')} ${m.name}`" :title="t('team.remove')" @click="remove(m)">
                <Trash2 class="size-4" />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Pending invitations -->
      <section v-if="team.invitations.length" v-anim class="card mt-4 overflow-hidden">
        <h2 class="border-b border-line px-4 py-3.5 font-display text-lg font-bold sm:px-5">{{ t('team.pending') }} <span class="text-sm font-semibold text-muted">· {{ team.invitations.length }}</span></h2>
        <ul class="divide-y divide-line">
          <li v-for="i in team.invitations" :key="i.id" class="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <span class="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line text-muted"><Mail class="size-4" /></span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">{{ i.email }}</p>
              <p class="truncate text-xs text-muted">{{ t('team.invitedBy', { name: i.invitedByName }) }} · {{ t('team.expires', { date: formatDate(i.expiresAt.slice(0, 10), locale, { day: 'numeric', month: 'short' }) }) }}</p>
            </div>
            <div class="flex w-full items-center gap-2 sm:w-auto">
              <span class="chip bg-surface-2 text-muted">{{ t(`roles.${i.role}`) }}</span>
              <template v-if="canInvite">
                <button type="button" class="btn-secondary btn-sm ml-auto sm:ml-0" :disabled="busy === `rs:${i.id}`" @click="resend(i)"><RefreshCw class="size-3.5" :class="busy === `rs:${i.id}` && 'animate-spin'" />{{ t('team.resend') }}</button>
                <button type="button" class="btn-ghost btn-sm text-danger" :disabled="busy === `cx:${i.id}`" @click="cancelInvite(i)"><X class="size-3.5" />{{ t('team.cancelInvite') }}</button>
              </template>
            </div>
          </li>
        </ul>
      </section>

      <div v-if="canLeave" class="mt-6 flex justify-end">
        <button type="button" class="btn-ghost text-danger max-sm:w-full" @click="leave"><LogOut class="size-4" />{{ t('team.leave') }}</button>
      </div>
    </template>

    <!-- Invite panel: form, then (without email) the one-time link to share -->
    <SidePanel :open="inviteOpen" size="sm" :title="t('team.inviteTitle', { brand: brandQ.data.value?.name ?? '' })" :subtitle="t('team.inviteHint')" :guard="!result" @close="inviteOpen = false">
      <template v-if="!result">
        <div>
          <label class="label" for="inv-email">{{ t('team.email') }}</label>
          <input id="inv-email" v-model="form.email" type="email" autocomplete="off" class="input" :class="formError && 'input-error'" placeholder="designer@example.com" @keydown.enter.prevent="sendInvite">
          <p v-if="formError" class="field-error">{{ formError }}</p>
        </div>
        <fieldset>
          <legend class="label">{{ t('team.role') }}</legend>
          <div class="grid gap-2">
            <label v-for="r in INVITABLE_ROLES" :key="r" class="pressable flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3"
              :class="form.role === r ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'">
              <input v-model="form.role" type="radio" name="inv-role" :value="r" class="mt-1 accent-brand-500">
              <span><span class="block font-semibold">{{ t(`roles.${r}`) }}</span><span class="block text-xs text-muted">{{ t(`roles.${r}Hint`) }}</span></span>
            </label>
          </div>
        </fieldset>
      </template>
      <template v-else>
        <div class="flex flex-col items-center text-center">
          <ResultIcon type="success" :size="72" />
          <p class="mt-4 font-display text-lg font-bold">{{ result.resent ? t('team.resent') : t('team.invited') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('team.invitedLink', { email: result.invitation.email }) }}</p>
        </div>
        <div class="flex gap-2">
          <input :value="result.inviteUrl" readonly class="input font-mono text-xs" :aria-label="t('team.copyLink')" @focus="($event.target as HTMLInputElement).select()">
          <button type="button" class="btn-primary shrink-0" @click="copyLink"><Check v-if="copied" class="size-4" /><Copy v-else class="size-4" /><span class="max-sm:hidden">{{ t('team.copyLink') }}</span></button>
        </div>
      </template>
      <template #footer="{ close }">
        <template v-if="!result">
          <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
          <button type="button" class="btn-primary" :disabled="sending" @click="sendInvite"><Send class="size-4" />{{ sending ? t('team.sending') : t('team.send') }}</button>
        </template>
        <button v-else type="button" class="btn-secondary" @click="inviteOpen = false">{{ t('common.close') }}</button>
      </template>
    </SidePanel>
  </div>
</template>
