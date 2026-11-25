import type { Ref, WatchSource } from 'vue'
import { ApiError, isApiError } from '~/services/api/contract'

export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e
  return new ApiError(0, 'UNKNOWN', e instanceof Error ? e.message : String(e))
}

/**
 * Tiny async-state helper giving every screen loading / empty / error /
 * retry states (spec §6). Stale responses are ignored.
 */
export function useQuery<T>(fn: () => Promise<T>, opts: { watch?: WatchSource[]; immediate?: boolean; initial?: T } = {}) {
  const data = ref(opts.initial) as Ref<T | undefined>
  const error = ref<ApiError | null>(null)
  const pending = ref(false)
  const loaded = ref(false)
  let seq = 0

  async function refresh(opts2: { silent?: boolean } = {}) {
    const id = ++seq
    if (!opts2.silent) pending.value = true
    error.value = null
    try {
      const r = await fn()
      if (id === seq) {
        data.value = r
        loaded.value = true
      }
    } catch (e) {
      if (id === seq) error.value = toApiError(e)
    } finally {
      if (id === seq) pending.value = false
    }
  }

  if (opts.watch?.length) watch(opts.watch, () => refresh())
  if (opts.immediate !== false && import.meta.client) refresh()

  /**
   * True only when the data on screen is the latest completed response. Screens
   * whose query depends on inputs (filters, range, brand) render a skeleton
   * while !ready instead of the stale data, so the real content mounts once,
   * with fresh data, and plays its entrance animation once. Silent refreshes
   * keep it true, so the content stays put.
   */
  const ready = computed(() => loaded.value && !pending.value)

  return { data, error, pending, loaded, ready, refresh }
}
