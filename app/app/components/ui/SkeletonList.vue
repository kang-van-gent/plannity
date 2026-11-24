<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; grid?: boolean }>(), { rows: 4 })
</script>

<template>
  <div :class="grid ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'" aria-busy="true" aria-live="polite">
    <div v-for="i in rows" :key="i" class="card p-5">
      <div class="skeleton h-4 w-1/3" />
      <div class="skeleton mt-3 h-5 w-4/5" />
      <div class="skeleton mt-2 h-3 w-2/3" />
    </div>
  </div>
</template>
