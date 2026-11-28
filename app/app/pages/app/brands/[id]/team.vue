<script setup lang="ts">
import { Check, Copy, Crown, Gem, LogOut, Mail, PauseCircle, RefreshCw, Send, Tags, Trash2, UserPlus, Users, X } from '@lucide/vue'
import type { BrandInvitation, BrandMember, BrandRole, InviteResult, PositionKey } from '~/types'
import { isApiError } from '~/services/api/contract'
import { INVITABLE_ROLES, leaveError, removeError, roleCan, roleChangeError } from '~/utils/permissions'
import { POSITION_KEYS } from '~/types'

definePageMeta({ layout: 'app', middleware: 'auth' })
const { t, locale } = useLocale()
const opt = useSelectOptions()
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
const seatsLeft = computed(() => (team.value ? team.value.seatLimit - team.value.seatsUsed : 0))
const planName = computed(() => t(`plan.names.${team.value?.planKey ?? 'solo'}`))
/** Collaboration is an account-level entitlement of the brand's owner (pricing.md). */
const collab = computed(() => !!team.value?.features.collaboration)
const canManage = computed(() => roleCan(myRole.value, 'member.invite'))
const canInvite = computed(() => canManage.value && collab.value)
const canTag = computed(() => roleCan(myRole.value, 'member.updateRole') && !!team.value?.features.memberPositions)

// Filter members by position (only positions someone actually has).
const positionFilter = ref<PositionKey | 'all'>('all')
const usedPositions = computed(() => POSITION_KEYS.filter((k) => team.value?.members.some((m) => m.positionKeys.includes(k))))
const shownMembers = computed(() => (team.value?.members ?? []).filter((m) => positionFilter.value === 'all' || m.positionKeys.includes(positionFilter.value)))
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

// ---- position tags ---------------------------------------------------------
const tagMember = ref<BrandMember | null>(null)
const tagDraft = ref<PositionKey[]>([])
const tagging = ref(false)
function openTags(m: BrandMember) {
  tagMember.value = m
  tagDraft.value = [...m.positionKeys]
}
async function saveTags() {
  if (!tagMember.value) return
  tagging.value = true
  try {
    await api.team.updatePositions(id.value, tagMember.value.id, tagDraft.value)
    notify.success(t('team.positionsSaved'), tagMember.value.name)
    tagMember.value = null
    await q.refresh({ silent: true })
  } catch (e) {
    notify.fromError(e)
  } finally {
    tagging.value = false
  }
}

// ---- invite panel ----------------------------------------------------------
const inviteOpen = ref(false)
const form = reactive({ email: '', role: 'editor' as BrandRole, positionKeys: [] as PositionKey[] })
const formError = ref('')
const sending = ref(false)
const result = ref<(InviteResult & { resent?: boolean }) | null>(null)
const copied = ref(false)

