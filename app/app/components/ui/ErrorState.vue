<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import type { ApiError } from '~/services/api/contract'
defineProps<{ error: ApiError | null; compact?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useLocale()
</script>

<template>
  <div v-anim="{ from: 'scale' }" class="card flex flex-col items-center gap-3 text-center" :class="compact ? 'px-4 py-6' : 'px-6 py-12'" role="alert">
    <ResultIcon type="error" :size="compact ? 44 : 64" />
    <div>
      <p class="font-display text-lg font-bold">{{ error?.code === 'NOT_FOUND' ? t('errors.notFound') : t('errors.loadFailed') }}</p>
      <p class="mt-1 text-sm text-muted">{{ error?.message }}<span v-if="error?.requestId" class="ml-1 opacity-70">· {{ t('errors.requestId') }} {{ error.requestId }}</span></p>
    </div>
    <button type="button" class="btn-secondary" @click="emit('retry')"><RefreshCw class="size-4" />{{ t('common.retry') }}</button>
  </div>
</template>
