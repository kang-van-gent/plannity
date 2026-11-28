<script setup lang="ts">
import { Check, ChevronDown, Layers, Lock, Settings2 } from '@lucide/vue'
import { gsap } from 'gsap'

// Phones: an app-style title button that opens a bottom sheet.
// sm and up: a bordered selector with a dropdown.
const { active, scope, currentBrand, setScope } = useBrands()
const { t } = useLocale()
const notify = useNotify()
const open = ref(false)
const sheet = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const sheetEl = ref<HTMLElement | null>(null)

function toggle() {
  if (open.value || sheet.value) return close()
  if (window.matchMedia('(max-width: 639px)').matches) sheet.value = true
  else open.value = true
}
function close() { open.value = false; sheet.value = false }

function choose(id: string) {
  const changed = id !== scope.value
  setScope(id)
  close()
  const b = active.value.find((x) => x.id === id)
  // Locked brands can still be opened to view and download — but not edited.
  if (changed && b?.locked) notify.warning(t('brands.lockedTitle'), b.isBillingOwner ? t('brands.lockedOwner') : t('brands.lockedMember'), b.isBillingOwner ? { action: { label: t('brands.renewBrand'), handler: () => navigateTo('/app/plan#brands') } } : undefined)
  else if (changed) notify.info(t('brands.switched'), id === 'all' ? t('brands.allBrands') : b?.name)
}
function onDoc(e: MouseEvent) { if (root.value && !root.value.contains(e.target as Node)) open.value = false }
watch(open, async (v) => {
  if (v) {
    document.addEventListener('mousedown', onDoc)
    await nextTick()
    if (menu.value && !prefersReducedMotion()) gsap.fromTo(menu.value, { y: -8, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power3.out' })
  } else document.removeEventListener('mousedown', onDoc)
})
watch(sheet, (v) => { document.documentElement.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc)
  if (sheet.value) document.documentElement.style.overflow = ''
})

// Bottom sheet motion + drag-down-to-dismiss.
function onSheetEnter(el: Element, done: () => void) {
  const fin = () => { el.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true }); done() }
  if (prefersReducedMotion()) return fin()
  gsap.timeline({ onComplete: fin })
    .fromTo(el.querySelector('[data-sheet-backdrop]'), { opacity: 0 }, { opacity: 1, duration: 0.25 })
    .fromTo(el.querySelector('[data-sheet]'), { yPercent: 100 }, { yPercent: 0, duration: 0.5, ease: 'expo.out' }, 0)
    .fromTo(el.querySelectorAll('[data-sheet-item]'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power3.out', clearProps: 'transform' }, 0.08)
}
function onSheetLeave(el: Element, done: () => void) {
  if (prefersReducedMotion()) return done()
  gsap.timeline({ onComplete: done })
    .to(el.querySelector('[data-sheet]'), { yPercent: 100, duration: 0.3, ease: 'power3.in' })
    .to(el.querySelector('[data-sheet-backdrop]'), { opacity: 0, duration: 0.25 }, 0.05)
}
let drag: { id: number; y0: number; t0: number; dy: number } | null = null
function onDragDown(e: PointerEvent) {
  drag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onDragMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || !sheetEl.value) return
  drag.dy = Math.max(0, e.clientY - drag.y0)
  gsap.set(sheetEl.value, { y: drag.dy })
}
function onDragUp() {
  if (!drag || !sheetEl.value) return
  const d = drag
  drag = null
  const v = d.dy / Math.max(1, performance.now() - d.t0)
  if (d.dy > sheetEl.value.offsetHeight * 0.25 || (v > 0.5 && d.dy > 30)) { gsap.set(sheetEl.value, { y: 0 }); return close() }
  gsap.to(sheetEl.value, { y: 0, duration: 0.3, ease: 'power3.out' })
}
</script>

