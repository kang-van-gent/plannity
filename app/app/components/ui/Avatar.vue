<script setup lang="ts">
/**
 * A person's profile photo, or their initials on the brand gradient when there's
 * no photo (or it fails to load — e.g. a Gravatar that was removed).
 */
const props = withDefaults(defineProps<{
  name?: string | null
  url?: string | null
  /** Pixel size (square). */
  size?: number
  /** rounded-full (default) or the app's rounded square. */
  shape?: 'circle' | 'square'
}>(), { size: 40, shape: 'circle' })

const broken = ref(false)
watch(() => props.url, () => { broken.value = false })
const label = computed(() => initials(props.name || '?').toUpperCase())
const fontSize = computed(() => `${Math.max(10, Math.round(props.size * 0.36))}px`)
</script>

<template>
  <span class="relative inline-grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-brand-500 to-pink font-display font-bold text-white"
    :class="shape === 'circle' ? 'rounded-full' : 'rounded-2xl'" :style="{ width: `${size}px`, height: `${size}px`, fontSize }" aria-hidden="true">
    <img v-if="url && !broken" :src="url" alt="" class="size-full object-cover" referrerpolicy="no-referrer" @error="broken = true">
    <template v-else>{{ label }}</template>
  </span>
</template>
