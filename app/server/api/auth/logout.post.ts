export default defineEventHandler((event) => {
  deleteCookie(event, JWT_COOKIE, { path: '/' })
  return { ok: true }
})
