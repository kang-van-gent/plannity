<script setup lang="ts">
const { t } = useLocale()
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
    <aside class="relative hidden overflow-hidden bg-brand-500 lg:block" data-parallax-root>
      <div class="absolute -left-24 top-16 size-[26rem] rounded-full bg-pink/70 blur-3xl" />
      <div class="absolute -right-20 bottom-0 size-[28rem] rounded-full bg-sky/60 blur-3xl" />
      <div class="absolute left-1/3 top-1/2 size-72 rounded-full bg-sun/60 blur-3xl" />
      <div class="relative flex h-full flex-col justify-between p-12 text-white">
        <NuxtLink to="/" class="inline-flex w-fit items-center gap-2 rounded-2xl bg-white/90 px-4 py-2.5 shadow-xl">
          <AppLogo variant="lockup" surface="light" class="h-9" eager />
        </NuxtLink>
        <div>
          <Doodle variant="spark" class="size-12 text-sun" />
          <p v-anim class="mt-4 max-w-md font-display text-5xl font-bold leading-tight">{{ t('auth.sideTitle') }}</p>
          <p v-anim="1" class="mt-4 max-w-md text-lg text-white/80">{{ t('auth.sideBody') }}</p>
        </div>
        <p class="font-display text-xl font-semibold text-white/90">Less planning. <span class="text-sun">More creating.</span></p>
      </div>
    </aside>
    <div class="flex min-h-dvh flex-col">
      <div class="flex items-center justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6">
        <UiBackButton fallback="/" class="sm:ml-0" />
        <div class="flex items-center gap-2"><LocaleSwitch /><ThemeToggle /></div>
      </div>
      <main class="flex flex-1 items-center justify-center px-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <div class="w-full max-w-md"><slot /></div>
      </main>
    </div>
  </div>
</template>
