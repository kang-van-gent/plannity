'use strict';

const { brandScopedController } = require('../../../utils/brand-access');

// Read-only for members (revisions are written by the server on edit/regenerate).
module.exports = brandScopedController('api::content-revision.content-revision', {
  brandPath: 'content.brand',
  perms: { read: 'content.read', create: 'content.update', update: 'content.update', delete: 'content.delete' },
});
