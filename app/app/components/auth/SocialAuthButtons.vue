<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import type { SocialProvider } from '~/types'

// Google / Facebook / Apple sign-in. Same buttons for login and sign-up: a
// social account that doesn't exist yet is created on first use.
const props = withDefaults(defineProps<{ next?: string }>(), { next: '/app' })
const { t } = useLocale()
const session = useSession()
const notify = useNotify()
const busy = ref<SocialProvider | null>(null)

const PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'apple', label: 'Apple' },
]

async function go(p: SocialProvider) {
  if (busy.value) return
  busy.value = p
  try {
    const user = await session.socialLogin(p, props.next)
    if (!user) return // full-page redirect to the provider is under way; keep the spinner
    notify.success(t('auth.welcomeBack', { name: user.name }), t('auth.welcomeBackBody'))
    await navigateTo(props.next)
  } catch (e) {
    notify.fromError(e, { retry: () => go(p) })
  }
  busy.value = null
}
</script>

<template>
  <div class="grid grid-cols-3 gap-2">
    <button v-for="p in PROVIDERS" :key="p.id" type="button" :disabled="!!busy"
      class="btn group relative h-12 border text-[15px] shadow-soft disabled:opacity-100"
      :class="{
        'border-line bg-surface text-fg hover:border-brand-300 hover:shadow-pop': p.id === 'google',
        'border-transparent bg-[#1877F2] text-white hover:brightness-110': p.id === 'facebook',
        'border-transparent bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200': p.id === 'apple',
        'opacity-60': busy && busy !== p.id,
      }"
      :aria-label="t('auth.continueWith', { provider: p.label })" :aria-busy="busy === p.id" @click="go(p.id)">
      <LoaderCircle v-if="busy === p.id" class="size-5 animate-spin" />
      <!-- Google "G" -->
      <svg v-else-if="p.id === 'google'" viewBox="0 0 48 48" class="size-5 shrink-0" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      <!-- Facebook "f" -->
      <svg v-else-if="p.id === 'facebook'" viewBox="0 0 24 24" class="size-5 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" />
      </svg>
      <!-- Apple -->
      <svg v-else viewBox="0 0 24 24" class="size-5 shrink-0 -translate-y-px" fill="currentColor" aria-hidden="true">
        <path d="M16.37 1.43c0 1.14-.42 2.2-1.24 3.08-.98 1.05-2.17 1.66-3.46 1.56-.02-.14-.03-.28-.03-.43 0-1.1.48-2.27 1.33-3.16.42-.45.96-.83 1.61-1.13.65-.3 1.26-.46 1.84-.49.02.19.04.38.04.57h-.09zm4.1 16.65c-.37.86-.81 1.65-1.32 2.37-.69.99-1.26 1.67-1.7 2.05-.68.62-1.4.94-2.18.96-.56 0-1.23-.16-2.02-.48-.79-.32-1.52-.48-2.19-.48-.7 0-1.45.16-2.25.48-.8.32-1.45.49-1.94.51-.75.03-1.5-.3-2.24-1-.48-.41-1.07-1.12-1.79-2.13-.77-1.07-1.4-2.32-1.9-3.74C.24 15.08 0 13.6 0 12.17c0-1.64.35-3.06 1.06-4.24a6.23 6.23 0 0 1 2.23-2.25 6 6 0 0 1 3.01-.85c.6 0 1.38.18 2.35.55.97.36 1.59.55 1.86.55.2 0 .89-.22 2.06-.65 1.1-.4 2.04-.56 2.8-.5 2.07.17 3.63.98 4.66 2.45-1.85 1.12-2.77 2.7-2.75 4.72.02 1.57.59 2.88 1.7 3.92.5.48 1.06.85 1.69 1.11-.14.39-.28.77-.44 1.14z" />
      </svg>
      <span>{{ p.label }}</span>
    </button>
  </div>
</template>
