<script setup lang="ts">
import { Lock, RefreshCw } from '@lucide/vue'
import type { Brand } from '~/types'

// Shown on a locked brand's pages: read-only for everyone until renewed.
defineProps<{ brand: Brand | null | undefined }>()
const { t } = useLocale()
</script>

<template>
  <section v-if="brand?.locked" v-anim class="mb-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] border border-danger/30 bg-danger/[0.06] p-4">
    <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-danger/15 text-danger"><Lock class="size-5" /></span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ t('brands.lockedTitle') }}</p>
      <p class="text-sm text-muted">{{ brand.isBillingOwner ? t('brands.lockedOwner') : t('brands.lockedMember') }}</p>
    </div>
    <NuxtLink v-if="brand.isBillingOwner" to="/app/plan#brands" class="btn-primary btn-sm"><RefreshCw class="size-3.5" />{{ t('brands.renewBrand') }}</NuxtLink>
  </section>
</template>