<template>
  <div ref="root" class="relative min-w-0" @keydown.esc="close">
    <button type="button"
      class="group flex w-full min-w-0 items-center gap-2.5 rounded-2xl py-1 pl-1 pr-2 text-left transition active:scale-[0.98] sm:max-w-[16rem] sm:gap-2 sm:border sm:border-line sm:bg-surface sm:px-2.5 sm:py-1.5 sm:shadow-soft sm:hover:border-brand-300"
      :aria-expanded="open || sheet" aria-haspopup="listbox" :aria-label="`${t('brands.scope')}: ${currentBrand?.name ?? t('brands.allBrands')}`" @click="toggle">
      <template v-if="currentBrand">
        <span class="flex sm:hidden"><UiBrandDot :name="currentBrand.name" :color="currentBrand.color" :size="34" /></span>
        <span class="hidden sm:flex"><UiBrandDot :name="currentBrand.name" :color="currentBrand.color" :size="26" /></span>
      </template>
      <span v-else class="grid size-[34px] shrink-0 place-items-center rounded-[35%] bg-gradient-to-br from-brand-500 to-pink text-white sm:size-[26px]"><Layers class="size-4 sm:size-3.5" /></span>
      <span class="min-w-0 flex-1">
        <span class="block text-[0.6875rem] font-medium leading-tight text-muted sm:text-[0.625rem] sm:font-semibold sm:uppercase sm:tracking-wider">{{ t('brands.scope') }}</span>
        <span class="flex min-w-0 items-center gap-1 font-display text-[1.0625rem] font-bold leading-tight sm:font-sans sm:text-sm sm:font-semibold">
          <span class="truncate">{{ currentBrand?.name ?? t('brands.allBrands') }}</span>
          <Lock v-if="currentBrand?.locked" class="size-3.5 shrink-0 text-danger" :aria-label="t('brands.locked')" />
          <ChevronDown class="size-4 shrink-0 text-muted transition sm:hidden" :class="sheet ? 'rotate-180' : ''" />
        </span>
      </span>
      <ChevronDown class="hidden size-4 text-muted transition sm:block" :class="open ? 'rotate-180' : ''" />
    </button>

    <!-- sm+: dropdown -->
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
        <span class="min-w-0 flex-1 truncate" :class="b.locked && 'text-muted'">{{ b.name }}</span>
        <span v-if="b.locked" class="chip shrink-0 bg-danger/12 py-0.5 text-[0.6875rem] text-danger"><Lock class="size-3" />{{ t('brands.locked') }}</span>
        <Check v-if="scope === b.id" class="size-4 text-brand-500" />
      </button>
      <p v-if="!active.length" class="px-3 py-2 text-sm text-muted">{{ t('brands.none') }}</p>
      <div class="my-1 border-t border-line" />
      <NuxtLink to="/app/brands" class="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-fg" @click="open = false">
        <Settings2 class="size-4" />{{ t('brands.manage') }}
      </NuxtLink>
    </div>

    <!-- phones: bottom sheet -->
    <Teleport to="#teleports">
      <Transition :css="false" @enter="onSheetEnter" @leave="onSheetLeave">
        <div v-if="sheet" class="fixed inset-0 z-[110] sm:hidden" @keydown.esc="close">
          <div data-sheet-backdrop class="absolute inset-0 bg-ink/50" @click="close" />
          <div ref="sheetEl" data-sheet role="dialog" aria-modal="true" :aria-label="t('brands.scope')"
            class="absolute inset-x-0 bottom-0 flex max-h-[82dvh] flex-col rounded-t-[1.75rem] bg-surface shadow-panel">
            <div class="cursor-grab touch-none px-5 pb-2 pt-3" @pointerdown="onDragDown" @pointermove="onDragMove" @pointerup="onDragUp" @pointercancel="onDragUp">
              <span class="mx-auto block h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
              <p class="mt-3 font-display text-lg font-bold">{{ t('brands.scope') }}</p>
            </div>
            <div role="listbox" class="relative flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-2">
              <button data-sheet-item type="button" role="option" :aria-selected="scope === 'all'"
                class="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold transition active:scale-[0.98]"
                :class="scope === 'all' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'active:bg-surface-2'" @click="choose('all')">
                <span class="grid size-10 place-items-center rounded-[35%] bg-gradient-to-br from-brand-500 to-pink text-white"><Layers class="size-5" /></span>
                <span class="flex-1">{{ t('brands.allBrands') }}</span>
                <span class="grid size-6 place-items-center rounded-full" :class="scope === 'all' ? 'bg-brand-500 text-white' : 'border-2 border-line'"><Check v-if="scope === 'all'" class="size-3.5" /></span>
              </button>
              <button v-for="b in active" :key="b.id" data-sheet-item type="button" role="option" :aria-selected="scope === b.id"
                class="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold transition active:scale-[0.98]"
                :class="scope === b.id ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'active:bg-surface-2'" @click="choose(b.id)">
                <UiBrandDot :name="b.name" :color="b.color" :size="40" />
                <span class="min-w-0 flex-1 truncate" :class="b.locked && 'text-muted'">{{ b.name }}</span>
                <span v-if="b.locked" class="chip shrink-0 bg-danger/12 py-0.5 text-xs text-danger"><Lock class="size-3" />{{ t('brands.locked') }}</span>
                <span class="grid size-6 place-items-center rounded-full" :class="scope === b.id ? 'bg-brand-500 text-white' : 'border-2 border-line'"><Check v-if="scope === b.id" class="size-3.5" /></span>
              </button>
              <p v-if="!active.length" class="px-3 py-2 text-sm text-muted">{{ t('brands.none') }}</p>
            </div>
            <div class="pb-safe border-t border-line px-3 pt-2">
              <NuxtLink data-sheet-item to="/app/brands" class="flex items-center justify-center gap-2 rounded-2xl px-3 py-3 font-semibold text-muted active:bg-surface-2" @click="close">
                <Settings2 class="size-4" />{{ t('brands.manage') }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
