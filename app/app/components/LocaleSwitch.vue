<script setup lang="ts">
const { locale, setLocale, t } = useLocale()
const options = [{ v: 'th', label: 'TH' }, { v: 'en', label: 'EN' }] as const
</script>

<template>
  <div class="relative inline-grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-0.5 text-xs font-bold" role="group" :aria-label="t('common.language')">
    <span class="absolute inset-y-0.5 left-0.5 rounded-[10px] bg-brand-500 shadow-pop transition-transform duration-300 ease-[var(--ease-spring)]"
      :class="locale === 'en' ? 'translate-x-full' : ''" style="width: calc(50% - 2px)" aria-hidden="true" />
    <button v-for="o in options" :key="o.v" type="button" class="relative z-10 px-2.5 py-1.5 transition-colors"
      :class="locale === o.v ? 'text-white' : 'text-muted hover:text-fg'" :aria-pressed="locale === o.v" @click="setLocale(o.v)">
      {{ o.label }}
    </button>
  </div>
</template>
