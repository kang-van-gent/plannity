'use strict';

// Multi-platform content. No core routes: destinations are only read and
// written through these, with brand-role checks in the controller.
module.exports = {
  routes: [
    { method: 'GET', path: '/contents/:id/destinations', handler: 'publish-destination.list' },
    { method: 'PATCH', path: '/contents/:id/destinations', handler: 'publish-destination.replace' },
    { method: 'POST', path: '/destinations/:id/mark-published', handler: 'publish-destination.markPublished' },
    // Automatic posting to connected accounts (services/publisher.js).
    { method: 'GET', path: '/contents/:id/autopost', handler: 'publish-destination.autopost' },
    { method: 'GET', path: '/contents/:id/tiktok-creator', handler: 'publish-destination.tiktokCreator' },
    { method: 'POST', path: '/destinations/:id/publish', handler: 'publish-destination.publish' },
    { method: 'POST', path: '/destinations/:id/schedule', handler: 'publish-destination.schedule' },
    { method: 'POST', path: '/destinations/:id/unschedule', handler: 'publish-destination.unschedule' },
  ],
};
