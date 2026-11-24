<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { gsap } from 'gsap'

const { isDark, toggle } = useTheme()
const { t } = useLocale()
const icon = ref<HTMLElement | null>(null)
const mounted = ref(false)
onMounted(() => { mounted.value = true })

function onClick(e: MouseEvent) {
  toggle({ x: e.clientX, y: e.clientY })
  if (icon.value && !prefersReducedMotion()) gsap.fromTo(icon.value, { rotate: -90, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.6, ease: 'back.out(2.5)', overwrite: true })
}
</script>

<template>
  <button type="button" class="btn-icon btn-ghost" :aria-label="t('common.toggleTheme')" :title="t('common.toggleTheme')" @click="onClick">
    <span ref="icon" class="grid place-items-center">
      <Moon v-if="mounted && !isDark" class="size-5" />
      <Sun v-else-if="mounted" class="size-5 text-sun" />
      <Sun v-else class="size-5 opacity-0" />
    </span>
  </button>
</template>
