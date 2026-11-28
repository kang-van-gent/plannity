'use strict';

// Brand social connections. No core routes: everything goes through these,
// with brand-role and plan checks in the controller.
module.exports = {
  routes: [
    { method: 'GET', path: '/brands/:id/social-connections', handler: 'social-connection.list' },
    { method: 'POST', path: '/brands/:id/social-connections/connect', handler: 'social-connection.connect' },
    { method: 'GET', path: '/brands/:id/social-connections/requests/:requestId', handler: 'social-connection.request' },
    { method: 'POST', path: '/brands/:id/social-connections/requests/:requestId/choose', handler: 'social-connection.choose' },
    { method: 'POST', path: '/social-connections/:id/test', handler: 'social-connection.test' },
    { method: 'DELETE', path: '/social-connections/:id', handler: 'social-connection.disconnect' },
    // The browser returns here from Meta/TikTok: no Plannity session, the single-use OAuth state identifies the attempt.
    { method: 'GET', path: '/social/callback/:provider', handler: 'social-connection.callback', config: { auth: false } },
    // Local testing only (SOCIAL_FAKE=true): a stand-in for the Meta/TikTok consent screen.
    { method: 'GET', path: '/social/fake/authorize', handler: 'social-connection.fakeAuthorize', config: { auth: false } },
  ],
};
