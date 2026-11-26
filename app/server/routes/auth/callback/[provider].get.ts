// Strapi's "redirect URL" for social sign-in: /auth/callback/:provider
// Strapi (5.6x+) no longer puts the provider tokens in this URL: it keeps them in
// its own signed session cookie (plannity.sess + .sig, see server/config/middlewares.js) and only accepts
// /api/auth/:provider/callback from a request carrying that cookie. We forward
// it server-to-server, store the Strapi JWT in our HttpOnly cookie and land the
// user in the app. Failures go back to /login.
//
// The cookie reaches this host because Strapi sets it on the parent domain in
// production (SESSION_COOKIE_DOMAIN=plannity.space); on localhost cookies are
// shared across ports already.
const STRAPI_SESSION_COOKIES = ['plannity.sess', 'plannity.sess.sig']

export default defineEventHandler(async (event) => {
  const provider = getRouterParam(event, 'provider')
  if (!isSocialProvider(provider)) throw createError({ statusCode: 404 })
  const query = getQuery(event)
  const next = safeNext(getCookie(event, OAUTH_NEXT_COOKIE))
  deleteCookie(event, OAUTH_NEXT_COOKIE, { path: '/' })

  const fail = (reason: string) => sendRedirect(event, `/login?oauth=${reason}&provider=${provider}`, 302)
  if (query.error) {
    if (query.error !== 'access_denied') console.error(`[oauth] ${provider} sign-in failed at Strapi: ${query.error} ${query.error_description ?? ''}`)
    return fail(query.error === 'access_denied' ? 'cancelled' : 'failed')
  }

  const cookie = STRAPI_SESSION_COOKIES.map((name) => [name, getCookie(event, name)] as const)
    .filter(([, v]) => v)
    .map(([name, v]) => `${name}=${v}`)
    .join('; ')
  if (!cookie) {
    console.error('[oauth] Strapi session cookie missing on the callback — set SESSION_COOKIE_DOMAIN on Strapi so the app domain receives it')
    return fail('failed')
  }

  try {
    const res = await $fetch<{ jwt: string; refreshToken?: string }>(`${strapiBase(event)}/api/auth/${provider}/callback`, { headers: { cookie } })
    setJwtCookie(event, res.jwt, res.refreshToken)
    setSessionHint(event)
    return sendRedirect(event, next, 302)
  } catch (e) {
    console.error(`[oauth] ${provider} callback rejected by Strapi:`, JSON.stringify((e as { data?: unknown }).data ?? (e as Error).message))
    // e.g. an account with this email already exists with password sign-in.
    const msg = JSON.stringify((e as { data?: unknown }).data ?? '')
    return fail(/already taken|exists/i.test(msg) ? 'exists' : 'failed')
  }
})
