// BFF login: exchanges credentials for a Strapi JWT and stores it in an
// HttpOnly cookie. Rate limiting belongs in Strapi / the reverse proxy.
export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email?: string; password?: string }>(event)
  if (!email || !password) throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Email and password are required' } } })
  try {
    const res = await $fetch<{ jwt: string; refreshToken?: string; user: Record<string, unknown> }>(`${strapiBase(event)}/api/auth/local`, {
      method: 'POST',
      body: { identifier: email, password },
    })
    setJwtCookie(event, res.jwt, res.refreshToken)
    return { user: toAppUser(res.user), token: '1' }
  } catch (e) {
    rethrow(e)
  }
})
