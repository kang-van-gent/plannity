<script setup lang="ts">
import { Check, ChevronDown, Layers, Settings2 } from '@lucide/vue'
import { gsap } from 'gsap'

const { active, scope, currentBrand, setScope } = useBrands()
const { t } = useLocale()
const notify = useNotify()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)

function choose(id: string) {
  const changed = id !== scope.value
  setScope(id)
  open.value = false
  if (changed) notify.info(t('brands.switched'), id === 'all' ? t('brands.allBrands') : active.value.find((b) => b.id === id)?.name)
}
function onDoc(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = false }
watch(open, async (v) => {
  if (v) {
    document.addEventListener('mousedown', onDoc)
    await nextTick()
    if (menu.value && !prefersReducedMotion()) gsap.fromTo(menu.value, { y: -8, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power3.out' })
  } else document.removeEventListener('mousedown', onDoc)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div ref="root" class="relative min-w-0" @keydown.esc="open = false">
    <button type="button" class="flex w-full min-w-0 max-w-[13rem] items-center gap-2 rounded-2xl border border-line bg-surface px-2.5 py-1.5 text-left shadow-soft transition hover:border-brand-300 sm:max-w-[16rem]"
      :aria-expanded="open" aria-haspopup="listbox" @click="open = !open">
      <UiBrandDot v-if="currentBrand" :name="currentBrand.name" :color="currentBrand.color" :size="26" />
      <span v-else class="grid size-[26px] place-items-center rounded-[35%] bg-gradient-to-br from-brand-500 to-pink text-white"><Layers class="size-3.5" /></span>
      <span class="min-w-0 flex-1">
        <span class="block text-[10px] font-semibold uppercase tracking-wider text-muted">{{ t('brands.scope') }}</span>
        <span class="block truncate text-sm font-semibold">{{ currentBrand?.name ?? t('brands.allBrands') }}</span>
      </span>
      <ChevronDown class="size-4 text-muted transition" :class="open ? 'rotate-180' : ''" />
    </button>
    <div v-if="open" ref="menu" role="listbox" class="absolute left-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-2 shadow-panel">
      <button type="button" role="option" :aria-selected="scope === 'all'" class="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2" @click="choose('all')">
        <span class="grid size-7 place-items-center rounded-[35%] bg-gradient-to-br from-brand-500 to-pink text-white"><Layers class="size-4" /></span>
        <span class="flex-1">{{ t('brands.allBrands') }}</span>
        <Check v-if="scope === 'all'" class="size-4 text-brand-500" />
      </button>
      <div class="my-1 border-t border-line" />
      <button v-for="b in active" :key="b.id" type="button" role="option" :aria-selected="scope === b.id"
        class="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2" @click="choose(b.id)">
        <UiBrandDot :name="b.name" :color="b.color" :size="28" />
        <span class="min-w-0 flex-1 truncate">{{ b.name }}</span>
        <Check v-if="scope === b.id" class="size-4 text-brand-500" />
      </button>
      <p v-if="!active.length" class="px-3 py-2 text-sm text-muted">{{ t('brands.none') }}</p>
      <div class="my-1 border-t border-line" />
      <NuxtLink to="/app/brands" class="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg" @click="open = false">
        <Settings2 class="size-4" />{{ t('brands.manage') }}
      </NuxtLink>
    </div>
  </div>
</template>
