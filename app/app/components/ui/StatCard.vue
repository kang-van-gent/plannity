<script setup lang="ts">
import type { Component } from 'vue'
import { gsap } from 'gsap'

const props = defineProps<{ label: string; value: number; icon?: Component; tint?: string; hint?: string }>()
const shown = ref(0)
const { locale } = useLocale()
watch(() => props.value, (v) => {
  if (prefersReducedMotion()) { shown.value = v; return }
  const o = { n: shown.value }
  gsap.to(o, { n: v, duration: 1.1, ease: 'power3.out', onUpdate: () => { shown.value = Math.round(o.n) } })
}, { immediate: true })
</script>

<template>
  <div class="card group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-pop sm:p-6">
    <span class="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-25 blur-xl transition group-hover:scale-125" :style="{ background: tint ?? '#6C4CF5' }" />
    <div class="relative flex items-start justify-between gap-2">
      <p class="text-xs font-medium leading-snug text-muted sm:text-sm">{{ label }}</p>
      <span v-if="icon" class="grid size-8 shrink-0 place-items-center rounded-xl sm:size-9 sm:rounded-2xl" :style="{ background: `${tint ?? '#6C4CF5'}22`, color: tint ?? '#6C4CF5' }">
        <component :is="icon" class="size-[18px]" />
      </span>
    </div>
    <p class="relative mt-2 font-display text-2xl font-bold sm:text-3xl tabular-nums">{{ formatNumber(shown, locale) }}</p>
    <p v-if="hint" class="relative mt-1 text-[11px] leading-snug text-muted sm:text-xs">{{ hint }}</p>
  </div>
</template>
