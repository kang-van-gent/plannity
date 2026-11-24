// Route guard for /app/**. This is a UX convenience only — ownership is
// enforced by the backend on every resource (spec §4).
export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSession()
  if (!(await session.ensure())) {
    return navigateTo({ path: '/login', query: { next: to.fullPath } })
  }
})
