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
  // Display name and UI language for the app (users-permissions has neither).
  const attrs = plugin.contentTypes.user.schema.attributes;
  attrs.name = { type: 'string', maxLength: 80 };
  attrs.locale = { type: 'enumeration', enum: ['th', 'en'], default: 'th' };

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
