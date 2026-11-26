/**
 * "Back" that follows real navigation history (like the browser button).
 * Only when there's nothing to go back to — a link opened directly or in a new
 * tab — does it fall back to the page's parent.
 */
export function useGoBack() {
  const router = useRouter()
  const route = useRoute()

  /** Parent of the current path: /app/content/c_8 → /app/content, /blog/x → /blog. */
  function parentPath(path = route.path): string {
    const parts = path.replace(/\/+$/, '').split('/').filter(Boolean)
    if (parts.length <= 1) return '/'
    const up = `/${parts.slice(0, -1).join('/')}`
    return up
  }

  function canGoBack(): boolean {
    if (typeof window === 'undefined') return false
    // vue-router records the previous in-app location in history.state.back.
    return !!(window.history.state as { back?: string | null } | null)?.back
  }

  function back(fallback?: string) {
    if (canGoBack()) router.back()
    else navigateTo(fallback ?? parentPath(), { replace: true })
  }

  return { back, canGoBack, parentPath }
}
