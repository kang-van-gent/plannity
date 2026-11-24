<script setup lang="ts">
// Decorative spark / squiggle / burst accents (spec §2A "spark, doodle").
defineProps<{ variant: 'spark' | 'squiggle' | 'burst' | 'underline' | 'petal' }>()
</script>

<template>
  <svg v-if="variant === 'spark'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.5c.6 4.6 2.9 7.9 9.5 10.5-6.6 2.6-8.9 5.9-9.5 10.5-.6-4.6-2.9-7.9-9.5-10.5C9.1 9.4 11.4 6.1 12 1.5Z" /></svg>
  <svg v-else-if="variant === 'squiggle'" viewBox="0 0 120 24" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" aria-hidden="true"><path d="M4 16c10-12 18-12 26 0s16 12 26 0 18-12 26 0 16 12 26 0" /></svg>
  <svg v-else-if="variant === 'burst'" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" aria-hidden="true"><path d="M8 4l3 9M22 2l-1 10M34 10l-8 6" /></svg>
  <svg v-else-if="variant === 'underline'" viewBox="0 0 300 20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" preserveAspectRatio="none" aria-hidden="true"><path d="M4 14C80 4 200 2 296 10" /></svg>
  <svg v-else viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"><path d="M50 5c25 0 45 22 45 48S72 95 45 95 5 78 5 52 25 5 50 5Z" /></svg>
</template>
