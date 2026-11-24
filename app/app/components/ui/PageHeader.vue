<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <slot name="eyebrow" />
      <h1 v-anim class="flex items-center gap-2 font-display text-3xl font-bold sm:text-4xl">
        {{ title }}
        <Doodle variant="spark" class="size-6 text-sun" />
      </h1>
      <p v-if="subtitle" v-anim="1" class="mt-1.5 max-w-2xl text-muted">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" v-anim="2" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
