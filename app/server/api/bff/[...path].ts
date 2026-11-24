// Backend-for-frontend proxy: browser → Nuxt (cookie session) → Strapi (Bearer JWT).
// Only used when NUXT_PUBLIC_DATA_SOURCE=strapi.
export default defineEventHandler(async (event): Promise<unknown> => {
  const path = getRouterParam(event, 'path') ?? ''
  const method = event.method
  if (!/^[\w\-/.]+$/.test(path) || path.includes('..')) throw createError({ statusCode: 400, statusMessage: 'Bad path' })

  // CSRF: cookie-authenticated mutations must carry the custom header (cannot be set cross-site without CORS).
  if (method !== 'GET' && getHeader(event, 'x-requested-with') !== 'plannity') {
    throw createError({ statusCode: 403, data: { error: { code: 'FORBIDDEN', message: 'CSRF check failed' } } })
  }

  const headers: Record<string, string> = { accept: 'application/json' }
  const jwt = getCookie(event, JWT_COOKIE)
  if (jwt) headers.authorization = `Bearer ${jwt}`
  const idem = getHeader(event, 'idempotency-key')
  if (idem) headers['idempotency-key'] = idem

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = (await readRawBody(event)) ?? undefined
    if (body) headers['content-type'] = 'application/json'
  }

  const search = getRequestURL(event).search
  try {
    const res = await $fetch.raw<unknown>(`${strapiBase(event)}/api/${path}${search}`, {
      method: method as 'GET',
      headers,
      body,
      ignoreResponseError: true,
      responseType: path.startsWith('contents/export') ? 'text' : 'json',
    })
    setResponseStatus(event, res.status)
    const ct = res.headers.get('content-type')
    if (ct) setHeader(event, 'content-type', ct)
    return res._data
  } catch {
    throw createError({ statusCode: 503, data: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'API is unavailable' } } })
  }
})
