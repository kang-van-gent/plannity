<script setup lang="ts">
import { AlertTriangle, ArrowRight, Ban, Check, ChevronDown, ClipboardList, Flag, Gem, History, ImageUp, PauseCircle, Play, Send, UserRoundPen, X } from '@lucide/vue'
import type { Brand, Content, Task, TaskAction } from '~/types'
import { isApiError } from '~/services/api/contract'

/**
 * Design task for a post (Team/Studio). Shows the open task — assignee,
 * due date, brief changes, review notes — and only the actions the server says
 * this viewer may take. Task status never changes the post status.
 */
const props = defineProps<{ content: Content; brand: Brand | undefined; imageCount: number }>()
const emit = defineEmits<{ uploadImages: [] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()

const q = useQuery(() => api.tasks.forContent(props.content.id), { watch: [() => props.content.id] })
const tasks = computed(() => q.data.value ?? [])
const open = computed(() => tasks.value.find((x) => OPEN_TASK_STATUSES.includes(x.status)) ?? null)
const earlier = computed(() => tasks.value.filter((x) => x !== open.value))
const latest = computed(() => open.value ?? earlier.value[0] ?? null)

const features = computed(() => props.brand?.features)
const canAssign = computed(() => !!features.value?.taskAssignment && roleCan(props.brand?.myRole, 'content.update'))
const today = todayISO()

function replace(task: Task) {
  q.data.value = [task, ...tasks.value.filter((x) => x.id !== task.id)]
}

const busy = ref<TaskAction | null>(null)
async function act(task: Task, action: TaskAction, note?: string) {
  if (action === 'submit' && props.imageCount < 1) { notify.warning(t('tasks.card.imagesHint')); emit('uploadImages'); return }
  if (action === 'cancel' && !(await notify.confirm({ title: t('tasks.cancelConfirm'), message: t('tasks.cancelConfirmBody'), confirmLabel: t('tasks.actions.cancel'), tone: 'danger' }))) return
  busy.value = action
  try {
    replace(await api.tasks.transition(task.id, action, { version: task.version, note }))
    notify.success(t(`tasks.done.${action}`))
    changesOpen.value = false
  } catch (e) {
    notify.fromError(e)
    if (isApiError(e) && (e.code === 'VERSION_CONFLICT' || e.code === 'CONFLICT')) q.refresh({ silent: true })
  } finally {
    busy.value = null
  }
}

// Request changes needs a note for the assignee.
const changesOpen = ref(false)
const changesNote = ref('')
function askChanges() { changesNote.value = ''; changesOpen.value = true }

// Assign / edit / reassign
const panelOpen = ref(false)
const editing = ref<Task | null>(null)
function openAssign(task: Task | null = null) { editing.value = task; panelOpen.value = true }
function onSaved(task: Task) { replace(task); panelOpen.value = false }

const showHistory = ref(false)
const showBrief = ref(false)
const initials = (s: string) => s.split(/[\s@._()\[\]-]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?'
const dueText = (task: Task) => !task.dueDate ? t('tasks.noDue')
  : isOverdue(task, today) ? t('tasks.overdue', { date: formatDate(task.dueDate, locale.value) }) : t('tasks.due', { date: formatDate(task.dueDate, locale.value) })
</script>

<template>
  <section class="card card-pad" :aria-busy="q.pending.value">
    <div class="flex items-center gap-2">
      <span class="grid size-9 place-items-center rounded-2xl bg-pink/15 text-pink"><ClipboardList class="size-[18px]" /></span>
      <h2 class="min-w-0 flex-1 font-display text-lg font-bold">{{ t('tasks.card.title') }}</h2>
      <TaskStatusBadge v-if="latest && (open || latest.status === 'completed')" :status="latest.status" />
    </div>

    <UiSkeletonList v-if="!q.ready.value" :rows="1" class="mt-3" />

    <!-- Plan gate: tasks are Team/Studio -->
    <div v-else-if="!features?.taskAssignment && !tasks.length" class="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
      <p class="flex items-start gap-2 text-muted"><Gem class="mt-0.5 size-4 shrink-0 text-brand-500" />{{ brand?.isBillingOwner ? t('tasks.card.planGateOwner') : t('tasks.card.planGateMember') }}</p>
      <NuxtLink v-if="brand?.isBillingOwner" to="/app/plan" class="btn-secondary btn-sm mt-3">{{ t('plan.viewPlans') }}</NuxtLink>
    </div>

    <template v-else>
      <p v-if="latest?.suspended" class="mt-3 flex items-start gap-2 rounded-2xl bg-sun/15 p-3 text-sm"><PauseCircle class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-sun" />{{ t('tasks.card.suspended') }}</p>

      <!-- No open task -->
      <div v-if="!open" class="mt-3">
        <template v-if="latest?.status === 'completed'">
          <p class="text-sm"><b>{{ latest.assignee?.name ?? '—' }}</b> · {{ t('tasks.status.completed') }} {{ latest.completedAt ? formatDateTime(latest.completedAt, locale) : '' }}</p>
          <p class="mt-2 rounded-2xl bg-success/10 p-3 text-xs text-muted">{{ t('tasks.card.completedNote') }}</p>
        </template>
        <template v-else>
          <p class="font-semibold">{{ t('tasks.card.none') }}</p>
          <p class="text-sm text-muted">{{ t('tasks.card.noneBody') }}</p>
        </template>
        <button v-if="canAssign" type="button" class="btn-primary btn-sm mt-3 w-full" @click="openAssign()"><UserRoundPen class="size-4" />{{ t('tasks.card.assign') }}</button>
      </div>

      <!-- Open task -->
      <div v-else class="mt-3 space-y-3">
        <div class="flex items-center gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold text-white" :class="open.assignee?.active ? 'bg-gradient-to-br from-pink to-sun' : 'bg-slate-400'">{{ initials(open.assignee?.name ?? '?') }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">{{ open.assignee?.name ?? '—' }} <span v-if="open.isMine" class="chip bg-brand-500/10 py-0 text-[10px] text-brand-600 dark:text-brand-300">{{ t('team.you') }}</span></p>
            <p class="truncate text-xs text-muted">{{ t(`positions.${open.positionKey}`) }} · {{ t('tasks.card.by', { name: open.assignedByName }) }}</p>
          </div>
        </div>

        <p v-if="!open.assignee?.active" class="flex items-start gap-2 rounded-2xl bg-danger/10 p-3 text-sm text-danger">
          <AlertTriangle class="mt-0.5 size-4 shrink-0" />{{ open.assignee ? t('tasks.card.needsReassign', { name: open.assignee.name }) : t('tasks.card.unassigned') }}
        </p>

        <div class="flex flex-wrap gap-2 text-xs">
          <span class="chip" :class="isOverdue(open, today) ? 'bg-danger/12 text-danger' : 'bg-surface-2 text-muted'">{{ dueText(open) }}</span>
          <span v-if="open.priority === 'high'" class="chip bg-danger/12 text-danger"><Flag class="size-3" />{{ t('tasks.priority.high') }}</span>
          <span v-if="content.scheduledDate" class="chip bg-surface-2 text-muted">{{ t('tasks.posts', { date: formatDate(content.scheduledDate, locale) }) }}</span>
        </div>

        <div v-if="open.note" class="rounded-2xl bg-surface-2 p-3 text-sm"><p class="text-xs font-semibold text-muted">{{ t('tasks.card.note') }}</p><p class="whitespace-pre-line">{{ open.note }}</p></div>
        <div v-if="open.reviewNote && open.status === 'changes_requested'" class="rounded-2xl border border-sun/40 bg-sun/10 p-3 text-sm">
          <p class="text-xs font-semibold text-amber-700 dark:text-sun">{{ t('tasks.card.reviewNote') }}</p><p class="whitespace-pre-line">{{ open.reviewNote }}</p>
        </div>

        <!-- The brief was edited after assignment -->
        <div v-if="open.briefChanged" class="rounded-2xl border border-sky/40 bg-sky/10 p-3 text-sm">
          <button type="button" class="flex w-full items-start gap-2 text-left" :aria-expanded="showBrief" @click="showBrief = !showBrief">
            <AlertTriangle class="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky" /><span class="flex-1">{{ t('tasks.card.briefChanged', { v: open.briefVersion ?? '?' }) }}</span>
            <ChevronDown class="size-4 shrink-0 transition" :class="showBrief && 'rotate-180'" />
          </button>
          <div v-if="showBrief" class="mt-2 grid gap-2 text-xs">
            <div><p class="font-semibold text-muted">{{ t('tasks.card.briefAtAssign') }}</p><p class="whitespace-pre-line">{{ open.briefSnapshot || '—' }}</p></div>
            <div><p class="font-semibold text-muted">{{ t('tasks.card.briefNow') }}</p><p class="whitespace-pre-line">{{ content.visualBrief || '—' }}</p></div>
          </div>
        </div>

        <!-- Actions this viewer may take -->
        <template v-if="!open.suspended">
          <p v-if="open.caps.assignee && ['in_progress', 'todo', 'changes_requested'].includes(open.status)" class="flex items-start gap-2 text-xs text-muted"><ImageUp class="mt-0.5 size-3.5 shrink-0" />{{ t('tasks.card.imagesHint') }}</p>
          <div class="grid gap-2">
            <button v-if="open.caps.assignee && TASK_TRANSITIONS.start.from.includes(open.status)" type="button" class="btn-primary btn-sm" :disabled="!!busy" @click="act(open, 'start')"><Play class="size-4" />{{ t('tasks.actions.start') }}</button>
            <button v-if="open.caps.assignee && open.status === 'in_progress'" type="button" class="btn-primary btn-sm" :disabled="!!busy" @click="act(open, 'submit')"><Send class="size-4" />{{ t('tasks.actions.submit') }}</button>
            <template v-if="open.caps.reviewer && open.status === 'in_review'">
              <button type="button" class="btn-primary btn-sm" :disabled="!!busy" @click="act(open, 'approve')"><Check class="size-4" />{{ t('tasks.actions.approve') }}</button>
              <button type="button" class="btn-secondary btn-sm" :disabled="!!busy" @click="askChanges"><X class="size-4" />{{ t('tasks.actions.request_changes') }}</button>
            </template>
            <div v-if="open.caps.manager" class="flex gap-2">
              <button type="button" class="btn-ghost btn-sm flex-1" @click="openAssign(open)"><UserRoundPen class="size-4" />{{ open.assignee?.active ? t('tasks.actions.edit') : t('tasks.actions.reassign') }}</button>
              <button type="button" class="btn-ghost btn-sm flex-1 text-danger" :disabled="!!busy" @click="act(open, 'cancel')"><Ban class="size-4" />{{ t('tasks.actions.cancel') }}</button>
            </div>
          </div>
          <p v-if="!open.caps.assignee && !open.caps.reviewer && !open.caps.manager" class="text-xs text-muted">{{ t('tasks.card.viewerHint') }}</p>
        </template>
      </div>

      <!-- History of the current/last task, plus earlier tasks -->
      <div v-if="latest?.events?.length" class="mt-3 border-t border-line pt-3">
        <button type="button" class="flex w-full items-center gap-2 text-sm font-semibold text-muted hover:text-fg" :aria-expanded="showHistory" @click="showHistory = !showHistory">
          <History class="size-4" />{{ t('tasks.card.history') }}<ChevronDown class="ml-auto size-4 transition" :class="showHistory && 'rotate-180'" />
        </button>
        <ol v-if="showHistory" class="mt-2 space-y-1.5 text-xs">
          <li v-for="e in latest.events" :key="e.id" class="flex gap-2">
            <span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
            <span><b>{{ e.actorName }}</b> {{ t(`tasks.events.${e.action}`) }} · <span class="text-muted">{{ formatDateTime(e.createdAt, locale) }}</span>
              <span v-if="e.note" class="block whitespace-pre-line text-muted">“{{ e.note }}”</span></span>
          </li>
        </ol>
        <template v-if="showHistory && earlier.filter((x) => x !== latest).length">
          <p class="mt-3 text-xs font-semibold text-muted">{{ t('tasks.card.earlier') }}</p>
          <ul class="mt-1 space-y-1 text-xs">
            <li v-for="x in earlier.filter((y) => y !== latest)" :key="x.id" class="flex items-center gap-2"><TaskStatusBadge :status="x.status" /><span class="truncate">{{ x.assignee?.name ?? '—' }}</span><span class="ml-auto text-muted">{{ formatDate(x.createdAt.slice(0, 10), locale) }}</span></li>
          </ul>
        </template>
      </div>
    </template>

    <TaskAssignPanel :open="panelOpen" :content="content" :task="editing" @close="panelOpen = false" @saved="onSaved" />

    <SidePanel :open="changesOpen" size="sm" :title="t('tasks.changesTitle')" :subtitle="t('tasks.changesBody', { name: open?.assignee?.name ?? '' })" :guard="false" @close="changesOpen = false">
      <textarea v-model="changesNote" rows="4" maxlength="1000" class="input" :placeholder="t('tasks.changesPh')" :aria-label="t('tasks.changesTitle')" />
      <template #footer="{ close }">
        <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
        <button type="button" class="btn-primary" :disabled="!changesNote.trim() || !!busy" @click="open && act(open, 'request_changes', changesNote)"><ArrowRight class="size-4" />{{ t('tasks.send') }}</button>
      </template>
    </SidePanel>
  </section>
</template>
