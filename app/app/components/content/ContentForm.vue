<script setup lang="ts">
import { Check } from '@lucide/vue'
import type { Brand, ContentFormModel, Platform } from '~/types'
import { FORMATS, OBJECTIVES, PLATFORMS } from '~/types'


const model = defineModel<ContentFormModel>({ required: true })
/** hidePlatform: the post page picks platforms in its own Platforms card. */
const props = defineProps<{ brands: Brand[]; errors?: Record<string, string>; compact?: boolean; brandLocked?: boolean; hidePlatform?: boolean }>()
const { t } = useLocale()
const opt = useSelectOptions()
const brand = computed(() => props.brands.find((b) => b.id === model.value.brandId))
const pillars = computed(() => [...new Set(brand.value?.profile.pillars ?? [])]) // the brand's pillars; anything else can still be typed
const uid = useId()

// Creating a post: it can go to several platforms at once (the first picked is its main platform).
if (!Array.isArray(model.value.platforms) || !model.value.platforms.length) model.value.platforms = [model.value.platform]
function togglePlatform(p: Platform) {
  const list = model.value.platforms
  if (list.includes(p)) {
    if (list.length === 1) return
    model.value.platforms = list.filter((x) => x !== p)
  } else {
    model.value.platforms = [...list, p]
  }
  model.value.platform = model.value.platforms[0]!
}
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <div v-if="!brandLocked">
        <label class="label" :for="`${uid}-brand`">{{ t('generate.brand') }}</label>
        <UiSelect :id="`${uid}-brand`" v-model="model.brandId" :options="opt.brandList(brands)" />
      </div>
      <div :class="brandLocked ? 'sm:col-span-2' : ''">
        <label class="label" :for="`${uid}-title`">{{ t('content.fields.title') }} *</label>
        <input :id="`${uid}-title`" v-model="model.title" class="input" maxlength="200" :class="errors?.title && 'input-error'">
        <p v-if="errors?.title" class="field-error">{{ errors.title }}</p>
      </div>
    </div>
    <div v-if="!hidePlatform">
      <span :id="`${uid}-platforms`" class="label">{{ t('content.fields.platforms') }}</span>
      <div class="flex flex-wrap gap-2" role="group" :aria-labelledby="`${uid}-platforms`">
        <button v-for="p in PLATFORMS" :key="p" type="button"
          class="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95"
          :class="model.platforms.includes(p) ? 'border-brand-400 bg-brand-500/10 text-fg' : 'border-line text-muted hover:bg-surface-2'"
          :aria-pressed="model.platforms.includes(p)" @click="togglePlatform(p)">
          <UiPlatformBadge :platform="p" size="xs" />{{ PLATFORM_META[p].label }}<Check v-if="model.platforms.includes(p)" class="size-3.5 text-brand-500" />
        </button>
      </div>
      <p class="hint">{{ model.platforms.length > 1 ? t('content.platformsHintMany', { n: model.platforms.length }) : t('content.platformsHint') }}</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <div><label class="label" :for="`${uid}-format`">{{ t('content.fields.format') }}</label><UiSelect :id="`${uid}-format`" v-model="model.format" :options="opt.formats.value" /></div>
      <div><label class="label" :for="`${uid}-pillar`">{{ t('content.fields.pillar') }}</label><UiCombobox :id="`${uid}-pillar`" v-model="model.pillar" :suggestions="pillars" /></div>
      <div><label class="label" :for="`${uid}-obj`">{{ t('content.fields.objective') }}</label><UiSelect :id="`${uid}-obj`" v-model="model.objective" :options="opt.objectives.value" /></div>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div><label class="label" :for="`${uid}-date`">{{ t('content.fields.scheduledDate') }}</label><UiDatePicker :id="`${uid}-date`" v-model="model.scheduledDate" :invalid="!!errors?.scheduledDate" /><p v-if="errors?.scheduledDate" class="field-error">{{ errors.scheduledDate }}</p></div>
      <div><label class="label" :for="`${uid}-time`">{{ t('content.fields.scheduledTime') }}</label><UiTimePicker :id="`${uid}-time`" v-model="model.scheduledTime" /><p class="hint">{{ t('content.tzHint') }}</p></div>
    </div>
    <div><label class="label" :for="`${uid}-hook`">Hook</label><input :id="`${uid}-hook`" v-model="model.hook" class="input" maxlength="300"></div>
    <div v-if="!compact"><label class="label" :for="`${uid}-concept`">{{ t('content.fields.concept') }}</label><textarea :id="`${uid}-concept`" v-model="model.concept" class="input" rows="2" /></div>
    <div><label class="label" :for="`${uid}-caption`">{{ t('content.fields.caption') }}</label><textarea :id="`${uid}-caption`" v-model="model.caption" class="input" :rows="compact ? 4 : 7" maxlength="5000" /></div>
    <div class="grid gap-4 sm:grid-cols-2">
      <div><label class="label" :for="`${uid}-cta`">CTA</label><input :id="`${uid}-cta`" v-model="model.cta" class="input"></div>
      <div><label class="label" :for="`${uid}-tags`">Hashtags</label><input :id="`${uid}-tags`" v-model="model.hashtags" class="input" :placeholder="t('content.hashtagsPh')"></div>
    </div>
    <div v-if="!compact"><label class="label" :for="`${uid}-brief`">{{ t('content.fields.visualBrief') }}</label><textarea :id="`${uid}-brief`" v-model="model.visualBrief" class="input" rows="4" /></div>
    <div v-if="!compact && model.format === 'short_video'"><label class="label" :for="`${uid}-script`">{{ t('content.fields.videoScript') }}</label><textarea :id="`${uid}-script`" v-model="model.videoScript" class="input font-mono text-xs" rows="5" /></div>
  </div>
</template>
