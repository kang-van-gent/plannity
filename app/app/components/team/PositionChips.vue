<script setup lang="ts">
import type { PositionKey } from '~/types'

// Position tags as small coloured chips (labels only — never permissions).
withDefaults(defineProps<{ keys: PositionKey[]; empty?: boolean }>(), { empty: false })
const { t } = useLocale()
</script>

<template>
  <span v-if="keys.length" class="inline-flex flex-wrap gap-1">
    <span v-for="k in keys" :key="k" class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold"
      :style="{ background: `${POSITION_COLORS[k]}1f`, color: `color-mix(in srgb, ${POSITION_COLORS[k]} 75%, var(--color-fg, #1b1530))` }">
      <span class="size-1.5 rounded-full" :style="{ background: POSITION_COLORS[k] }" />{{ t(`positions.${k}`) }}
    </span>
  </span>
  <span v-else-if="empty" class="text-[0.6875rem] text-muted">{{ t('team.noPositions') }}</span>
</template>
