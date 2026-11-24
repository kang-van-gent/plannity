import type { Wallet } from '~/types'

export function useWallet() {
  const api = useApi()
  const wallet = useState<Wallet | null>('wallet', () => null)
  async function refresh() {
    try { wallet.value = await api.credits.balance() } catch { /* header badge is best-effort */ }
  }
  return { wallet, refresh }
}
