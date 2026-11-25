'use strict';

const { brandScopedController, MEMBERSHIP } = require('../../../utils/brand-access');
const { diffBrand, classifyBrand } = require('../../../utils/activity');

// Brand = the Team Workspace boundary. Any signed-in user can create a brand
// and becomes its Owner; everything else follows their membership role.
module.exports = brandScopedController('api::brand.brand', {
  brandPath: '',
  perms: {
    read: 'brand.read',
    // Archiving/restoring is the owner-only "delete" (history is kept); other edits are settings.
    update: (data) => (data.archivedAt !== undefined ? 'brand.delete' : 'brand.update'),
    delete: 'brand.delete',
  },
  // Membership, invitations and seat limits change only through the team API / billing.
  protectedFields: ['memberships', 'invitations', 'maxSeats', 'contents'],
  audit: { entityType: 'brand', title: (b) => b.name, diff: (before, data) => diffBrand(before, data), classify: classifyBrand },
  async onCreate(brand, user) {
    const now = new Date().toISOString();
    await strapi.documents(MEMBERSHIP).create({
      data: { brand: brand.documentId, user: user.id, role: 'owner', status: 'active', joinedAt: now, memberKey: `${brand.documentId}:${user.id}` },
    });
  },
});
