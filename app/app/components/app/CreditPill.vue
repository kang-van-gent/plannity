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
  gsap.to(o, { n: v, duration: 0.9, ease: 'power2.out', onUpdate: () => { shown.value = Math.round(o.n) } })
  if (pill.value) gsap.fromTo(pill.value, { scale: 1 }, { scale: 1.12, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.inOut' })
}, { immediate: true })
</script>

<template>
  <span ref="pill" class="inline-flex"><NuxtLink to="/app/credits" class="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-sun/25 to-pink/20 px-3 py-2 text-sm font-bold transition hover:shadow-pop"
    :title="t('credits.available')">
    <Coins class="size-4 text-amber-600 dark:text-sun" />
    <span class="tabular-nums">{{ wallet ? formatNumber(shown, locale) : '–' }}</span>
    <span class="hidden font-medium text-muted sm:inline">{{ t('credits.unit') }}</span>
    <span v-if="wallet?.reserved" class="hidden rounded-lg bg-surface/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted md:inline">{{ t('credits.reservedShort', { n: wallet.reserved }) }}</span>
  </NuxtLink></span>
</template>
