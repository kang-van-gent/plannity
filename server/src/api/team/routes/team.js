'use strict';

// Team Workspace endpoints (brand-scoped membership + invitations).
// Order matters: /invitations/mine must come before /invitations/:token.
module.exports = {
  routes: [
    { method: 'GET', path: '/brands/:brandId/team', handler: 'team.get' },
    { method: 'POST', path: '/brands/:brandId/invitations', handler: 'team.invite' },
    { method: 'POST', path: '/brands/:brandId/invitations/:id/resend', handler: 'team.resend' },
    { method: 'DELETE', path: '/brands/:brandId/invitations/:id', handler: 'team.cancel' },
    { method: 'PATCH', path: '/brands/:brandId/members/:memberId', handler: 'team.updateRole' },
    { method: 'DELETE', path: '/brands/:brandId/members/:memberId', handler: 'team.removeMember' },
    { method: 'POST', path: '/brands/:brandId/leave', handler: 'team.leave' },
    { method: 'GET', path: '/invitations/mine', handler: 'team.mine' },
    { method: 'POST', path: '/invitations/mine/:id/accept', handler: 'team.acceptMine' },
    { method: 'POST', path: '/invitations/mine/:id/decline', handler: 'team.declineMine' },
    // Public: shows what an invitation link is for, before signing in. Reveals nothing without the token.
    { method: 'GET', path: '/invitations/:token', handler: 'team.preview', config: { auth: false } },
    { method: 'POST', path: '/invitations/:token/accept', handler: 'team.accept' },
    { method: 'POST', path: '/invitations/:token/decline', handler: 'team.decline' },
  ],
};
