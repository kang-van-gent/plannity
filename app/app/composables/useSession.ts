import type { RegisterInput, User } from '~/types'

/** Readable routing hint cookie. In mock mode it carries the demo user id; with
 *  Strapi it is just a flag — the real JWT lives in an HttpOnly cookie. */
export function useSessionToken() {
  const cookie = useCookie<string | null>('plannity-session', { sameSite: 'lax', maxAge: 60 * 60 * 24 * 14, default: () => null })
  const token = useState<string | null>('session-token', () => cookie.value ?? null)
  function set(value: string | null) {
    token.value = value
    cookie.value = value
  }
  return { token, set }
}

export function useSession() {
  const user = useState<User | null>('session-user', () => null)
  const { token, set } = useSessionToken()
  const api = useApi()

  async function ensure(): Promise<boolean> {
    if (user.value) return true
    if (!token.value) return false
    try {
      user.value = await api.auth.me()
      return true
    } catch {
      set(null)
      return false
    }
  }

  async function login(email: string, password: string) {
    const s = await api.auth.login(email, password)
    set(s.token || '1')
    user.value = s.user
    return s.user
  }

  async function register(input: RegisterInput) {
    const s = await api.auth.register(input)
    if (s.token) set(s.token)
    user.value = s.user
    return s.user
  }

  async function verifyEmail(): Promise<number> {
    const r = await api.auth.verifyEmail()
    user.value = r.user
    return r.granted
  }

  async function logout() {
    try { await api.auth.logout() } catch { /* session is cleared locally regardless */ }
    set(null)
    user.value = null
    useState('brands-loaded').value = false
    useState('wallet').value = null
  }

  return { user, token, isLoggedIn: computed(() => !!token.value), ensure, login, register, verifyEmail, logout }
}
