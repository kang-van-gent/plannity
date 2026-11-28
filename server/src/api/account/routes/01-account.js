'use strict';

module.exports = {
  routes: [
    { method: 'GET', path: '/dashboard', handler: 'account.dashboard' },
    { method: 'POST', path: '/auth/verify', handler: 'account.verify' },
    { method: 'GET', path: '/me', handler: 'account.me' },
    { method: 'PUT', path: '/me', handler: 'account.updateMe' },
    { method: 'POST', path: '/me/avatar', handler: 'account.avatarUpload' },
    { method: 'PUT', path: '/me/avatar', handler: 'account.avatarSet' },
    // The 'account' API loads before 'content', so this wins over the core /contents/:id route.
    { method: 'GET', path: '/contents/export', handler: 'account.exportCsv' },
  ],
};
