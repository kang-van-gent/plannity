<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <!-- Phones: native "large title" header with full-width action buttons below.
       sm+: title left, actions right. -->
  <div class="mb-5 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
    <div class="min-w-0">
      <slot name="eyebrow" />
      <h1 v-anim class="flex items-center gap-2 font-display text-[28px] font-bold leading-tight sm:text-4xl">
        <span class="min-w-0 break-words">{{ title }}</span>
        <Doodle variant="spark" class="size-5 shrink-0 text-sun sm:size-6" />
      </h1>
      <p v-if="subtitle" v-anim="1" class="mt-1 line-clamp-2 max-w-2xl text-sm text-muted sm:mt-1.5 sm:line-clamp-none sm:text-base">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" v-anim="2"
      class="grid auto-cols-fr grid-flow-col items-center gap-2 sm:flex sm:flex-wrap">
      <slot />
    </div>
  </div>
</template>
