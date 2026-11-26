import type { DataSource } from '~/services/api/contract'

/**
 * Provides `$api`, the only data access point for pages.
 * NUXT_PUBLIC_DATA_SOURCE=mock   → in-browser demo backend (default)
 * NUXT_PUBLIC_DATA_SOURCE=strapi → Strapi via the Nuxt BFF in server/api
 *
 * The implementation is loaded on first use, so the mock backend and its seed
 * data never ship with public pages that don't call the API.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const { token } = useSessionToken()
  const kind = config.public.dataSource === 'strapi' ? 'strapi' : 'mock'
  let loading: Promise<DataSource> | null = null
  const load = () => (loading ??= kind === 'strapi'
    ? import('~/services/api/strapi').then((m) => m.createStrapiSource({ mediaBaseUrl: String(config.public.mediaBaseUrl || '') }))
    : import('~/services/api/mock').then((m) => m.createMockSource(() => token.value, {
      maxBytes: Number(config.public.imageMaxMb) * 1024 * 1024, maxCount: Number(config.public.imageMaxCount),
    }, {
      promptpayId: String(config.public.promptpayId), name: String(config.public.promptpayName), ttlHours: 24, slipMaxBytes: 5 * 1024 * 1024,
    })))

  type Fn = (...args: unknown[]) => Promise<unknown>
  const call = (path: string[], args: unknown[]) => load().then((src) => {
    let target: unknown = src
    for (const key of path.slice(0, -1)) target = (target as Record<string, unknown>)[key]
    const fn = (target as Record<string, Fn>)[path[path.length - 1]!]
    if (typeof fn !== 'function') throw new Error(`Data source "${kind}" does not implement ${path.join('.')}`)
    return fn.apply(target, args)
  })

  // `api.dashboard(...)` and `api.brands.list(...)` both resolve through the same lazy call.
  const node = (path: string[]): unknown => new Proxy(function () {}, {
    apply: (_t, _this, args: unknown[]) => call(path, args),
    get: (_t, key) => (typeof key === 'string' ? node([...path, key]) : undefined),
  })
  const api = new Proxy({} as DataSource, {
    get: (_t, key) => (key === 'kind' ? kind : typeof key === 'string' ? node([key]) : undefined),
  })

  return { provide: { api } }
})
