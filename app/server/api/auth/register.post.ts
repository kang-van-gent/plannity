export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; email?: string; password?: string; acceptTerms?: boolean }>(event)
  if (!body.acceptTerms) {
    throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Terms must be accepted', fieldErrors: { acceptTerms: 'must_accept' } } } })
  }
  try {
    const res = await $fetch<{ jwt?: string; refreshToken?: string; user: Record<string, unknown> }>(`${strapiBase(event)}/api/auth/local/register`, {
      method: 'POST',
      body: { username: body.email, email: body.email, password: body.password, name: body.name?.trim() || undefined },
    })
    // With email confirmation enabled Strapi returns no JWT until verified.
    if (res.jwt) setJwtCookie(event, res.jwt, res.refreshToken)
    return { user: toAppUser(res.user), token: res.jwt ? '1' : '' }
  } catch (e) {
    rethrow(e)
  }
})
