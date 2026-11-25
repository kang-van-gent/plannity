'use strict';

/**
 * Team Workspace rules (plannity-context-team-feature.md). Every mutation runs
 * in a transaction holding a per-brand advisory lock (PostgreSQL), so two
 * admins inviting at once, or an invite racing an acceptance, can't overshoot
 * the seat limit. Unique keys on memberships/invitations back this up at the
 * database level.
 */
const crypto = require('node:crypto');
const { roleChangeError, removeError, leaveError, inviteError, seatsUsed } = require('../../../utils/permissions');
const { sendInvitation } = require('../../../services/notifier');
const { record } = require('../../../services/activity');

const MEMBERSHIP = 'api::brand-membership.brand-membership';
const INVITATION = 'api::brand-invitation.brand-invitation';
const BRAND = 'api::brand.brand';
const ROLE_ORDER = { owner: 0, admin: 1, editor: 2, viewer: 3 };

class TeamError extends Error {
  constructor(status, code, message, fieldErrors = {}) {
    super(message);
    Object.assign(this, { status, code, fieldErrors });
  }
}

const ttlDays = () => Number(process.env.INVITE_TTL_DAYS || 7);
const defaultSeats = () => Number(process.env.TEAM_DEFAULT_SEATS || 5);
const frontendUrl = () => String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const normEmail = (e) => String(e || '').trim().toLowerCase();

/** Stable 32-bit key for pg_advisory_xact_lock. */
function lockKey(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h | 0;
}

