/**
 * Product feature flags. Locked features stay visible (with a lock and "Soon")
 * but can't be opened; the route middleware redirects direct visits.
 * Turn one on with NUXT_PUBLIC_FEATURE_AI_GENERATE=true / NUXT_PUBLIC_FEATURE_PROMOTE=true.
 */
export const FEATURE_ROUTES: { prefix: string; flag: 'aiGenerate' | 'promote' }[] = [
  { prefix: '/app/generate', flag: 'aiGenerate' },
  { prefix: '/app/jobs', flag: 'aiGenerate' },
  { prefix: '/app/promote', flag: 'promote' },
]

const truthy = (v: unknown) => v === true || v === 'true' || v === '1'

export function useFeatures() {
  const config = useRuntimeConfig()
  return {
    aiGenerate: truthy(config.public.featureAiGenerate),
    promote: truthy(config.public.featurePromote),
  }
}

/** True when `path` belongs to a feature that is switched off. */
export function isLockedPath(path: string, features = useFeatures()): boolean {
  return FEATURE_ROUTES.some((r) => path.startsWith(r.prefix) && !features[r.flag])
}
