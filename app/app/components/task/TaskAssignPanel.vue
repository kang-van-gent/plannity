<script setup lang="ts">
import { AlertTriangle, Send, Users } from '@lucide/vue'
import type { BrandMember, Content, PositionKey, Task, TaskPriority } from '~/types'
import { isApiError } from '~/services/api/contract'

/**
 * Assign (or edit / reassign) the design task of a post. Members are filtered
 * by the chosen position AND by edit rights — a position is only a hint,
 * never permission. The server re-checks everything.
 */
const props = defineProps<{ open: boolean; content: Content; task?: Task | null }>()
const emit = defineEmits<{ close: []; saved: [Task] }>()
const { t, locale } = useLocale()
const api = useApi()
const notify = useNotify()

const members = ref<BrandMember[] | null>(null)
const form = reactive({ positionKey: 'graphic_designer' as PositionKey, assigneeId: '', dueDate: '', priority: 'normal' as TaskPriority, note: '' })
const errors = ref<Record<string, string>>({})
const saving = ref(false)

watch(() => props.open, async (open) => {
  if (!open) return
  errors.value = {}
  const tk = props.task
  Object.assign(form, tk
    ? { positionKey: tk.positionKey, assigneeId: tk.assignee?.active ? tk.assignee.memberId : '', dueDate: tk.dueDate ?? '', priority: tk.priority, note: tk.note ?? '' }
    : { positionKey: 'graphic_designer', assigneeId: '', dueDate: '', priority: 'normal', note: '' })
  members.value = null
  try { members.value = (await api.team.get(props.content.brandId)).members } catch (e) { notify.fromError(e); members.value = [] }
}, { immediate: true })

const eligible = computed(() => (members.value ?? []).filter((m) => !assigneeError(form.positionKey, { role: m.role, positionKeys: m.positionKeys })))
watch(eligible, (list) => { if (form.assigneeId && !list.some((m) => m.id === form.assigneeId)) form.assigneeId = '' })
watch(() => form.positionKey, () => { if (!eligible.value.some((m) => m.id === form.assigneeId)) form.assigneeId = eligible.value[0]?.id ?? '' })
watch(members, () => { if (!form.assigneeId) form.assigneeId = eligible.value[0]?.id ?? '' })

const postDate = computed(() => props.content.scheduledDate)
const dueAfterPost = computed(() => !!form.dueDate && !!postDate.value && form.dueDate > postDate.value)
const initials = (s: string) => s.split(/[\s@._()\[\]-]+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('') || '?'

async function save() {
  errors.value = {}
  if (!form.assigneeId) { errors.value.assigneeId = t('validation.required'); return }
  saving.value = true
  const input = { positionKey: form.positionKey, assigneeId: form.assigneeId, dueDate: form.dueDate || null, priority: form.priority, note: form.note.trim() }
  try {
    const saved = props.task
      ? await api.tasks.updateAssignment(props.task.id, { ...input, version: props.task.version })
      : await api.tasks.create(props.content.id, input)
    notify.success(props.task ? t('tasks.done.updated') : t('tasks.done.assigned'), saved.assignee?.name)
    emit('saved', saved)
  } catch (e) {
    if (isApiError(e)) errors.value = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [k, e.message || v]))
    notify.fromError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SidePanel :open="open" size="sm" :title="task ? t('tasks.form.editTitle') : t('tasks.form.title')" :subtitle="t('tasks.form.subtitle', { title: content.title })" :guard="false" @close="emit('close')">
    <fieldset>
      <legend class="label">{{ t('tasks.form.position') }}</legend>
      <div class="flex flex-wrap gap-2">
        <button v-for="k in TASK_POSITIONS" :key="k" type="button" role="radio" :aria-checked="form.positionKey === k"
          class="pressable rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition" :class="form.positionKey === k ? 'border-transparent text-white' : 'border-line text-muted hover:text-fg'"
          :style="form.positionKey === k ? { background: POSITION_COLORS[k] } : undefined" @click="form.positionKey = k">{{ t(`positions.${k}`) }}</button>
      </div>
    </fieldset>

    <fieldset>
      <legend class="label">{{ t('tasks.form.member') }}</legend>
      <UiSkeletonList v-if="!members" :rows="2" />
      <div v-else-if="!eligible.length" class="rounded-2xl border border-dashed border-line p-4 text-sm">
        <p class="flex items-start gap-2 text-muted"><Users class="mt-0.5 size-4 shrink-0" />{{ t('tasks.form.noMembers') }}</p>
        <NuxtLink :to="`/app/brands/${content.brandId}/team`" class="btn-secondary btn-sm mt-3">{{ t('tasks.form.manageTeam') }}</NuxtLink>
      </div>
      <div v-else class="grid gap-2">
        <label v-for="m in eligible" :key="m.id" class="pressable flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3"
          :class="form.assigneeId === m.id ? 'border-brand-500 bg-brand-500/5' : 'border-line hover:border-brand-300'">
          <input v-model="form.assigneeId" type="radio" name="task-assignee" :value="m.id" class="sr-only">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-pink font-display text-xs font-bold text-white">{{ initials(m.name || m.email) }}</span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-semibold">{{ m.name }} <span class="text-xs font-normal text-muted">· {{ t(`roles.${m.role}`) }}</span></span>
            <TeamPositionChips :keys="m.positionKeys" />
          </span>
        </label>
      </div>
      <p v-if="errors.assigneeId" class="field-error">{{ errors.assigneeId }}</p>
      <p class="mt-2 text-xs text-muted">{{ t('tasks.form.roleNote') }}</p>
    </fieldset>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="label" for="task-due">{{ t('tasks.form.due') }}</label>
        <input id="task-due" v-model="form.dueDate" type="date" class="input" :class="errors.dueDate && 'input-error'">
      </div>
      <fieldset>
        <legend class="label">{{ t('tasks.form.priority') }}</legend>
        <div class="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
          <button v-for="p in (['normal', 'high'] as TaskPriority[])" :key="p" type="button" role="radio" :aria-checked="form.priority === p"
            class="rounded-xl py-2 text-xs font-semibold transition" :class="form.priority === p ? (p === 'high' ? 'bg-danger text-white' : 'bg-surface shadow-soft') : 'text-muted'" @click="form.priority = p">
            {{ p === 'high' ? t('tasks.priority.high') : t('tasks.priority.normal') }}
          </button>
        </div>
      </fieldset>
    </div>
    <p v-if="dueAfterPost" class="-mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-sun">
      <AlertTriangle class="size-3.5" />{{ t('tasks.form.dueAfterPost', { date: formatDate(postDate!, locale) }) }}
    </p>

    <div>
      <label class="label" for="task-note">{{ t('tasks.form.note') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label>
      <textarea id="task-note" v-model="form.note" rows="3" maxlength="1000" class="input" :placeholder="t('tasks.form.notePh')" />
    </div>

    <template #footer="{ close }">
      <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
      <button type="button" class="btn-primary" :disabled="saving || !eligible.length" @click="save"><Send class="size-4" />{{ task ? t('tasks.form.save') : t('tasks.form.submit') }}</button>
    </template>
  </SidePanel>
</template>
