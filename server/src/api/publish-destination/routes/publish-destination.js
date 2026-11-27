'use strict';

// Multi-platform content. No core routes: destinations are only read and
// written through these, with brand-role checks in the controller.
module.exports = {
  routes: [
    { method: 'GET', path: '/contents/:id/destinations', handler: 'publish-destination.list' },
    { method: 'PATCH', path: '/contents/:id/destinations', handler: 'publish-destination.replace' },
    { method: 'POST', path: '/destinations/:id/mark-published', handler: 'publish-destination.markPublished' },
  ],
};
