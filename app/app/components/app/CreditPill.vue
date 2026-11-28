<script setup lang="ts">
import { Coins } from '@lucide/vue'
import { gsap } from 'gsap'

const { wallet } = useWallet()
const { t, locale } = useLocale()
const shown = ref(0)
const pill = ref<HTMLElement | null>(null)
watch(() => wallet.value?.available, (v, old) => {
  if (v === undefined) return
  if (old === undefined || prefersReducedMotion()) { shown.value = v; return }
  const o = { n: shown.value }
  gsap.to(o, { n: v, overwrite: true, duration: 0.9, ease: 'power2.out', onUpdate: () => { shown.value = Math.round(o.n) } })
  if (pill.value) gsap.fromTo(pill.value, { scale: 1 }, { scale: 1.12, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut', overwrite: true })
}, { immediate: true })
</script>

<template>
  <span ref="pill" class="inline-flex"><NuxtLink to="/app/credits" class="flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-sun/25 to-pink/20 pl-1 pr-3 text-sm font-bold transition hover:shadow-pop active:scale-95 sm:h-10 sm:gap-2 sm:rounded-2xl sm:px-3"
    :title="t('credits.available')">
    <span class="grid size-7 place-items-center rounded-full bg-surface/80 sm:contents"><Coins class="size-4 text-amber-600 dark:text-sun" /></span>
    <span class="tabular-nums">{{ wallet ? formatNumber(shown, locale) : '–' }}</span>
    <span class="hidden font-medium text-muted sm:inline">{{ t('credits.unit') }}</span>
    <span v-if="wallet?.reserved" class="hidden rounded-lg bg-surface/70 px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted md:inline">{{ t('credits.reservedShort', { n: wallet.reserved }) }}</span>
  </NuxtLink></span>
</template>
