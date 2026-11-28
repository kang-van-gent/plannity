'use strict';

// Brand logo upload/removal (owners and admins; checked in the controller).
module.exports = {
  routes: [
    { method: 'POST', path: '/brands/:id/logo', handler: 'brand-logo.upload' },
    { method: 'DELETE', path: '/brands/:id/logo', handler: 'brand-logo.remove' },
  ],
};
