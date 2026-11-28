<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check, ImagePlus, Pencil, Plus, Trash2, X } from '@lucide/vue'
import type { BrandInput, ContentLanguage, LogoChange } from '~/types'
import { DEFAULT_PILLARS, PLATFORMS } from '~/types'

const props = defineProps<{ initial?: BrandInput; stepped?: boolean; saving?: boolean; serverErrors?: Record<string, string>; submitLabel?: string; logoUrl?: string | null }>()
const emit = defineEmits<{ submit: [input: BrandInput, logo: LogoChange] }>()
const { t } = useLocale()
const notify = useNotify()

// ---- logo (picked here, uploaded by the page after saving) ----
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const logoInput = ref<HTMLInputElement | null>(null)
const logoFile = ref<File | null>(null)
const logoRemoved = ref(false)
const logoPreview = ref<string | null>(null)
function pickLogo(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!LOGO_TYPES.includes(file.type)) { notify.warning(t('brands.logo.errors.file_type')); return }
  if (file.size > 5 * 1024 * 1024) { notify.warning(t('brands.logo.errors.too_large')); return }
  editorSource.value = file // adjust it before it's used
}
// Image editor: crop / zoom / rotate / background, for a new file or the current logo.
const editorSource = ref<File | string | null>(null)
function editLogo() { editorSource.value = logoFile.value ?? (logoRemoved.value ? null : props.logoUrl ?? null) }
function applyEdited(file: File) {
  if (logoPreview.value) URL.revokeObjectURL(logoPreview.value)
  logoFile.value = file
  logoPreview.value = URL.createObjectURL(file)
  logoRemoved.value = false
  editorSource.value = null
}
function removeLogo() {
  if (logoPreview.value) URL.revokeObjectURL(logoPreview.value)
  logoFile.value = null
  logoPreview.value = null
  logoRemoved.value = true
}
const shownLogo = computed(() => logoPreview.value ?? (logoRemoved.value ? null : props.logoUrl ?? null))
const logoChange = (): LogoChange => (logoFile.value ? { file: logoFile.value } : logoRemoved.value && props.logoUrl ? { remove: true } : null)
// Saved (the page passes the new URL back): start clean.
watch(() => props.logoUrl, () => { removeLogo(); logoRemoved.value = false })
onBeforeUnmount(() => { if (logoPreview.value) URL.revokeObjectURL(logoPreview.value) })

const blank = (): BrandInput => ({
  name: '', color: BRAND_COLORS[0],
  profile: { industry: '', description: '', products: '', usp: '', audience: '', painPoints: '', tone: '', language: 'th', platforms: ['facebook', 'instagram'], guidelines: '', forbiddenWords: '', competitors: '', pillars: ['Education', 'Promotion', 'Community'], ctaPreferences: '', goals: '' },
})
const form = reactive<BrandInput>(props.initial ? JSON.parse(JSON.stringify(props.initial)) : blank())
const errors = reactive<Record<string, string>>({})
watch(() => props.serverErrors, (e) => { if (e) for (const [k, v] of Object.entries(e)) errors[k] = t(`validation.${v}`) })

const newPillar = ref('')
function addPillar() {
  const p = newPillar.value.trim()
  if (p && !form.profile.pillars.includes(p) && form.profile.pillars.length < 8) form.profile.pillars.push(p)
  newPillar.value = ''
}
function togglePlatform(p: (typeof PLATFORMS)[number]) {
  const list = form.profile.platforms
  const i = list.indexOf(p)
  if (i >= 0) list.splice(i, 1)
  else list.push(p)
}
const languages: ContentLanguage[] = ['th', 'en', 'th-en']

// Stepped onboarding: brand basics → audience & voice → channels & goals.
const STEPS = ['basics', 'audience', 'channels'] as const
const step = ref(0)
const stepEl = ref<HTMLElement | null>(null)
// Sections animate in via v-anim: up on first load, sideways when moving between steps.
const enterFrom = ref<'up' | 'left' | 'right'>('up')
const enter = computed(() => ({ from: enterFrom.value }))
const show = (s: (typeof STEPS)[number]) => !props.stepped || STEPS[step.value] === s

function validate(scope: 'basics' | 'all'): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = t('validation.required')
  if (!form.profile.description.trim()) errors.description = t('validation.required')
  if (scope === 'all' && !form.profile.platforms.length) errors.platforms = t('validation.pick_one')
  return !Object.keys(errors).length
}

async function go(dir: 1 | -1) {
  if (dir === 1 && step.value === 0 && !validate('basics')) return
  enterFrom.value = dir === 1 ? 'right' : 'left'
  step.value = Math.max(0, Math.min(STEPS.length - 1, step.value + dir))
}

