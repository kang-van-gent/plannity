// Ends the Strapi session (revokes its refresh token) and clears the cookies.
export default defineEventHandler(async (event) => {
  const jwt = getCookie(event, JWT_COOKIE)
  if (jwt) {
    await $fetch(`${strapiBase(event)}/api/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${jwt}` }, body: {} }).catch(() => {})
  }
  clearSessionCookies(event)
  return { ok: true }
})
