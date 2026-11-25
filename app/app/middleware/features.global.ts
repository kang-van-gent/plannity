// Locked features (see useFeatures): direct visits land on the dashboard with a notice.
export default defineNuxtRouteMiddleware((to) => {
  if (!isLockedPath(to.path)) return
  if (import.meta.client) {
    const { t } = useLocale()
    useNotify().info(t('nav.lockedTitle'), t('nav.lockedBody'))
  }
  return navigateTo('/app', { replace: true })
})
