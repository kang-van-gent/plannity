<script setup lang="ts">
import { Clock, Gem, Info, Lock, Plug } from '@lucide/vue'
import type { Platform } from '~/types'

/**
 * Brand → Social channels (plannity-context-social-publishing.md §4).
 * Where a brand connects its Facebook Page, Instagram and TikTok for automatic
 * publishing. Connecting isn't available yet, so every channel honestly shows
 * "Not connected": Solo sees it locked with an upgrade path, Team/Studio see
 * "Coming soon". Manual multi-platform posting works on every plan meanwhile.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })
const { t } = useLocale()
const api = useApi()
const route = useRoute()
const id = computed(() => String(route.params.id))
const brandQ = useQuery(() => api.brands.get(id.value), { watch: [id] })
useSeoMeta({ title: () => `${t('channels.title')} · ${brandQ.data.value?.name ?? ''}` })

const brand = computed(() => brandQ.data.value)
const included = computed(() => !!brand.value?.features?.socialConnections)
const canManage = computed(() => roleCan(brand.value?.myRole, 'brand.update')) // owner/admin

const CHANNELS: { platform: Platform; key: 'facebook' | 'instagram' | 'tiktok' }[] = [
  { platform: 'facebook', key: 'facebook' },
  { platform: 'instagram', key: 'instagram' },
  { platform: 'tiktok', key: 'tiktok' },
]
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <UiErrorState v-if="brandQ.error.value" :error="brandQ.error.value" @retry="brandQ.refresh()" />
    <UiSkeletonList v-else-if="!brand || !brandQ.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-5 flex items-center gap-4">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="brand.name" :color="brand.color" :size="56" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[26px] font-bold sm:text-3xl">{{ brand.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('channels.subtitle') }}</p>
        </div>
      </div>
      <BrandTabs :brand-id="brand.id" active="channels" />
      <BrandLockBanner :brand="brand" />

      <!-- Plan gate / availability -->
      <section v-if="!included" v-anim class="mb-5 flex flex-wrap items-center gap-3 rounded-[1.5rem] bg-gradient-to-r from-brand-500/15 to-pink/15 p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-500/20 text-brand-600 dark:text-brand-300"><Gem class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">{{ t('channels.lockedTitle') }}</p>
          <p class="text-sm text-muted">{{ brand.isBillingOwner ? t('channels.lockedOwner') : t('channels.lockedMember') }}</p>
        </div>
        <NuxtLink v-if="brand.isBillingOwner" to="/app/plan" class="btn-primary w-full sm:w-auto">{{ t('plan.viewPlans') }}</NuxtLink>
      </section>
      <section v-else v-anim class="mb-5 flex items-start gap-3 rounded-[1.5rem] bg-sky/15 p-4">
        <span class="grid size-10 shrink-0 place-items-center rounded-2xl bg-sky/25 text-sky-700 dark:text-sky"><Clock class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <p class="font-display text-lg font-bold">{{ t('channels.soonTitle') }}</p>
          <p class="text-sm text-muted">{{ t('channels.soonBody') }}</p>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-3">
        <article v-for="(c, i) in CHANNELS" :key="c.platform" v-anim="i" class="card card-pad flex flex-col">
          <div class="flex items-center gap-2">
            <UiPlatformBadge :platform="c.platform" with-label />
            <span class="chip ml-auto bg-surface-2 py-0.5 text-muted">
              <Lock v-if="!included" class="size-3" />{{ included ? t('channels.notConnected') : t('channels.locked') }}
            </span>
          </div>
          <p class="mt-3 flex-1 text-sm text-muted">{{ t(`channels.what.${c.key}`) }}</p>
          <button type="button" class="btn-secondary mt-4 w-full" disabled :title="included ? t('channels.soonTitle') : t('channels.lockedTitle')">
            <component :is="included ? Plug : Lock" class="size-4" />{{ included ? t('channels.connectSoon') : t('channels.connectLocked') }}
          </button>
        </article>
      </div>

      <p v-if="included && !canManage" class="mt-4 flex items-start gap-2 text-sm text-muted"><Info class="mt-0.5 size-4 shrink-0" />{{ t('channels.adminsOnly') }}</p>
      <p v-anim class="mt-5 rounded-2xl bg-surface-2 p-4 text-sm text-muted">{{ t('channels.manualMeanwhile') }}</p>
    </template>
  </div>
</template>
