import type { BrandRole } from '~/types'
import { roleCan, type Permission } from '~/utils/permissions'

/**
 * UX-only permission checks for the current user, from their role in each
 * brand (returned by the API on every brand). The backend enforces the same
 * rules — this only decides what to show or enable.
 */
export function usePerms() {
  const brands = useBrands()
  const roleOf = (brandId: string | null | undefined): BrandRole | null => brands.byId(brandId)?.myRole ?? null
  const can = (perm: Permission, brandId: string | null | undefined) => roleCan(roleOf(brandId), perm)
  /** Active brands where the user has `perm` (e.g. where they may create content). */
  const brandsWhere = (perm: Permission) => brands.active.value.filter((b) => roleCan(b.myRole, perm))
  const canAny = (perm: Permission) => brandsWhere(perm).length > 0
  return { roleOf, can, canAny, brandsWhere }
}
