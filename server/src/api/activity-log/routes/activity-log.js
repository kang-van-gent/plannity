'use strict';

// Read-only. There are deliberately no create/update/delete routes.
module.exports = {
  routes: [{ method: 'GET', path: '/brands/:brandId/activity', handler: 'activity-log.list' }],
};
