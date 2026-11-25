'use strict';

/**
 * Apple returns the user's email/name only with response_mode=form_post, which
 * means Apple POSTs to /api/connect/apple/callback. users-permissions only
 * registers that route for GET, so add the POST variant (same handler; grant
 * reads the form body).
 */
const APPLE_FORM_POST = {
  method: 'POST',
  path: '/connect/apple/callback',
  handler: 'auth.connect',
  config: { middlewares: ['plugin::users-permissions.rateLimit'], prefix: '' },
};

module.exports = (plugin) => {
  const api = plugin.routes['content-api'];
  if (typeof api === 'function') {
    plugin.routes['content-api'] = (...args) => {
      const r = api(...args);
      r.routes.push(APPLE_FORM_POST);
      return r;
    };
  } else if (api && Array.isArray(api.routes)) {
    api.routes.push(APPLE_FORM_POST);
  }
  return plugin;
};
