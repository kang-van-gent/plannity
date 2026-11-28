// BFF password reset: the link from the "reset password" email lands on
// /reset-password?code=…; the new password goes to Strapi here, and the person
// is signed in with the JWT it returns (stored in the HttpOnly cookie).
export default defineEventHandler(async (event) => {
  const { code, password } = await readBody<{ code?: string; password?: string }>(event)
  if (!code || !password) throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Code and password are required' } } })
  try {
    const res = await $fetch<{ jwt: string; refreshToken?: string; user: Record<string, unknown> }>(`${strapiBase(event)}/api/auth/reset-password`, {
      method: 'POST',
      body: { code, password, passwordConfirmation: password },
    })
    setJwtCookie(event, res.jwt, res.refreshToken)
    return { user: toAppUser(res.user), token: '1' }
  } catch (e) {
    rethrow(e)
  }
})
