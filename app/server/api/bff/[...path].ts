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

  let body: string | Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const ct = getHeader(event, 'content-type') ?? ''
    if (ct.startsWith('multipart/form-data')) {
      // Post image uploads: pass the multipart body through untouched (boundary included).
      body = (await readRawBody(event, false)) ?? undefined
      headers['content-type'] = ct
    } else {
      body = (await readRawBody(event)) ?? undefined
      if (body) headers['content-type'] = 'application/json'
    }
  }
  // Image downloads are binary; everything else is JSON (CSV export is text).
  const binary = /^contents\/[^/]+\/images\/[^/]+\/download$/.test(path)

  const search = getRequestURL(event).search
  try {
    const res = await $fetch.raw<unknown>(`${strapiBase(event)}/api/${path}${search}`, {
      method: method as 'GET',
      headers,
      body,
      ignoreResponseError: true,
      responseType: binary ? 'arrayBuffer' : path.startsWith('contents/export') ? 'text' : 'json',
    })
    setResponseStatus(event, res.status)
    for (const h of ['content-type', 'content-disposition', 'cache-control']) {
      const v = res.headers.get(h)
      if (v) setHeader(event, h, v)
    }
    return binary && res._data instanceof ArrayBuffer ? new Uint8Array(res._data) : res._data
  } catch {
    throw createError({ statusCode: 503, data: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'API is unavailable' } } })
  }
})
