<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'

// Goes back to wherever the user came from (history), not to a fixed page.
const props = withDefaults(defineProps<{ fallback?: string; label?: string; variant?: 'ghost' | 'chip' }>(), { variant: 'ghost' })
const { t } = useLocale()
const { back } = useGoBack()
</script>

<template>
  <button type="button" :aria-label="label ?? t('common.back')"
    class="group inline-flex items-center gap-1.5 text-sm font-semibold transition"
    :class="variant === 'chip' ? 'rounded-full border border-line bg-surface/80 px-3 py-1.5 text-muted shadow-soft backdrop-blur hover:text-fg' : 'btn-ghost btn-sm -ml-2 text-muted hover:text-fg'"
    @click="back(props.fallback)">
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />{{ label ?? t('common.back') }}
  </button>
</template>
