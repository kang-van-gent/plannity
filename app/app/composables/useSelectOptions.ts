import type { Brand, BrandRole } from '~/types'
import { CONTENT_STATUSES, FORMATS, OBJECTIVES, PLATFORMS } from '~/types'

/** Option lists for <UiSelect>, shared so every dropdown labels things the same way. */
export const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8', in_review: '#FFB23F', approved: '#3FB68B', scheduled: '#62C5F4', published: '#6C4CF5',
}

export function useSelectOptions() {
  const { t } = useLocale()
  const platforms = computed(() => PLATFORMS.map((p) => ({ value: p, label: PLATFORM_META[p].label, platform: p })))
  const objectives = computed(() => OBJECTIVES.map((o) => ({ value: o, label: t(`objectives.${o}`) })))
  const formats = computed(() => FORMATS.map((f) => ({ value: f, label: t(`formats.${f}`) })))
  const statuses = computed(() => CONTENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`), color: STATUS_COLORS[s] })))
  const brandList = (list: Brand[]) => list.map((b) => ({ value: b.id, label: b.name, color: b.color }))
  const roles = (list: BrandRole[]) => list.map((r) => ({ value: r, label: t(`roles.${r}`), hint: t(`roles.${r}Hint`) }))
  /** Prepends an "all" choice (empty value) for filters. */
  const withAll = <T extends string>(label: string, opts: { value: T; label: string }[]) => [{ value: '' as T | '', label }, ...opts]
  return { platforms, objectives, formats, statuses, brandList, roles, withAll }
}
