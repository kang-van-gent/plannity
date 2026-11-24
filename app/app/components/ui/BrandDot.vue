<script setup lang="ts">
const props = withDefaults(defineProps<{ name?: string; color?: string; size?: number }>(), { size: 28, name: '', color: '#6C4CF5' })
const label = computed(() => initials(props.name || '?').toUpperCase())
</script>

<template>
  <span class="inline-grid shrink-0 place-items-center rounded-[35%] font-display font-bold text-white shadow-sm"
    :style="{ width: `${size}px`, height: `${size}px`, background: color, fontSize: `${Math.round(size * 0.38)}px` }" aria-hidden="true">
    {{ label }}
  </span>
</template>
