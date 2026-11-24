export function prefersReducedMotion(): boolean {
  return import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Page-curtain state: entrance animations wait until the curtain lifts. */
export function useCurtain() {
  return useState('curtain', () => ({ active: false, covering: false }))
}

export function useIdempotencyKey() {
  const key = ref(uid('idem'))
  return { key, renew: () => { key.value = uid('idem') } }
}
