'use strict';

const { ownerScopedController } = require('../../../utils/owner-scoped');

// Every action is scoped to the signed-in user.
module.exports = ownerScopedController('api::brand.brand');
