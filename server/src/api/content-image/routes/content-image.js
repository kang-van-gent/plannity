'use strict';

// Post images (plannity-context-image-feature.md). Mutations need the
// content-edit permission of the content's brand; reads need content read.
module.exports = {
  routes: [
    { method: 'POST', path: '/contents/:id/images', handler: 'content-image.upload' },
    { method: 'PUT', path: '/contents/:id/images/order', handler: 'content-image.reorder' },
    { method: 'POST', path: '/contents/:id/images/:imageId/replace', handler: 'content-image.replace' },
    { method: 'DELETE', path: '/contents/:id/images/:imageId', handler: 'content-image.remove' },
    { method: 'GET', path: '/contents/:id/images/:imageId/download', handler: 'content-image.download' },
  ],
};
