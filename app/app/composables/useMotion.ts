import type { Ref } from 'vue'

export function prefersReducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Page-curtain state: entrance animations wait until the curtain lifts. */
export function useCurtain() {
  return useState('curtain', () => ({ active: false, covering: false }))
}

/** Run now, or as soon as the page curtain starts lifting. */
export function afterCurtain(curtain: Ref<{ covering: boolean }>, run: () => void) {
  if (!curtain.value.covering) return run()
  const stop = watch(() => curtain.value.covering, (v) => {
    if (!v) { stop(); run() }
  })
}

/** Small-screen check (Tailwind `sm` breakpoint) for choosing lighter motion. */
export function isCompactViewport(): boolean {
  return import.meta.client && window.matchMedia('(max-width: 639px)').matches
}

export function useIdempotencyKey() {
  const key = ref(uid('idem'))
  return { key, renew: () => { key.value = uid('idem') } }
}
