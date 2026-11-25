// Brand-scoped role → permission map (Team Workspace spec). Mirrors
// server/src/utils/permissions.js — the backend copy is authoritative; this one
// only drives UX (what to show/enable). Keep the two in sync.
import type { BrandRole } from '~/types'

export const BRAND_ROLES: BrandRole[] = ['owner', 'admin', 'editor', 'viewer']
/** Roles that can be given through an invitation (ownership is never invited). */
export const INVITABLE_ROLES: BrandRole[] = ['admin', 'editor', 'viewer']

export type Permission =
  | 'brand.read' | 'brand.update' | 'brand.delete'
  | 'member.read' | 'member.invite' | 'member.updateRole' | 'member.remove'
  | 'content.read' | 'content.create' | 'content.update' | 'content.delete'
  | 'contentImage.read' | 'contentImage.upload' | 'contentImage.replace' | 'contentImage.delete'
  | 'calendar.read'

const READ: Permission[] = ['brand.read', 'member.read', 'content.read', 'contentImage.read', 'calendar.read']
const EDIT: Permission[] = ['content.create', 'content.update', 'content.delete', 'contentImage.upload', 'contentImage.replace', 'contentImage.delete']
const MANAGE: Permission[] = ['brand.update', 'member.invite', 'member.updateRole', 'member.remove']

const MATRIX: Record<BrandRole, ReadonlySet<Permission>> = {
  owner: new Set([...READ, ...EDIT, ...MANAGE, 'brand.delete']),
  admin: new Set([...READ, ...EDIT, ...MANAGE]),
  editor: new Set([...READ, ...EDIT]),
  viewer: new Set(READ),
}

export function roleCan(role: BrandRole | null | undefined, perm: Permission): boolean {
  return !!role && MATRIX[role].has(perm)
}

/**
 * Why `actor` may not set `target`'s role to `next` (null = allowed).
 * Owners can assign any role; Admins only manage non-owners and never grant
 * ownership; the final Owner can never be demoted.
 */
export function roleChangeError(actor: BrandRole, target: BrandRole, next: BrandRole, ownerCount: number): string | null {
  if (!roleCan(actor, 'member.updateRole')) return 'forbidden'
  if (actor !== 'owner' && (target === 'owner' || next === 'owner')) return 'owner_only'
  if (target === 'owner' && next !== 'owner' && ownerCount <= 1) return 'last_owner'
  return null
}

/** Why `actor` may not remove a member with role `target` (null = allowed). */
export function removeError(actor: BrandRole, target: BrandRole, ownerCount: number): string | null {
  if (!roleCan(actor, 'member.remove')) return 'forbidden'
  if (target === 'owner' && actor !== 'owner') return 'owner_only'
  if (target === 'owner' && ownerCount <= 1) return 'last_owner'
  return null
}

/** Why a member with `role` may not leave (null = allowed). */
export function leaveError(role: BrandRole, ownerCount: number): string | null {
  return role === 'owner' && ownerCount <= 1 ? 'last_owner' : null
}

/** Why `actor` may not invite someone as `role` (null = allowed). */
export function inviteError(actor: BrandRole, role: BrandRole): string | null {
  if (!roleCan(actor, 'member.invite')) return 'forbidden'
  if (!INVITABLE_ROLES.includes(role)) return 'invalid_role'
  return null
}

/** Seats in use = active members + pending (unexpired) invitations. */
export function seatsUsed(activeMembers: number, pendingInvitations: number): number {
  return activeMembers + pendingInvitations
}
