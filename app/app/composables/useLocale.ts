import th from '~/locales/th'
import en from '~/locales/en'

export type Locale = 'th' | 'en'
const messages: Record<Locale, unknown> = { th, en }

function lookup(tree: unknown, key: string): unknown {
  let node = tree
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) node = (node as Record<string, unknown>)[part]
    else return undefined
  }
  return node
}

/**
 * Lightweight i18n (TH default, EN). Thai is the source of truth; missing
 * English keys fall back to Thai, then to the key itself.
 */
export function useLocale() {
  const cookie = useCookie<Locale>('plannity-locale', { default: () => 'th', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const locale = useState<Locale>('locale', () => (cookie.value === 'en' ? 'en' : 'th'))

  function t(key: string, params?: Record<string, string | number>): string {
    const raw = lookup(messages[locale.value], key) ?? lookup(messages.th, key)
    if (typeof raw !== 'string') return key
    return params ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : raw
  }

  /** Returns structured messages (arrays/objects), e.g. FAQ lists. */
  function tm<T = unknown>(key: string): T {
    return (lookup(messages[locale.value], key) ?? lookup(messages.th, key)) as T
  }

  function setLocale(next: Locale) {
    locale.value = next
    cookie.value = next
  }

  return { locale, t, tm, setLocale }
}