function submit() {
  if (!validate('all')) {
    if (props.stepped && (errors.name || errors.description)) step.value = 0
    return
  }
  emit('submit', JSON.parse(JSON.stringify(form)), logoChange())
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <ol v-if="stepped" v-anim class="mb-6 flex items-center gap-2" :aria-label="t('brands.onboardingSteps')">
      <li v-for="(s, i) in STEPS" :key="s" class="flex flex-1 items-center gap-2">
        <span class="grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold transition" :class="i < step ? 'bg-success text-white' : i === step ? 'bg-brand-500 text-white shadow-pop' : 'bg-surface-2 text-muted'">
          <Check v-if="i < step" class="size-4" /><template v-else>{{ i + 1 }}</template>
        </span>
        <span class="hidden text-sm font-semibold sm:inline" :class="i === step ? '' : 'text-muted'">{{ t(`brands.steps.${s}`) }}</span>
        <span v-if="i < STEPS.length - 1" class="h-0.5 flex-1 rounded-full" :class="i < step ? 'bg-success' : 'bg-line'" />
      </li>
    </ol>

    <div ref="stepEl" class="space-y-5">
      <section v-if="show('basics')" v-anim="enter" class="card card-pad space-y-4">
        <h2 class="font-display text-lg font-bold">{{ t('brands.sections.basics') }}</h2>
        <!-- Logo: shown wherever the brand appears (initials on the brand colour until one is added) -->
        <div class="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2/60 p-3 sm:p-4">
          <UiBrandDot :name="form.name || '?'" :color="form.color" :logo="shownLogo" :size="64" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{{ t('brands.logo.title') }}<span v-if="logoFile" class="chip ml-2 bg-sun/15 py-0.5 text-amber-700 dark:text-sun">{{ t('brands.logo.unsaved') }}</span></p>
            <p class="text-xs text-muted">{{ t('brands.logo.hint') }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="btn-secondary btn-sm" @click="logoInput?.click()"><ImagePlus class="size-4" />{{ shownLogo ? t('brands.logo.change') : t('brands.logo.upload') }}</button>
              <button v-if="shownLogo" type="button" class="btn-secondary btn-sm" @click="editLogo"><Pencil class="size-4" />{{ t('brands.logo.edit') }}</button>
              <button v-if="shownLogo" type="button" class="btn-ghost btn-sm text-danger" @click="removeLogo"><Trash2 class="size-4" />{{ t('brands.logo.remove') }}</button>
            </div>
          </div>
          <input ref="logoInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" tabindex="-1" aria-hidden="true" @change="pickLogo">
          <UiImageEditor :open="!!editorSource" :source="editorSource" shape="rounded" backgrounds :brand-color="form.color" initial-fit="contain"
            :title="t('brands.logo.editTitle')" file-name="logo" @close="editorSource = null" @apply="applyEdited" />
        </div>
        <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label class="label" for="b-name">{{ t('brands.fields.name') }} *</label>
            <input id="b-name" v-model="form.name" class="input" maxlength="80" :class="errors.name && 'input-error'">
            <p v-if="errors.name" class="field-error">{{ errors.name }}</p>
          </div>
          <div>
            <span class="label">{{ t('brands.fields.color') }}</span>
            <div class="flex gap-1.5">
              <button v-for="c in BRAND_COLORS" :key="c" type="button" class="size-9 rounded-xl ring-offset-2 ring-offset-surface transition hover:scale-110" :class="form.color === c ? 'ring-2 ring-brand-500' : ''" :style="{ background: c }" :aria-label="c" :aria-pressed="form.color === c" @click="form.color = c" />
            </div>
          </div>
        </div>
        <div>
          <label class="label" for="b-industry">{{ t('brands.fields.industry') }}</label>
          <input id="b-industry" v-model="form.profile.industry" class="input" maxlength="120" :placeholder="t('brands.ph.industry')">
        </div>
        <div>
          <label class="label" for="b-desc">{{ t('brands.fields.description') }} *</label>
          <textarea id="b-desc" v-model="form.profile.description" class="input" maxlength="1500" rows="3" :class="errors.description && 'input-error'" :placeholder="t('brands.ph.description')" />
          <p v-if="errors.description" class="field-error">{{ errors.description }}</p>
          <p v-else class="hint">{{ t('brands.descriptionHint') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="b-products">{{ t('brands.fields.products') }}</label><textarea id="b-products" v-model="form.profile.products" class="input" rows="2" :placeholder="t('brands.ph.products')" /></div>
          <div><label class="label" for="b-usp">{{ t('brands.fields.usp') }}</label><textarea id="b-usp" v-model="form.profile.usp" class="input" rows="2" /></div>
        </div>
      </section>

      <section v-if="show('audience')" v-anim="enter" class="card card-pad space-y-4">
        <h2 class="font-display text-lg font-bold">{{ t('brands.sections.audience') }}</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="b-aud">{{ t('brands.fields.audience') }}</label><textarea id="b-aud" v-model="form.profile.audience" class="input" rows="2" /></div>
          <div><label class="label" for="b-pain">{{ t('brands.fields.painPoints') }}</label><textarea id="b-pain" v-model="form.profile.painPoints" class="input" rows="2" /></div>
          <div><label class="label" for="b-tone">{{ t('brands.fields.tone') }}</label><input id="b-tone" v-model="form.profile.tone" class="input" :placeholder="t('brands.ph.tone')"></div>
          <div>
            <label class="label" for="b-lang">{{ t('brands.fields.language') }}</label>
            <UiSelect id="b-lang" v-model="form.profile.language" :options="languages.map((l) => ({ value: l, label: t(`brands.languages.${l}`) }))" />
          </div>
        </div>
        <div><label class="label" for="b-guide">{{ t('brands.fields.guidelines') }}</label><textarea id="b-guide" v-model="form.profile.guidelines" class="input" rows="2" /></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="b-forbid">{{ t('brands.fields.forbiddenWords') }}</label><textarea id="b-forbid" v-model="form.profile.forbiddenWords" class="input" rows="2" :placeholder="t('brands.ph.forbidden')" /></div>
          <div><label class="label" for="b-comp">{{ t('brands.fields.competitors') }} <span class="font-normal text-muted">({{ t('common.optional') }})</span></label><textarea id="b-comp" v-model="form.profile.competitors" class="input" rows="2" /></div>
        </div>
      </section>

      <section v-if="show('channels')" v-anim="enter" class="card card-pad space-y-4">
        <h2 class="font-display text-lg font-bold">{{ t('brands.sections.channels') }}</h2>
        <div>
          <span class="label">{{ t('brands.fields.platforms') }}</span>
          <div class="flex flex-wrap gap-2">
            <button v-for="p in PLATFORMS" :key="p" type="button" class="chip-toggle" :aria-pressed="form.profile.platforms.includes(p)" @click="togglePlatform(p)">
              <UiPlatformBadge :platform="p" size="xs" />{{ PLATFORM_META[p].label }}
            </button>
          </div>
          <p v-if="errors.platforms" class="field-error">{{ errors.platforms }}</p>
        </div>
        <div>
          <span class="label">{{ t('brands.fields.pillars') }}</span>
          <div class="flex flex-wrap items-center gap-2">
            <span v-for="(p, i) in form.profile.pillars" :key="p" class="chip bg-brand-500/10 py-1.5 text-brand-600 dark:text-brand-300">
              {{ p }}<button type="button" class="rounded-full p-0.5 hover:bg-brand-500/20" :aria-label="t('common.remove')" @click="form.profile.pillars.splice(i, 1)"><X class="size-3" /></button>
            </span>
            <div class="flex items-center gap-1">
              <UiCombobox v-model="newPillar" class="w-48" size="sm" :suggestions="DEFAULT_PILLARS.filter((p) => !form.profile.pillars.includes(p))" :placeholder="t('brands.ph.pillar')" :aria-label="t('brands.ph.pillar')" @enter="addPillar()" />
              <button type="button" class="btn-icon btn-secondary p-2" :aria-label="t('common.add')" @click="addPillar"><Plus class="size-4" /></button>
            </div>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="b-cta">{{ t('brands.fields.ctaPreferences') }}</label><textarea id="b-cta" v-model="form.profile.ctaPreferences" class="input" rows="2" :placeholder="t('brands.ph.cta')" /></div>
          <div><label class="label" for="b-goals">{{ t('brands.fields.goals') }}</label><textarea id="b-goals" v-model="form.profile.goals" class="input" rows="2" /></div>
        </div>
      </section>
    </div>

    <!-- Sticky action bar above the tab bar on phones/tablets. -->
    <div v-anim class="sticky bottom-[calc(var(--tabbar-h,0px)+0.75rem)] z-30 mt-6 flex items-center justify-end gap-2 max-lg:rounded-[1.5rem] max-lg:border max-lg:border-line max-lg:bg-surface/90 max-lg:p-2 max-lg:shadow-panel max-lg:backdrop-blur-xl lg:static max-lg:[&>.btn-primary]:flex-1">
      <template v-if="stepped">
        <button v-if="step > 0" type="button" class="btn-secondary mr-auto max-sm:px-3.5" :aria-label="t('common.back')" @click="go(-1)"><ArrowLeft class="size-4" /><span class="max-sm:hidden">{{ t('common.back') }}</span></button>
        <button v-if="step > 0 && step < STEPS.length - 1" type="button" class="btn-ghost max-sm:px-2.5" :disabled="saving" @click="submit">{{ t('brands.skipAndSave') }}</button>
        <button v-if="step < STEPS.length - 1" type="button" class="btn-primary max-lg:flex-1" @click="go(1)">{{ t('common.next') }}<ArrowRight class="size-4" /></button>
        <button v-else type="submit" class="btn-primary max-lg:flex-1" :disabled="saving">{{ saving ? t('common.saving') : (submitLabel ?? t('common.save')) }}</button>
      </template>
      <button v-else type="submit" class="btn-primary" :disabled="saving">{{ saving ? t('common.saving') : (submitLabel ?? t('common.save')) }}</button>
    </div>
  </form>
</template>
