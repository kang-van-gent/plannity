// Starts social sign-in: /auth/connect/google?next=/app/calendar
// Remembers `next`, then hands the browser to Strapi, which redirects to the provider.
export default defineEventHandler((event) => {
  const provider = getRouterParam(event, 'provider')
  if (!isSocialProvider(provider)) throw createError({ statusCode: 404 })
  setCookie(event, OAUTH_NEXT_COOKIE, safeNext(getQuery(event).next), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600 })
  const config = useRuntimeConfig(event)
  const base = String(config.strapiPublicUrl || config.strapiUrl).replace(/\/$/, '')
  return sendRedirect(event, `${base}/api/connect/${provider}`, 302)
})
