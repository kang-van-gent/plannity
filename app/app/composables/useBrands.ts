import type { Brand } from '~/types'

let inflight: Promise<void> | null = null

/** Brand list + the brand switcher scope shared by dashboard/library/calendar (spec §8). */
export function useBrands() {
  const api = useApi()
  const brands = useState<Brand[]>('brands', () => [])
  const loaded = useState<boolean>('brands-loaded', () => false)
  const scopeCookie = useCookie<string>('plannity-brand', { default: () => 'all', sameSite: 'lax' })
  const scope = useState<string>('brand-scope', () => scopeCookie.value || 'all')

  const active = computed(() => brands.value.filter((b) => !b.archivedAt))
  const currentBrandId = computed(() => (scope.value === 'all' ? null : scope.value))
  const currentBrand = computed(() => brands.value.find((b) => b.id === scope.value) ?? null)

  function setScope(id: string) {
    scope.value = id
    scopeCookie.value = id
  }

  async function load(force = false) {
    if (loaded.value && !force) return
    inflight ??= api.brands.list({ includeArchived: true }).then((list) => {
      brands.value = list
      loaded.value = true
      if (scope.value !== 'all' && !active.value.some((b) => b.id === scope.value)) setScope('all')
    }).finally(() => { inflight = null })
    return inflight
  }

  const byId = (id: string | null | undefined) => brands.value.find((b) => b.id === id)

  return { brands, active, loaded, scope, currentBrandId, currentBrand, setScope, load, byId }
}
