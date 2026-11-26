import type { Entitlements } from '~/types'

/**
 * The signed-in account's plan limits (GET /billing/me), cached for the
 * session. UX only — the server enforces every limit again.
 */
export function useEntitlements() {
  const api = useApi()
  const ent = useState<Entitlements | null>('entitlements', () => null)
  let inflight: Promise<Entitlements | null> | null = null

  function load(force = false): Promise<Entitlements | null> {
    if (ent.value && !force) return Promise.resolve(ent.value)
    inflight ??= api.billing.me().then((e) => { ent.value = e; return e }).catch(() => ent.value).finally(() => { inflight = null })
    return inflight
  }
  /** Free owned-brand slots: null = unlimited (Studio). */
  const brandSlotsLeft = computed(() => (!ent.value || ent.value.brandLimit === null ? null : Math.max(0, ent.value.brandLimit - ent.value.brandsOwned)))
  const canCreateBrand = computed(() => !ent.value || brandSlotsLeft.value === null || brandSlotsLeft.value > 0)
  return { ent, load, brandSlotsLeft, canCreateBrand }
}
