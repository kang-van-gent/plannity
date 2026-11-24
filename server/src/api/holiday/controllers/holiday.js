'use strict';

const { ownerScopedController } = require('../../../utils/owner-scoped');

// Curated dates have no owner (shared, read-only). Users can add their own
// key dates; source/kind are set server-side.
function validate(next, existing, data) {
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(next.date ?? ''))) errors.date = 'invalid_date';
  const title = next.title || {};
  if (!String(title.th || title.en || '').trim()) errors.title = 'required';
  if (!existing) {
    data.kind = 'custom';
    data.source = 'user';
    data.verified = true;
    data.country = 'TH';
    data.year = Number(String(next.date).slice(0, 4));
  }
  return errors;
}

module.exports = ownerScopedController('api::holiday.holiday', { allowShared: true, validate });
