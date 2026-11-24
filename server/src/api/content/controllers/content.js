'use strict';

const { ownerScopedController } = require('../../../utils/owner-scoped');

// Status rules from plannity-spec §10. Publishing is always a user confirmation;
// nothing here posts to social networks.
// `next` = stored record merged with the incoming change; `data` = the payload that will be written.
function validate(next, _existing, data) {
  const errors = {};
  if (next.status === 'scheduled' && !next.scheduledDate) errors.scheduledDate = 'needs_date';
  if (next.postUrl && !/^https?:\/\//i.test(next.postUrl)) errors.postUrl = 'invalid_url';
  if (next.status === 'published' && !next.postedAt) data.postedAt = new Date().toISOString();
  if (next.status && next.status !== 'published' && next.postedAt) data.postedAt = null;
  return errors;
}

module.exports = ownerScopedController('api::content.content', {
  ownedRelations: { brand: 'api::brand.brand' },
  versioned: true,
  validate,
});
