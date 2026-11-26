<script setup lang="ts">
import type { TaskStatus } from '~/types'

defineProps<{ status: TaskStatus }>()
const { t } = useLocale()
const STYLE: Record<TaskStatus, string> = {
  todo: 'bg-surface-2 text-muted', in_progress: 'bg-sky/20 text-sky-700 dark:text-sky', in_review: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  changes_requested: 'bg-sun/20 text-amber-700 dark:text-sun', completed: 'bg-success/15 text-success', cancelled: 'bg-slate-500/10 text-muted line-through',
}
</script>

<template>
  <span class="chip shrink-0 py-0.5 text-xs" :class="STYLE[status]">{{ t(`tasks.status.${status}`) }}</span>
</template>
