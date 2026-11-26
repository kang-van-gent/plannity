<script setup lang="ts">
import { CalendarDays, Coins, LayoutDashboard, Library, Lock, Megaphone, Settings, Store, WandSparkles } from '@lucide/vue'

defineProps<{ collapsed?: boolean }>()
const emit = defineEmits<{ navigate: [] }>()
const { t } = useLocale()
const route = useRoute()
const notify = useNotify()
const features = useFeatures()
const items = computed(() => ([
  { to: '/app', label: t('nav.dashboard'), icon: LayoutDashboard, exact: true, section: 'workspace' },
  { to: '/app/brands', label: t('nav.brands'), icon: Store, section: 'workspace' },
  { to: '/app/generate', label: t('nav.generate'), icon: WandSparkles, also: '/app/jobs', section: 'content' },
  { to: '/app/content', label: t('nav.library'), icon: Library, section: 'content' },
  { to: '/app/calendar', label: t('nav.calendar'), icon: CalendarDays, section: 'content' },
  { to: '/app/promote', label: t('nav.promote'), icon: Megaphone, section: 'content' },
  { to: '/app/credits', label: t('nav.credits'), icon: Coins, section: 'account' },
  { to: '/app/settings', label: t('nav.settings'), icon: Settings, section: 'account' },
] as { to: string; label: string; icon: unknown; exact?: boolean; also?: string; section: string }[]).map((i) => ({ ...i, locked: isLockedPath(i.to, features) })))
/** Items grouped under section labels, in menu order. */
const sections = computed(() => {
  const out: { key: string; items: typeof items.value }[] = []
  for (const i of items.value) {
    const last = out[out.length - 1]
    if (last?.key === i.section) last.items.push(i)
    else out.push({ key: i.section, items: [i] })
  }
  return out
})
function lockedTap() { notify.info(t('nav.lockedTitle'), t('nav.lockedBody')) }
function isActive(i: { to: string; exact?: boolean; also?: string }) {
  if (i.exact) return route.path === i.to
  return route.path.startsWith(i.to) || (!!i.also && route.path.startsWith(i.also))
}
</script>

<template>
  <nav class="grid gap-1" :aria-label="t('nav.main')">
    <template v-for="(sec, si) in sections" :key="sec.key">
    <!-- Section label; collapsed sidebar shows a thin divider instead -->
    <p v-if="!collapsed" :id="`nav-sec-${sec.key}`" class="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted/70" :class="si === 0 ? 'pt-0' : 'pt-4'">{{ t(`nav.sections.${sec.key}`) }}</p>
    <span v-else-if="si > 0" class="mx-auto my-2 block h-px w-8 bg-line" role="separator" :aria-label="t(`nav.sections.${sec.key}`)" />
    <template v-for="i in sec.items" :key="i.to">
      <button v-if="i.locked" type="button" aria-disabled="true" :title="`${i.label} · ${t('nav.lockedTitle')}`"
        class="group relative flex w-full cursor-not-allowed items-center gap-3 whitespace-nowrap rounded-2xl py-2.5 text-sm font-semibold text-muted/60 transition hover:bg-surface-2/60"
        :class="collapsed ? 'justify-center px-0' : 'px-3.5'" :aria-label="collapsed ? `${i.label} (${t('nav.comingSoon')})` : undefined" @click="lockedTap">
        <span class="relative shrink-0">
          <component :is="i.icon" class="size-[18px]" />
          <Lock v-if="collapsed" class="absolute -bottom-1 -right-1.5 size-3 rounded-full bg-surface text-muted" />
        </span>
        <template v-if="!collapsed">
          {{ i.label }}
          <span class="ml-auto inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted"><Lock class="size-3" />{{ t('nav.comingSoon') }}</span>
        </template>
      </button>
      <NuxtLink v-else :to="i.to" :aria-current="isActive(i) ? 'page' : undefined"
        class="group relative flex items-center gap-3 whitespace-nowrap rounded-2xl py-2.5 text-sm font-semibold transition"
        :class="[isActive(i) ? 'bg-brand-500 text-white shadow-pop' : 'text-muted hover:bg-surface-2 hover:text-fg', collapsed ? 'justify-center px-0' : 'px-3.5']"
        :title="collapsed ? i.label : undefined" :aria-label="collapsed ? i.label : undefined"
        @click="emit('navigate')">
        <component :is="i.icon" class="size-[18px] shrink-0 transition-transform group-hover:scale-110 group-hover:-rotate-6" />
        <template v-if="!collapsed">
          {{ i.label }}
          <Doodle v-if="isActive(i)" variant="spark" class="ml-auto size-3.5 text-sun" />
        </template>
      </NuxtLink>
    </template>
    </template>
  </nav>
</template>
