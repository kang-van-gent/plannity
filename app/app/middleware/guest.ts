// Login / sign-up pages: send signed-in users to the app — but only if the
// session is really alive. A leftover "signed in" hint (expired session) is
// cleared by ensure(), and the visitor stays on the page they asked for.
export default defineNuxtRouteMiddleware(async () => {
  const { token } = useSessionToken()
  if (token.value && (await useSession().ensure())) return navigateTo('/app')
})
