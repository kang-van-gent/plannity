<script setup lang="ts">
const { t, tm } = useLocale()
const analytics = useAnalytics()
const notify = useNotify()
function askAgain() {
  analytics.reset()
  notify.info(t('consent.settings'), t('consent.settingsBody'))
}
useSeoMeta({ title: () => t('legal.privacyTitle'), description: () => t('legal.privacyIntro') })
</script>

<template>
  <article class="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
    <span v-anim class="chip bg-sun/20 text-amber-700 dark:text-sun">{{ t('legal.draft') }}</span>
    <h1 v-anim="1" class="mt-4 font-display text-4xl font-bold sm:text-5xl">{{ t('legal.privacyTitle') }}</h1>
    <p v-anim="2" class="mt-4 text-lg text-muted">{{ t('legal.privacyIntro') }}</p>
    <section v-for="(s, i) in tm<{ h: string; p: string }[]>('legal.privacy')" :key="i" v-anim class="mt-8">
      <h2 class="font-display text-2xl font-bold">{{ s.h }}</h2>
      <p class="mt-2 leading-relaxed text-muted">{{ s.p }}</p>
    </section>
    <!-- Analytics cookie choice (only when Google Analytics is set up in Strapi) -->
    <ClientOnly>
      <section v-if="analytics.configured.value" class="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-surface p-5">
        <div>
          <p class="font-semibold">{{ t('consent.settings') }}</p>
          <p class="text-sm text-muted">{{ t('consent.settingsBody') }}</p>
        </div>
        <button type="button" class="btn-secondary btn-sm" @click="askAgain">{{ t('consent.reset') }}</button>
      </section>
    </ClientOnly>
  </article>
</template>
