/**
 * Click handler for `/#section` links. The router alone does nothing when the
 * URL already has that hash (clicking "How it works" again after scrolling
 * away), so on the same page we scroll ourselves. Use with `@click.capture` so
 * it runs before NuxtLink's own navigation.
 *
 * `delay` waits for something to finish first (e.g. a menu panel that locks
 * page scroll while it closes).
 */
export function useSmoothHash() {
  const route = useRoute()
  const router = useRouter()

  return function onHashClick(e: MouseEvent, to: string, opts: { delay?: number } = {}) {
    const i = to.indexOf('#')
    if (i < 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    const path = to.slice(0, i) || '/'
    const hash = to.slice(i)
    if (route.path !== path) return // different page: NuxtLink navigates, router.options scrolls smoothly on arrival
    e.preventDefault()
    const run = () => {
      if (route.hash !== hash) return void router.replace({ hash }) // router.options does the smooth scroll
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }
    if (opts.delay) setTimeout(run, opts.delay)
    else run()
  }
}
