<script setup lang="ts">
const { t, tm } = useLocale()
useSeoMeta({ title: () => t('legal.termsTitle'), description: () => t('legal.termsIntro') })
</script>

<template>
  <article class="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
    <span v-anim class="chip bg-sun/20 text-amber-700 dark:text-sun">{{ t('legal.draft') }}</span>
    <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold sm:text-5xl">{{ t('legal.termsTitle') }}</h1>
    <p v-anim="2" class="mt-4 text-lg text-muted">{{ t('legal.termsIntro') }}</p>
    <section v-for="(s, i) in tm<{ h: string; p: string }[]>('legal.terms')" :key="i" v-anim class="mt-8">
      <h2 class="font-display text-2xl font-bold">{{ s.h }}</h2>
      <p class="mt-2 leading-relaxed text-muted">{{ s.p }}</p>
    </section>
  </article>
</template>
