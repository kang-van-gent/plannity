<script setup lang="ts">
import { Mail } from '@lucide/vue'
const { t } = useLocale()
const config = useRuntimeConfig()
</script>

<template>
  <footer class="relative mt-24 overflow-hidden bg-surface">
    <div class="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
      <div>
        <AppLogo variant="full" class="h-24" />
        <p class="mt-4 max-w-sm text-sm text-muted">{{ t('footer.about') }}</p>
      </div>
      <div>
        <p class="font-display font-semibold">{{ t('footer.product') }}</p>
        <ul class="mt-3 space-y-2 text-sm text-muted">
          <li><NuxtLink to="/#how" class="hover:text-fg">{{ t('nav.howItWorks') }}</NuxtLink></li>
          <li><NuxtLink to="/pricing" class="hover:text-fg">{{ t('nav.pricing') }}</NuxtLink></li>
          <li><NuxtLink to="/register" class="hover:text-fg">{{ t('nav.tryFree') }}</NuxtLink></li>
        </ul>
      </div>
      <div>
        <p class="font-display font-semibold">{{ t('footer.company') }}</p>
        <ul class="mt-3 space-y-2 text-sm text-muted">
          <li><a :href="`mailto:${config.public.contactEmail}`" class="inline-flex items-center gap-1.5 hover:text-fg"><Mail class="size-4" />{{ config.public.contactEmail }}</a></li>
          <li><NuxtLink to="/privacy" class="hover:text-fg">{{ t('footer.privacy') }}</NuxtLink></li>
          <li><NuxtLink to="/terms" class="hover:text-fg">{{ t('footer.terms') }}</NuxtLink></li>
        </ul>
      </div>
    </div>
    <div>
      <p class="mx-auto max-w-7xl px-5 py-5 text-xs text-muted sm:px-8">© {{ new Date().getFullYear() }} Plannity · {{ t('brand.tagline') }}</p>
    </div>
  </footer>
</template>
