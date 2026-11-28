<script setup lang="ts">
/**
 * A brand's mark: its logo when it has one (on a white tile, so transparent and
 * dark logos stay readable in dark mode), otherwise its initials on the brand colour.
 * Falls back to the initials if the logo can't be loaded.
 */
const props = withDefaults(defineProps<{ name?: string; color?: string; size?: number; logo?: string | null }>(), { size: 28, name: '', color: '#6C4CF5', logo: null })
const label = computed(() => initials(props.name || '?').toUpperCase())
const broken = ref(false)
watch(() => props.logo, () => { broken.value = false })
const showLogo = computed(() => !!props.logo && !broken.value)
</script>

<template>
  <span class="inline-grid shrink-0 place-items-center overflow-hidden rounded-[35%] font-display font-bold text-white shadow-sm"
    :class="showLogo && 'bg-white ring-1 ring-inset ring-black/5'"
    :style="{ width: `${size}px`, height: `${size}px`, ...(showLogo ? {} : { background: color }), fontSize: `${Math.round(size * 0.38)}px` }" aria-hidden="true">
    <img v-if="showLogo" :src="logo!" alt="" class="size-[86%] object-contain" @error="broken = true">
    <template v-else>{{ label }}</template>
  </span>
</template>
