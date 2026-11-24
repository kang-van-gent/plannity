export default defineNuxtRouteMiddleware(() => {
  const { token } = useSessionToken()
  if (token.value) return navigateTo('/app')
})
