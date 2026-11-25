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
    name: 'strapi::session',
    config: process.env.NODE_ENV === 'production' ? { sameSite: 'none', secure: true } : {},
  },
  'strapi::favicon',
  'strapi::public',
];
