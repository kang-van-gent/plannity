'use strict';

const crypto = require('crypto');
const { ownerScopedController } = require('../../../utils/owner-scoped');

// Upstify inquiries (plannity-spec §13): consent is mandatory and recorded
// server-side; reference/status are never taken from the client.
function validate(next, existing, data) {
  if (existing) {
    // Users may not edit an inquiry after submission (status is managed in the admin).
    return { status: 'read_only' };
  }
  const errors = {};
  if (data.consent !== true) errors.consent = 'consent_required';
  if (!data.brief || String(data.brief).trim().length < 10) errors.brief = 'brief_short';
  if (data.budgetSatang !== undefined && (!Number.isInteger(Number(data.budgetSatang)) || Number(data.budgetSatang) < 0)) errors.budget = 'invalid_budget';
  delete data.consent;
  data.contactConsentAt = new Date().toISOString();
  data.status = 'submitted';
  data.reference = `UPS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  return errors;
}

module.exports = ownerScopedController('api::promotion-inquiry.promotion-inquiry', {
  ownedRelations: { brand: 'api::brand.brand', content: 'api::content.content' },
  validate,
});
