'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/dashboard', handler: 'account.dashboard' },
    { method: 'POST', path: '/auth/verify', handler: 'account.verify' },
    { method: 'PUT', path: '/me', handler: 'account.updateMe' },
    // The 'account' API loads before 'content', so this wins over the core /contents/:id route.
    { method: 'GET', path: '/contents/export', handler: 'account.exportCsv' },
  ],
};
