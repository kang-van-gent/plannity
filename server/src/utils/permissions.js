'use strict';

/**
 * Brand-scoped role → permission map (Team Workspace spec). Authoritative copy;
 * app/app/utils/permissions.ts mirrors it for UX only. Keep the two in sync.
 */

const BRAND_ROLES = ['owner', 'admin', 'editor', 'viewer'];
/** Roles that can be given through an invitation (ownership is never invited). */
const INVITABLE_ROLES = ['admin', 'editor', 'viewer'];

const READ = ['brand.read', 'member.read', 'content.read', 'contentImage.read', 'calendar.read'];
const EDIT = ['content.create', 'content.update', 'content.delete', 'contentImage.upload', 'contentImage.replace', 'contentImage.delete'];
const MANAGE = ['brand.update', 'member.invite', 'member.updateRole', 'member.remove'];

const MATRIX = {
  owner: new Set([...READ, ...EDIT, ...MANAGE, 'brand.delete']),
  admin: new Set([...READ, ...EDIT, ...MANAGE]),
  editor: new Set([...READ, ...EDIT]),
  viewer: new Set(READ),
};

function roleCan(role, perm) {
  return Boolean(role && MATRIX[role] && MATRIX[role].has(perm));
}

/** Why `actor` may not set `target`'s role to `next` (null = allowed). */
function roleChangeError(actor, target, next, ownerCount) {
  if (!BRAND_ROLES.includes(next)) return 'invalid_role';
  if (!roleCan(actor, 'member.updateRole')) return 'forbidden';
  if (actor !== 'owner' && (target === 'owner' || next === 'owner')) return 'owner_only';
  if (target === 'owner' && next !== 'owner' && ownerCount <= 1) return 'last_owner';
  return null;
}

/** Why `actor` may not remove a member with role `target` (null = allowed). */
function removeError(actor, target, ownerCount) {
  if (!roleCan(actor, 'member.remove')) return 'forbidden';
  if (target === 'owner' && actor !== 'owner') return 'owner_only';
  if (target === 'owner' && ownerCount <= 1) return 'last_owner';
  return null;
}

/** Why a member with `role` may not leave (null = allowed). */
function leaveError(role, ownerCount) {
  return role === 'owner' && ownerCount <= 1 ? 'last_owner' : null;
}

/** Why `actor` may not invite someone as `role` (null = allowed). */
function inviteError(actor, role) {
  if (!roleCan(actor, 'member.invite')) return 'forbidden';
  if (!INVITABLE_ROLES.includes(role)) return 'invalid_role';
  return null;
}

/** Seats in use = active members + pending (unexpired) invitations. */
function seatsUsed(activeMembers, pendingInvitations) {
  return activeMembers + pendingInvitations;
}

module.exports = { BRAND_ROLES, INVITABLE_ROLES, roleCan, roleChangeError, removeError, leaveError, inviteError, seatsUsed };