function openInvite() {
  Object.assign(form, { email: '', role: 'editor', positionKeys: [] })
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
    showResult(await api.team.invite(id.value, { email: form.email.trim(), role: form.role, positionKeys: canTag.value ? form.positionKeys : [] }))
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
const initials = (s: string) => s.split(/[\s@._()\[\]-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
</script>

<template>
  <div class="mx-auto max-w-4xl">

    <UiErrorState v-if="brandQ.error.value || q.error.value" :error="(brandQ.error.value ?? q.error.value)!" @retry="brandQ.refresh(); q.refresh()" />
    <UiSkeletonList v-else-if="!brandQ.data.value || !team || !q.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-5 flex items-center gap-4">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="brandQ.data.value.name" :color="brandQ.data.value.color" :size="56" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[1.625rem] font-bold sm:text-3xl">{{ brandQ.data.value.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('team.subtitle', { brand: brandQ.data.value.name }) }}</p>
        </div>
      </div>
      <BrandTabs :brand-id="brandQ.data.value.id" active="team" />
      <BrandLockBanner :brand="brandQ.data.value" />

      <!-- Collaborator whose access is paused (owner's plan lapsed) -->
      <section v-if="brandQ.data.value.suspended" v-anim class="mb-4 flex items-start gap-3 rounded-[1.5rem] bg-sun/15 p-4">
        <PauseCircle class="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-sun" />
        <div><p class="font-semibold">{{ t('team.suspendedTitle') }}</p><p class="text-sm text-muted">{{ t('team.suspendedBody') }}</p></div>
      </section>

      <!-- Seats: the owner's account-wide pool -->
      <section v-if="collab" v-anim class="card card-pad">
        <div class="flex flex-wrap items-center gap-3">
          <span class="grid size-10 place-items-center rounded-2xl bg-brand-500/10 text-brand-500"><Users class="size-5" /></span>
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
              {{ t('team.seats', { used: team.seatsUsed, max: team.seatLimit }) }}
              <span class="chip bg-brand-500/10 py-0.5 text-xs text-brand-600 dark:text-brand-300"><Gem class="size-3" />{{ t('team.planBadge', { plan: planName }) }}</span>
            </p>
            <p class="text-xs text-muted">{{ t('team.seatsHint') }}</p>
          </div>
          <button v-if="canInvite" type="button" class="btn-primary max-sm:w-full" :disabled="seatsLeft <= 0" @click="openInvite"><UserPlus class="size-4" />{{ t('team.invite') }}</button>
        </div>
        <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-2" role="meter" :aria-valuenow="team.seatsUsed" :aria-valuemax="team.seatLimit">
          <span class="h-full rounded-full bg-gradient-to-r from-brand-500 to-pink transition-all" :style="{ width: `${Math.min(100, (team.seatsUsed / team.seatLimit) * 100)}%` }" />
        </div>
        <div v-if="canInvite && seatsLeft <= 0" class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sun/15 p-3 text-sm">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-amber-700 dark:text-sun">{{ t('team.seatLimitTitle') }}</p>
            <p class="mt-0.5 text-muted">{{ t('team.seatLimitBody', { n: team.seatLimit, plan: planName }) }}</p>
          </div>
          <NuxtLink v-if="team.isBillingOwner" to="/app/plan" class="btn-secondary btn-sm">{{ t('plan.viewPlans') }}</NuxtLink>
        </div>
      </section>

      <!-- No collaboration on the owner's plan (Solo, or a lapsed Team/Studio) -->
      <section v-else v-anim class="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-500 to-pink p-5 text-white sm:p-6">
        <Doodle variant="petal" class="absolute -right-6 -top-6 size-32 text-white/15" />
        <p class="relative flex items-center gap-2 font-display text-xl font-bold"><Gem class="size-5" />{{ t('team.planGateTitle') }}</p>
        <p class="relative mt-1 max-w-xl text-sm text-white/85">{{ team.isBillingOwner ? t('team.planGateOwner') : t('team.planGateMember') }}</p>
        <NuxtLink v-if="team.isBillingOwner" to="/app/plan" class="relative mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-brand-600">{{ t('plan.viewPlans') }}</NuxtLink>
      </section>

      <!-- Solo: invite prompt -->
      <UiEmptyState v-if="solo && canInvite" :icon="UserPlus" :title="t('team.emptyTitle')" :message="t('team.emptyBody')" class="mt-4">
        <button type="button" class="btn-primary" :disabled="seatsLeft <= 0" @click="openInvite"><UserPlus class="size-4" />{{ t('team.invite') }}</button>
      </UiEmptyState>

      <!-- Members -->
      <section v-anim class="card mt-4 overflow-hidden">
        <div class="border-b border-line px-4 py-3.5 sm:px-5">
          <h2 class="font-display text-lg font-bold">{{ t('team.members') }} <span class="text-sm font-semibold text-muted">· {{ team.members.length }}</span></h2>
          <div v-if="usedPositions.length" class="h-scroll mt-2 -mb-1" role="radiogroup" :aria-label="t('team.positions')">
            <button type="button" role="radio" :aria-checked="positionFilter === 'all'" class="chip shrink-0" :class="positionFilter === 'all' ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-surface-2 text-muted'" @click="positionFilter = 'all'">{{ t('team.filterAll') }}</button>
            <button v-for="k in usedPositions" :key="k" type="button" role="radio" :aria-checked="positionFilter === k" class="chip shrink-0"
              :class="positionFilter === k ? 'text-white' : 'bg-surface-2 text-muted'" :style="positionFilter === k ? { background: POSITION_COLORS[k] } : undefined" @click="positionFilter = k">{{ t(`positions.${k}`) }}</button>
          </div>
        </div>
        <p v-if="!shownMembers.length" class="px-5 py-6 text-center text-sm text-muted">{{ t('team.noMatch') }}</p>
        <ul class="divide-y divide-line">
          <li v-for="m in shownMembers" :key="m.id" class="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pink font-display text-sm font-bold text-white">{{ initials(m.name || m.email) }}</span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 truncate font-semibold">
                {{ m.name }}
                <span v-if="m.isYou" class="chip bg-brand-500/10 py-0.5 text-brand-600 dark:text-brand-300">{{ t('team.you') }}</span>
                <span v-if="m.role === 'owner' && owners === 1" class="chip bg-sun/15 py-0.5 text-amber-700 dark:text-sun"><Crown class="size-3" />{{ t('team.lastOwner') }}</span>
              </p>
              <p class="truncate text-xs text-muted">{{ m.email }} · {{ t('team.joined', { date: formatDate(m.joinedAt.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) }}</p>
              <TeamPositionChips :keys="m.positionKeys" class="mt-1.5" />
            </div>
            <div class="flex w-full items-center gap-2 sm:w-auto">
              <button v-if="canTag && (myRole === 'owner' || m.role !== 'owner')" type="button" class="btn-icon btn-ghost" :aria-label="`${t('team.editPositions')}: ${m.name}`" :title="t('team.editPositions')" @click="openTags(m)">
                <Tags class="size-4" />
              </button>
              <UiSelect v-if="roleOptions(m).length > 1" class="flex-1 sm:flex-none" size="pill" :model-value="m.role" :options="opt.roles(roleOptions(m))"
                :disabled="busy === `role:${m.id}`" :aria-label="`${t('team.role')}: ${m.name}`" @change="changeRole(m, $event)" />
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
              <TeamPositionChips :keys="i.positionKeys" class="mt-1.5" />
            </div>
            <div class="flex w-full items-center gap-2 sm:w-auto">
              <span class="chip bg-surface-2 text-muted">{{ t(`roles.${i.role}`) }}</span>
              <template v-if="canManage">
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
        <TeamPositionPicker v-if="canTag" v-model="form.positionKeys" />
        <p class="rounded-2xl bg-surface-2 p-3 text-xs text-muted">{{ t('team.positionsHint') }}</p>
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

    <!-- Position tags: labels only; role, seats and assignments stay as they are -->
    <SidePanel :open="!!tagMember" size="sm" :title="t('team.editPositions')" :subtitle="tagMember?.name" @close="tagMember = null">
      <TeamPositionPicker v-model="tagDraft" :disabled="tagging" />
      <p class="rounded-2xl bg-surface-2 p-3 text-xs text-muted">{{ t('team.positionsHint') }}</p>
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="tagging" @click="saveTags"><Check class="size-4" />{{ tagging ? t('common.saving') : t('common.save') }}</button>
      </template>
    </SidePanel>
  </div>
</template>
