<script setup lang="ts">
import type { Component } from 'vue'
defineProps<{ icon?: Component; title: string; message?: string }>()
</script>

<template>
  <div v-anim="{ from: 'scale' }" class="card relative overflow-hidden px-6 py-12 text-center">
    <span class="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-pink/15 blur-2xl" />
    <span class="pointer-events-none absolute -bottom-12 -right-6 size-44 rounded-full bg-sky/20 blur-2xl" />
    <div class="relative mx-auto grid size-16 place-items-center rounded-3xl bg-brand-500/10 text-brand-500">
      <component :is="icon" v-if="icon" class="size-7" />
      <Doodle v-else variant="spark" class="size-8" />
    </div>
    <h3 class="relative mt-4 font-display text-xl font-bold">{{ title }}</h3>
    <p v-if="message" class="relative mx-auto mt-1.5 max-w-md text-sm text-muted">{{ message }}</p>
    <div v-if="$slots.default" class="relative mt-5 flex flex-wrap justify-center gap-2">
      <slot />
    </div>
  </div>
</template>
