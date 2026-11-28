// BFF password change (Settings → Password). Strapi checks the current password,
// stores the new one and — with refresh sessions — issues new tokens, which go
// into the HttpOnly cookies so this browser stays signed in.
const MESSAGES: Record<string, [string, string]> = {
  'The provided current password is invalid': ['currentPassword', 'wrong_password'],
  'Your new password must be different than your current password': ['password', 'same_password'],
}

export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-requested-with') !== 'plannity') {
    throw createError({ statusCode: 403, data: { error: { code: 'FORBIDDEN', message: 'CSRF check failed' } } })
  }
  const { currentPassword, password } = await readBody<{ currentPassword?: string; password?: string }>(event)
  if (!currentPassword || !password) throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Both passwords are required', fieldErrors: { ...(currentPassword ? {} : { currentPassword: 'required' }), ...(password ? {} : { password: 'required' }) } } } })
  if (password.length < 8) throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: 'Password too short', fieldErrors: { password: 'password_short' } } } })
  const jwt = await accessToken(event)
  if (!jwt) throw createError({ statusCode: 401, data: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } } })
  try {
    const res = await $fetch<{ jwt?: string; refreshToken?: string }>(`${strapiBase(event)}/api/auth/change-password`, {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
      body: { currentPassword, password, passwordConfirmation: password },
    })
    if (res.jwt) setJwtCookie(event, res.jwt, res.refreshToken)
    return { ok: true }
  } catch (e) {
    const err = e as { status?: number; statusCode?: number; data?: { error?: { message?: string } } }
    const known = MESSAGES[err.data?.error?.message ?? '']
    if (known) throw createError({ statusCode: 400, data: { error: { code: 'INVALID_INPUT', message: err.data!.error!.message, fieldErrors: { [known[0]]: known[1] } } } })
    rethrow(e)
  }
})
