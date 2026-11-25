// Strapi's "redirect URL" for social sign-in: /auth/callback/:provider?access_token=…
// Exchanges the provider result for a Strapi JWT server-to-server, stores it in
// the HttpOnly cookie and lands the user in the app. Failures go back to /login.
export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  if (!isSocialProvider(provider)) throw createError({ statusCode: 404 })
  const query = getQuery(event)
  const next = safeNext(getCookie(event, OAUTH_NEXT_COOKIE))
  deleteCookie(event, OAUTH_NEXT_COOKIE, { path: '/' })

  const fail = (reason: string) => sendRedirect(event, `/login?oauth=${reason}&provider=${provider}`, 302)
  if (query.error) return fail(query.error === 'access_denied' ? 'cancelled' : 'failed')
  if (!query.access_token && !query.id_token) return fail('failed')

  try {
    const qs = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => [k, String(x)] as [string, string])))
    const res = await $fetch<{ jwt: string }>(`${strapiBase(event)}/api/auth/${provider}/callback?${qs}`)
    setJwtCookie(event, res.jwt)
    setSessionHint(event)
    return sendRedirect(event, next, 302)
  } catch (e) {
    // e.g. an account with this email already exists with password sign-in.
    const msg = JSON.stringify((e as { data?: unknown }).data ?? '')
    return fail(/already taken|exists/i.test(msg) ? 'exists' : 'failed')
  }
})
