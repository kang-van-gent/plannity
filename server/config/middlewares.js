module.exports = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  {
    // Sign in with Apple POSTs back from appleid.apple.com (form_post), a
    // cross-site request: the OAuth state cookie must be SameSite=None to
    // survive it. Browsers require Secure with None, so this applies over HTTPS
    // (production); local HTTP keeps the default.
    //
    // Social sign-in keeps the provider result in this session cookie, and the
    // app (plannity.space) has to forward it to finish the sign-in, so in
    // production it's set on the parent domain: SESSION_COOKIE_DOMAIN=plannity.space.
    name: 'strapi::session',
    config: {
      ...(process.env.NODE_ENV === 'production' ? { sameSite: 'none', secure: true } : {}),
      ...(process.env.SESSION_COOKIE_DOMAIN ? { domain: process.env.SESSION_COOKIE_DOMAIN } : {}),
    },
  },
  'strapi::favicon',
  'strapi::public',
];
