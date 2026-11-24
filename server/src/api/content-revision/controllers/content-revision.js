'use strict';

const { ownerScopedController } = require('../../../utils/owner-scoped');

// Every action is scoped to the signed-in user.
module.exports = ownerScopedController('api::content-revision.content-revision', { ownedRelations: { content: 'api::content.content' } });
