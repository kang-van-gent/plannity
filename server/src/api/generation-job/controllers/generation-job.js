'use strict';

const { ownerScopedController } = require('../../../utils/owner-scoped');

// Every action is scoped to the signed-in user.
module.exports = ownerScopedController('api::generation-job.generation-job', { ownedRelations: { brand: 'api::brand.brand' } });
