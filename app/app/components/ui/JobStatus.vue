<script setup lang="ts">
import type { JobStatus } from '~/types'
defineProps<{ status: JobStatus }>()
const { t } = useLocale()
const STYLE: Record<JobStatus, string> = {
  queued: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  running: 'bg-brand-500/12 text-brand-600 dark:text-brand-300',
  completed: 'bg-success/12 text-success',
  partial: 'bg-warning/15 text-warning',
  failed: 'bg-danger/12 text-danger',
  cancelled: 'bg-slate-500/10 text-muted',
}
</script>

<template>
  <span class="chip" :class="STYLE[status]">
    <span v-if="status === 'running' || status === 'queued'" class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" /><span class="relative inline-flex size-2 rounded-full bg-current" /></span>
    {{ t(`jobs.status.${status}`) }}
  </span>
</template>
