import type { PaymentOrder } from '~/types'

/** What an order buys, in words: "Team · 1 month", "Renewal · Team + 2 brands", "20 AI credits". */
export function useOrderLabel() {
  const { t } = useLocale()
  return (o: PaymentOrder): string => {
    const plan = o.planKey ? t(`plan.names.${o.planKey}`) : ''
    if (o.kind === 'plan' && o.planKey) return t('plan.item.plan', { plan })
    if (o.kind === 'brand_addon') return t('plan.item.brand_addon', { n: o.quantity ?? 1 })
    if (o.kind === 'renewal') {
      const n = o.brandIds?.length ?? o.quantity ?? 0
      return t('plan.item.renewal', { what: [plan, n ? t('plan.noticeBrands', { n }) : ''].filter(Boolean).join(' + ') })
    }
    return t('plan.item.credits', { n: o.credits })
  }
}
