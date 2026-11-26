<script setup lang="ts">
import { Check } from '@lucide/vue'
import type { PositionKey } from '~/types'
import { POSITION_KEYS } from '~/types'

// Multi-select for position tags: zero or more, from the fixed list.
const model = defineModel<PositionKey[]>({ required: true })
defineProps<{ disabled?: boolean; legend?: string }>()
const { t } = useLocale()
function toggle(k: PositionKey) {
  model.value = model.value.includes(k) ? model.value.filter((x) => x !== k) : POSITION_KEYS.filter((x) => x === k || model.value.includes(x))
}
</script>

<template>
  <fieldset :disabled="disabled">
    <legend class="label">{{ legend ?? t('team.positions') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></legend>
    <div class="flex flex-wrap gap-2">
      <button v-for="k in POSITION_KEYS" :key="k" type="button" role="checkbox" :aria-checked="model.includes(k)"
        class="pressable inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60"
        :class="model.includes(k) ? 'border-transparent text-white' : 'border-line text-muted hover:border-brand-300 hover:text-fg'"
        :style="model.includes(k) ? { background: POSITION_COLORS[k] } : undefined" @click="toggle(k)">
        <Check v-if="model.includes(k)" class="size-3.5" /><span v-else class="size-2 rounded-full" :style="{ background: POSITION_COLORS[k] }" />
        {{ t(`positions.${k}`) }}
      </button>
    </div>
  </fieldset>
</template>
