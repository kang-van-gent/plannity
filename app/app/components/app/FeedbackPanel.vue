<script setup lang="ts">
import { Star } from '@lucide/vue'
import { gsap } from 'gsap'

const props = defineProps<{ open: boolean; contentId?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
const api = useApi()
const notify = useNotify()
const rating = ref(0)
const hover = ref(0)
const comment = ref('')
const saving = ref(false)
const error = ref('')
watch(() => props.open, (v) => { if (v) { rating.value = 0; comment.value = ''; error.value = '' } })

function pick(n: number, e: MouseEvent) {
  rating.value = n
  error.value = ''
  if (!prefersReducedMotion()) gsap.fromTo(e.currentTarget as HTMLElement, { scale: 0.6, rotate: -30 }, { scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(3)' })
}

async function submit() {
  if (!rating.value) { error.value = t('feedback.ratingRequired'); return }
  saving.value = true
  try {
    await api.feedback.submit({ contentId: props.contentId ?? null, rating: rating.value, comment: comment.value })
    notify.success(t('feedback.thanks'), t('feedback.thanksBody'))
    emit('close')
  } catch (e) {
    notify.fromError(e, { retry: submit })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SidePanel :open="open" size="sm" :title="t('feedback.title')" :subtitle="t('feedback.subtitle')" :dirty="rating > 0 || !!comment.trim()" @close="emit('close')">
    <div>
      <p class="label">{{ t('feedback.rating') }}</p>
      <div class="flex gap-1" role="radiogroup" :aria-label="t('feedback.rating')">
        <button v-for="n in 5" :key="n" type="button" role="radio" :aria-checked="rating === n" :aria-label="`${n}/5`"
          class="rounded-xl p-1.5 transition hover:bg-surface-2" @mouseenter="hover = n" @mouseleave="hover = 0" @click="pick(n, $event)">
          <Star class="size-8 transition" :class="(hover || rating) >= n ? 'fill-sun text-sun' : 'text-line'" />
        </button>
      </div>
      <p v-if="error" class="field-error">{{ error }}</p>
    </div>
    <div>
      <label class="label" for="fb-comment">{{ t('feedback.comment') }}</label>
      <textarea id="fb-comment" v-model="comment" class="input" maxlength="2000" rows="5" :placeholder="t('feedback.commentPh')" />
    </div>
    <template #footer="{ close }">
      <button type="button" class="btn-secondary" @click="close()">{{ t('common.cancel') }}</button>
      <button type="button" class="btn-primary" :disabled="saving" @click="submit">{{ saving ? t('common.saving') : t('feedback.send') }}</button>
    </template>
  </SidePanel>
</template>
