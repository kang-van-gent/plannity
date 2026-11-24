export type ThemePref = 'light' | 'dark' | 'system'

export function useTheme() {
  const pref = useCookie<ThemePref>('plannity-theme', { default: () => 'system', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
  const isDark = useState<boolean>('theme-dark', () => pref.value === 'dark')

  function resolve(p: ThemePref): boolean {
    if (import.meta.server) return p === 'dark'
    return p === 'dark' || (p === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  }

  function apply() {
    if (import.meta.server) return
    const dark = resolve(pref.value)
    isDark.value = dark
    const el = document.documentElement
    el.classList.toggle('dark', dark)
    el.style.colorScheme = dark ? 'dark' : 'light'
  }

  /**
   * Switches theme with a circular reveal from the click position when the
   * View Transitions API exists; otherwise a short colour cross-fade.
   */
  function set(next: ThemePref, origin?: { x: number; y: number }) {
    if (import.meta.server) return
    const run = () => { pref.value = next; apply() }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (!doc.startViewTransition || reduce || resolve(next) === isDark.value) {
      document.documentElement.classList.add('theme-fade')
      run()
      setTimeout(() => document.documentElement.classList.remove('theme-fade'), 400)
      return
    }
    const x = origin?.x ?? window.innerWidth - 40
    const y = origin?.y ?? 40
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const vt = doc.startViewTransition(run)
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(.7,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
      )
    }).catch(() => {})
  }

  function toggle(origin?: { x: number; y: number }) {
    set(isDark.value ? 'light' : 'dark', origin)
  }

  return { pref, isDark, apply, set, toggle }
}
