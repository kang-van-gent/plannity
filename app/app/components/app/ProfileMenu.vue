<script setup lang="ts">
import { LogOut, Settings } from '@lucide/vue'
import { gsap } from 'gsap'

const { user, logout } = useSession()
const { t } = useLocale()
const notify = useNotify()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
function onDoc(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = false }
watch(open, async (v) => {
  if (v) {
    document.addEventListener('mousedown', onDoc)
    await nextTick()
    if (menu.value && !prefersReducedMotion()) gsap.fromTo(menu.value, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: 'power3.out' })
  } else document.removeEventListener('mousedown', onDoc)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))

async function signOut() {
  open.value = false
  const ok = await notify.confirm({ title: t('auth.logoutConfirm'), message: t('auth.logoutConfirmBody'), confirmLabel: t('auth.logout'), tone: 'warning' })
  if (!ok) return
  await logout()
  notify.info(t('auth.loggedOut'))
  await navigateTo('/login')
}
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button type="button" class="grid size-9 place-items-center rounded-full bg-gradient-to-br transition active:scale-95 sm:size-10 sm:rounded-2xl from-brand-500 to-pink font-display text-sm font-bold text-white shadow-pop"
      :aria-label="t('nav.profile')" :aria-expanded="open" @click="open = !open">
      {{ initials(user?.name ?? 'P').toUpperCase() }}
    </button>
    <div v-if="open" ref="menu" class="absolute right-0 top-full z-50 mt-2 w-64 rounded-3xl border border-line bg-surface p-2 shadow-panel">
      <div class="px-3 py-2">
        <p class="truncate font-semibold">{{ user?.name }}</p>
        <p class="truncate text-xs text-muted">{{ user?.email }}</p>
      </div>
      <div class="my-1 border-t border-line" />
      <NuxtLink to="/app/settings" class="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold hover:bg-surface-2" @click="open = false"><Settings class="size-4" />{{ t('nav.settings') }}</NuxtLink>
      <button type="button" class="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10" @click="signOut"><LogOut class="size-4" />{{ t('auth.logout') }}</button>
    </div>
  </div>
</template>
