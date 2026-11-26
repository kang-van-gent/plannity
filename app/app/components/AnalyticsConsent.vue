<script setup lang="ts">
import { Cookie } from '@lucide/vue'

// Asks once whether Google Analytics may set cookies (Thailand's PDPA). Shown
// only when Analytics is configured in Strapi with consent required. Not shown
// on the phone payment page.
const { t } = useLocale()
const route = useRoute()
const { needsChoice, choose } = useAnalytics()
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const show = computed(() => mounted.value && needsChoice.value && !/^\/(pay|auth)(\/|$)/.test(route.path))
</script>

<template>
  <Transition enter-from-class="translate-y-4 opacity-0" leave-to-class="translate-y-4 opacity-0" enter-active-class="transition duration-300 ease-out" leave-active-class="transition duration-200 ease-in">
    <div v-if="show" class="fixed inset-x-3 bottom-[calc(var(--tabbar-h,0px)+max(0.75rem,env(safe-area-inset-bottom)))] z-[150] sm:inset-x-auto sm:left-5 sm:max-w-md lg:bottom-5" role="dialog" aria-live="polite" :aria-label="t('consent.title')">
      <div class="rounded-3xl border border-line bg-surface p-4 shadow-pop sm:p-5">
        <div class="flex items-start gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-2xl bg-sun/20 text-amber-700 dark:text-sun"><Cookie class="size-5" /></span>
          <div class="min-w-0 text-sm">
            <p class="font-semibold">{{ t('consent.title') }}</p>
            <p class="mt-1 text-muted">{{ t('consent.body') }} <NuxtLink to="/privacy" class="font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">{{ t('consent.more') }}</NuxtLink></p>
          </div>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button type="button" class="btn-secondary btn-sm" @click="choose('denied')">{{ t('consent.decline') }}</button>
          <button type="button" class="btn-primary btn-sm" @click="choose('granted')">{{ t('consent.accept') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>