module.exports = ({ strapi }) => {
  const docs = (uid) => strapi.documents(uid);
  /** Team changes are brand-level activity (entityType 'member'). */
  const log = (brandId, actor, action, entityId, entityTitle, changes = []) =>
    record(strapi, { brandId, actor, action, entityType: 'member', entityId, entityTitle, changes });

  /** Runs fn in a transaction; on PostgreSQL also serializes per brand. */
  async function locked(brandDocumentId, fn) {
    return strapi.db.transaction(async ({ trx }) => {
      if (strapi.db.config.connection.client === 'postgres' && trx) {
        await trx.raw('select pg_advisory_xact_lock(?)', [lockKey(`team:${brandDocumentId}`)]);
      }
      return fn();
    });
  }

  async function expireStale(brandDocumentId) {
    const filters = { status: 'pending', expiresAt: { $lt: new Date().toISOString() } };
    if (brandDocumentId) filters.brand = { documentId: brandDocumentId };
    const stale = await docs(INVITATION).findMany({ filters, fields: ['documentId'], limit: 500 });
    for (const i of stale) await docs(INVITATION).update({ documentId: i.documentId, data: { status: 'expired', pendingKey: null } });
  }

  async function activeMembers(brandDocumentId) {
    return docs(MEMBERSHIP).findMany({
      filters: { brand: { documentId: brandDocumentId }, status: 'active' },
      populate: { user: { fields: ['id', 'email', 'username', 'name'] } },
      limit: 1000,
    });
  }
  async function pendingInvites(brandDocumentId) {
    return docs(INVITATION).findMany({
      filters: { brand: { documentId: brandDocumentId }, status: 'pending' },
      populate: { invitedBy: { fields: ['username', 'name', 'email'] } },
      sort: 'createdAt:desc',
      limit: 1000,
    });
  }
  const ownerCount = (members) => members.filter((m) => m.role === 'owner').length;
  const maxSeatsOf = (brand) => brand.maxSeats ?? defaultSeats();
  const displayName = (u) => (u ? u.name || u.username || u.email : '—');

  function memberView(m, userId) {
    return { id: m.documentId, userId: String(m.user?.id ?? ''), name: displayName(m.user), email: m.user?.email ?? '', role: m.role, joinedAt: m.joinedAt ?? m.createdAt, isYou: m.user?.id === userId };
  }
  function inviteView(i) {
    return { id: i.documentId, email: i.email, role: i.role, status: i.status, invitedByName: displayName(i.invitedBy), createdAt: i.createdAt, expiresAt: i.expiresAt };
  }
  function fail(code) {
    if (!code) return;
    if (code === 'last_owner') throw new TeamError(409, 'LAST_OWNER', 'A brand must always keep at least one Owner.');
    if (code === 'invalid_role') throw new TeamError(400, 'INVALID_INPUT', 'Unsupported role', { role: 'invalid_role' });
    throw new TeamError(403, 'FORBIDDEN', code === 'owner_only' ? 'Only an Owner can change ownership.' : 'Your role in this brand does not allow this');
  }

  async function summary(brand, userId) {
    await expireStale(brand.documentId);
    const members = (await activeMembers(brand.documentId)).map((m) => memberView(m, userId))
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || String(a.joinedAt).localeCompare(String(b.joinedAt)));
    const invitations = (await pendingInvites(brand.documentId)).map(inviteView);
    return { brandId: brand.documentId, maxSeats: maxSeatsOf(brand), seatsUsed: seatsUsed(members.length, invitations.length), members, invitations };
  }

  async function notify(brand, inviter, invitation, token) {
    const link = `${frontendUrl()}/invite/${token}`;
    const emailSent = await sendInvitation(strapi, { to: invitation.email, brandName: brand.name, inviterName: displayName(inviter), role: invitation.role, link, expiresAt: invitation.expiresAt });
    return { invitation: inviteView({ ...invitation, invitedBy: inviter }), inviteUrl: link, emailSent };
  }

  async function invite(brand, actor, actorRole, input) {
    fail(inviteError(actorRole, input?.role));
    const email = normEmail(input?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TeamError(400, 'INVALID_INPUT', 'Invalid email', { email: 'invalid_email' });
    const token = newToken();
    const invitation = await locked(brand.documentId, async () => {
      await expireStale(brand.documentId);
      const user = await strapi.db.query('plugin::users-permissions.user').findOne({ where: { email } });
      if (user) {
        const existing = await docs(MEMBERSHIP).findFirst({ filters: { brand: { documentId: brand.documentId }, user: { id: user.id }, status: 'active' } });
        if (existing) throw new TeamError(409, 'ALREADY_MEMBER', 'This user is already a member.');
      }
      const dup = await docs(INVITATION).findFirst({ filters: { brand: { documentId: brand.documentId }, email, status: 'pending' } });
      if (dup) throw new TeamError(409, 'DUPLICATE_INVITE', 'An invitation has already been sent.');
      const [members, pending] = await Promise.all([activeMembers(brand.documentId), pendingInvites(brand.documentId)]);
      if (seatsUsed(members.length, pending.length) >= maxSeatsOf(brand)) throw new TeamError(409, 'SEAT_LIMIT', 'Your team has reached its seat limit.');
      const created = await docs(INVITATION).create({
        data: {
          brand: brand.documentId, email, role: input.role, tokenHash: hashToken(token), status: 'pending', invitedBy: actor.id,
          expiresAt: new Date(Date.now() + ttlDays() * 864e5).toISOString(), pendingKey: `${brand.documentId}:${email}`,
        },
      });
      await log(brand.documentId, actor, 'member.invited', created.documentId, email, [{ field: 'role', from: null, to: input.role }]);
      return created;
    });
    return notify(brand, actor, invitation, token);
  }

  async function resend(brand, actor, invitationId) {
    await expireStale(brand.documentId);
    const inv = await docs(INVITATION).findFirst({ filters: { documentId: invitationId, brand: { documentId: brand.documentId } } });
    if (!inv) throw new TeamError(404, 'NOT_FOUND', 'Invitation not found');
    if (inv.status !== 'pending') throw new TeamError(409, 'INVITE_INVALID', `This invitation is ${inv.status}.`);
    const token = newToken(); // new link; the old one stops working
    const updated = await docs(INVITATION).update({
      documentId: inv.documentId,
      data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlDays() * 864e5).toISOString() },
    });
    await log(brand.documentId, actor, 'member.invite_resent', inv.documentId, inv.email);
    return notify(brand, actor, updated, token);
  }

  async function cancel(brand, actor, invitationId) {
    const inv = await docs(INVITATION).findFirst({ filters: { documentId: invitationId, brand: { documentId: brand.documentId } } });
    if (!inv) throw new TeamError(404, 'NOT_FOUND', 'Invitation not found');
    if (inv.status === 'pending') {
      await docs(INVITATION).update({ documentId: inv.documentId, data: { status: 'cancelled', pendingKey: null } });
      await log(brand.documentId, actor, 'member.invite_cancelled', inv.documentId, inv.email);
    }
  }

  async function memberIn(brand, memberId) {
    const m = await docs(MEMBERSHIP).findFirst({
      filters: { documentId: memberId, brand: { documentId: brand.documentId }, status: 'active' },
      populate: { user: { fields: ['id', 'email', 'username', 'name'] } },
    });
    if (!m) throw new TeamError(404, 'NOT_FOUND', 'Member not found');
    return m;
  }

  async function updateRole(brand, actor, actorRole, memberId, role) {
    return locked(brand.documentId, async () => {
      const m = await memberIn(brand, memberId);
      fail(roleChangeError(actorRole, m.role, role, ownerCount(await activeMembers(brand.documentId))));
      const now = new Date().toISOString();
      const updated = await docs(MEMBERSHIP).update({ documentId: m.documentId, data: { role, roleUpdatedAt: now }, populate: { user: { fields: ['id', 'email', 'username', 'name'] } } });
      if (role !== m.role) await log(brand.documentId, actor, 'member.role_changed', m.documentId, displayName(m.user), [{ field: 'role', from: m.role, to: role }]);
      return memberView(updated, actor.id);
    });
  }

  async function removeMember(brand, actor, actorRole, memberId) {
    return locked(brand.documentId, async () => {
      const m = await memberIn(brand, memberId);
      const owners = ownerCount(await activeMembers(brand.documentId));
      fail(m.user?.id === actor.id ? leaveError(m.role, owners) : removeError(actorRole, m.role, owners));
      // Access ends immediately; their content, images and attribution stay.
      await docs(MEMBERSHIP).update({ documentId: m.documentId, data: { status: 'removed' } });
      await log(brand.documentId, actor, m.user?.id === actor.id ? 'member.left' : 'member.removed', m.documentId, displayName(m.user), [{ field: 'role', from: m.role, to: null }]);
    });
  }

  async function leave(brand, actor) {
    return locked(brand.documentId, async () => {
      const m = await docs(MEMBERSHIP).findFirst({ filters: { brand: { documentId: brand.documentId }, user: { id: actor.id }, status: 'active' } });
      if (!m) throw new TeamError(404, 'NOT_FOUND', 'Not a member');
      fail(leaveError(m.role, ownerCount(await activeMembers(brand.documentId))));
      await docs(MEMBERSHIP).update({ documentId: m.documentId, data: { status: 'removed' } });
      await log(brand.documentId, actor, 'member.left', m.documentId, displayName(actor), [{ field: 'role', from: m.role, to: null }]);
    });
  }

  async function byToken(token) {
    const inv = await docs(INVITATION).findFirst({
      filters: { tokenHash: hashToken(token) },
      populate: { brand: { fields: ['name', 'color', 'maxSeats'] }, invitedBy: { fields: ['username', 'name', 'email'] } },
    });
    if (!inv) throw new TeamError(404, 'INVITE_INVALID', 'This invitation link is not valid.');
    return inv;
  }
  async function mineById(user, id) {
    const inv = await docs(INVITATION).findFirst({
      filters: { documentId: id, email: normEmail(user.email) },
      populate: { brand: { fields: ['name', 'color', 'maxSeats'] }, invitedBy: { fields: ['username', 'name', 'email'] } },
    });
    if (!inv) throw new TeamError(404, 'INVITE_INVALID', 'This invitation is no longer available.');
    return inv;
  }

  function checkPending(inv, user) {
    if (inv.status === 'pending' && new Date(inv.expiresAt) < new Date()) inv.status = 'expired';
    if (inv.status === 'expired') throw new TeamError(410, 'INVITE_EXPIRED', 'This invitation has expired. Ask for a new one.');
    if (inv.status !== 'pending') throw new TeamError(409, 'INVITE_INVALID', `This invitation was already ${inv.status}.`);
    // The signed-in account must be the invited address.
    if (normEmail(user.email) !== normEmail(inv.email)) throw new TeamError(403, 'EMAIL_MISMATCH', `This invitation was sent to ${inv.email}.`);
  }

  async function accept(inv, user) {
    if (!inv.brand) throw new TeamError(404, 'NOT_FOUND', 'Brand not found');
    const brandId = inv.brand.documentId;
    return locked(brandId, async () => {
      // Re-read inside the lock so two accepts (or accept + cancel) can't both win.
      const fresh = await docs(INVITATION).findOne({ documentId: inv.documentId });
      checkPending({ ...inv, ...fresh }, user);
      const [members, pending] = await Promise.all([activeMembers(brandId), pendingInvites(brandId)]);
      // This invitation already holds a seat, so accepting doesn't add one — unless the limit was lowered.
      if (seatsUsed(members.length, pending.length) > maxSeatsOf(inv.brand)) throw new TeamError(409, 'SEAT_LIMIT', 'This team has reached its seat limit.');
      const now = new Date().toISOString();
      const prev = await docs(MEMBERSHIP).findFirst({ filters: { brand: { documentId: brandId }, user: { id: user.id } } });
      if (prev) await docs(MEMBERSHIP).update({ documentId: prev.documentId, data: { role: inv.role, status: 'active', joinedAt: now, roleUpdatedAt: now } });
      else await docs(MEMBERSHIP).create({ data: { brand: brandId, user: user.id, role: inv.role, status: 'active', joinedAt: now, memberKey: `${brandId}:${user.id}` } });
      await docs(INVITATION).update({ documentId: inv.documentId, data: { status: 'accepted', acceptedBy: user.id, acceptedAt: now, pendingKey: null } });
      await log(brandId, user, 'member.joined', inv.documentId, displayName(user), [{ field: 'role', from: null, to: inv.role }]);
      return { brandId };
    });
  }

  async function decline(inv, user) {
    checkPending(inv, user);
    await docs(INVITATION).update({ documentId: inv.documentId, data: { status: 'declined', pendingKey: null } });
    if (inv.brand) await log(inv.brand.documentId, user, 'member.invite_declined', inv.documentId, inv.email);
  }

  function preview(inv) {
    const expired = inv.status === 'pending' && new Date(inv.expiresAt) < new Date();
    return {
      status: expired ? 'expired' : inv.status, brandName: inv.brand?.name ?? '—', brandColor: inv.brand?.color ?? '#6C4CF5',
      inviterName: displayName(inv.invitedBy), email: inv.email, role: inv.role, expiresAt: inv.expiresAt,
    };
  }

  async function mine(user) {
    await expireStale(null);
    const rows = await docs(INVITATION).findMany({
      filters: { email: normEmail(user.email), status: 'pending' },
      populate: { brand: { fields: ['name', 'color'] }, invitedBy: { fields: ['username', 'name', 'email'] } },
      limit: 100,
    });
    return rows.filter((i) => i.brand).map((i) => ({
      id: i.documentId, brandId: i.brand.documentId, brandName: i.brand.name, brandColor: i.brand.color,
      inviterName: displayName(i.invitedBy), role: i.role, expiresAt: i.expiresAt,
    }));
  }

  return { TeamError, summary, invite, resend, cancel, updateRole, removeMember, leave, byToken, mineById, accept, decline, preview, mine, BRAND };
};
