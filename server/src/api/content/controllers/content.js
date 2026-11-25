'use strict';

const { brandScopedController } = require('../../../utils/brand-access');
const { CONTENT_FIELDS, diff, classifyContent } = require('../../../utils/activity');

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

// Access follows the member's role in the content's brand (Team Workspace).
module.exports = brandScopedController('api::content.content', {
  brandPath: 'brand',
  perms: { read: 'content.read', create: 'content.create', update: 'content.update', delete: 'content.delete' },
  // Images change only through /contents/:id/images (validation, ordering, file cleanup).
  protectedFields: ['images'],
  versioned: true,
  validate,
  audit: { entityType: 'content', title: (c) => c.title, diff: (before, data) => diff(before, data, CONTENT_FIELDS), classify: classifyContent },
});
