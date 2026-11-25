<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import type { ActivityEntityType } from '~/types'

// Brand activity log: who did what, when — brand details, content, team.
definePageMeta({ layout: 'app', middleware: 'auth' })
const { t } = useLocale()
const api = useApi()
const route = useRoute()
const id = computed(() => String(route.params.id))
const brandQ = useQuery(() => api.brands.get(id.value), { watch: [id] })
useSeoMeta({ title: () => `${t('activity.title')} · ${brandQ.data.value?.name ?? ''}` })

const filters: (ActivityEntityType | 'all')[] = ['all', 'brand', 'content', 'member']
const filter = ref<ActivityEntityType | 'all'>('all')
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <NuxtLink to="/app/brands" class="btn-ghost btn-sm mb-4 -ml-2"><ArrowLeft class="size-4" />{{ t('nav.brands') }}</NuxtLink>
    <UiErrorState v-if="brandQ.error.value" :error="brandQ.error.value" @retry="brandQ.refresh()" />
    <UiSkeletonList v-else-if="!brandQ.data.value || !brandQ.ready.value" :rows="3" />
    <template v-else>
      <div class="mb-5 flex items-center gap-4">
        <UiBrandDot v-anim="{ from: 'pop' }" :name="brandQ.data.value.name" :color="brandQ.data.value.color" :size="56" />
        <div class="min-w-0 flex-1">
          <h1 v-anim="1" class="truncate font-display text-[26px] font-bold sm:text-3xl">{{ brandQ.data.value.name }}</h1>
          <p v-anim="2" class="text-sm text-muted">{{ t('activity.subtitle', { brand: brandQ.data.value.name }) }}</p>
        </div>
      </div>
      <BrandTabs :brand-id="brandQ.data.value.id" active="activity" />

      <section v-anim class="card card-pad">
        <div class="segmented mb-4 w-full sm:w-auto" role="group" :aria-label="t('activity.title')">
          <button v-for="f in filters" :key="f" type="button" :aria-pressed="filter === f" @click="filter = f">{{ t(`activity.filters.${f}`) }}</button>
        </div>
        <ActivityFeed :brand-id="brandQ.data.value.id" :entity-type="filter === 'all' ? undefined : filter" />
      </section>
    </template>
  </div>
</template>
