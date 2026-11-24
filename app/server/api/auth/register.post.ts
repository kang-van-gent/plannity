export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; email?: string; password?: string; acceptTerms?: boolean }>(event)
  if (!body.acceptTerms) {
    throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Terms must be accepted', fieldErrors: { acceptTerms: 'must_accept' } } } })
  }
  try {
    const res = await $fetch<{ jwt?: string; user: Record<string, unknown> }>(`${strapiBase(event)}/api/auth/local/register`, {
      method: 'POST',
      body: { username: body.email, email: body.email, password: body.password },
    })
    // With email confirmation enabled Strapi returns no JWT until verified.
    if (res.jwt) setJwtCookie(event, res.jwt)
    return { user: { ...toAppUser(res.user), name: body.name ?? '' }, token: res.jwt ? '1' : '' }
  } catch (e) {
    rethrow(e)
  }
})
