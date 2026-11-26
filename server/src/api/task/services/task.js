'use strict';

/**
 * Task assignment & My Tasks (plannity-context-task-assignment.md).
 *
 * - Brand is always derived from the post, never taken from the client.
 * - Every read/write re-checks the caller's current membership and role, and
 *   mutations also need the brand owner's plan to include task assignment.
 * - One open design task per post (unique activeKey); concurrent transitions
 *   are rejected with VERSION_CONFLICT rather than silently overwriting.
 * - Task status never changes the post's own status.
 * - Uploads reuse the post's existing image attachments (no second storage).
 */
const { roleFor, MEMBERSHIP } = require('../../../utils/brand-access');
const { brandFeatures } = require('../../../services/entitlements');
const { record } = require('../../../services/activity');
const R = require('../../../utils/task-rules');

const TASK = 'api::task.task';
const EVENT = 'api::task-event.task-event';
const CONTENT = 'api::content.content';

class TaskError extends Error {
  constructor(status, code, message, fieldErrors = {}) {
    super(message);
    Object.assign(this, { status, code, fieldErrors });
  }
}

const MESSAGES = {
  forbidden: [403, 'FORBIDDEN', 'Your role does not allow this.'],
  invalid_transition: [409, 'CONFLICT', 'This task has moved on. Reload to see its current status.'],
  invalid_action: [400, 'INVALID_INPUT', 'Unknown action'],
  needs_image: [400, 'INVALID_INPUT', 'Attach at least one final image to the post before submitting.', { images: 'needs_image' }],
  note_required: [400, 'INVALID_INPUT', 'Say what needs to change.', { note: 'required' }],
  invalid_position: [400, 'INVALID_INPUT', 'Pick a design position.', { positionKey: 'invalid_position' }],
  invalid_assignee: [400, 'INVALID_INPUT', 'That person is not an active member of this brand.', { assigneeId: 'invalid_assignee' }],
  assignee_cannot_edit: [400, 'INVALID_INPUT', 'Viewers cannot take tasks — they can\'t edit posts.', { assigneeId: 'assignee_cannot_edit' }],
  position_mismatch: [400, 'INVALID_INPUT', 'That member doesn\'t have this position in this brand.', { assigneeId: 'position_mismatch' }],
};
const failWith = (code) => { const [s, c, m, f] = MESSAGES[code] || [400, 'INVALID_INPUT', code]; throw new TaskError(s, c, m, f); };

const displayName = (u) => (u ? u.name || u.username || u.email : '—');
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Asia/Bangkok

const POPULATE = {
  brand: { fields: ['name', 'color'] },
  content: { fields: ['title', 'version', 'visualBrief', 'caption', 'scheduledDate', 'status'], populate: { images: { fields: ['id'] } } },
  assignee: { fields: ['role', 'status', 'positionKeys'], populate: { user: { fields: ['id', 'username', 'name', 'email'] } } },
  assignedBy: { fields: ['id', 'username', 'name', 'email'] },
};

module.exports = ({ strapi }) => {
  const docs = (uid) => strapi.documents(uid);

  async function lockTask(trx, key) {
    if (strapi.db.config.connection.client === 'postgres' && trx) {
      let h = 0x811c9dc5;
      for (const ch of `task:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
      await trx.raw('select pg_advisory_xact_lock(?)', [h | 0]);
    }
  }

  function view(t, ctx = {}) {
    const a = t.assignee;
    const brief = t.content?.visualBrief ?? '';
    return {
      id: t.documentId, brandId: t.brand?.documentId ?? null, brandName: t.brand?.name ?? '—', brandColor: t.brand?.color ?? '#6C4CF5',
      contentId: t.content?.documentId ?? null, contentTitle: t.content?.title ?? '—', contentScheduledDate: t.content?.scheduledDate ?? null,
      imageCount: t.content?.images?.length ?? 0, type: t.type, positionKey: t.positionKey,
      assignee: a ? { memberId: a.documentId, userId: String(a.user?.id ?? ''), name: displayName(a.user), positionKeys: a.positionKeys ?? [], active: a.status === 'active' } : null,
      assignedByName: displayName(t.assignedBy), dueDate: t.dueDate ?? null, priority: t.priority, note: t.note ?? null,
      status: t.status, reviewNote: t.reviewNote ?? null, completedAt: t.completedAt ?? null,
      briefVersion: t.briefVersion ?? null, briefSnapshot: t.briefSnapshot ?? null,
      briefChanged: t.briefSnapshot !== null && t.briefSnapshot !== undefined && t.briefSnapshot !== brief,
      version: t.version, createdAt: t.createdAt, updatedAt: t.updatedAt,
      isMine: !!ctx.userId && a?.user?.id === ctx.userId,
      caps: ctx.suspended
        ? { assignee: false, reviewer: false, manager: false }
        : (({ assignee, reviewer, manager }) => ({ assignee, reviewer, manager }))(R.actorCapabilities({ role: ctx.role, isAssignee: !!ctx.userId && a?.user?.id === ctx.userId && a?.status === 'active', isAssigner: t.assignedBy?.id === ctx.userId })),
      suspended: !!ctx.suspended, events: ctx.events,
    };
  }

  async function eventsOf(taskDocumentId) {
    const rows = await docs(EVENT).findMany({ filters: { task: { documentId: taskDocumentId } }, sort: 'createdAt:asc', limit: 200 });
    return rows.map((e) => ({ id: e.documentId, action: e.action, fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null, actorName: e.actorName, note: e.note ?? null, createdAt: e.createdAt }));
  }

  async function addEvent(task, actor, action, fromStatus, toStatus, note = null) {
    await docs(EVENT).create({ data: { task: task.documentId, actor: actor.id, actorName: displayName(actor).slice(0, 120), action, fromStatus, toStatus, note } });
  }

  /** The post's activity log also shows task milestones. */
  const logTask = (task, actor, action, changes = []) => record(strapi, {
    brandId: task.brand?.documentId, actor, action, entityType: 'content', entityId: task.content?.documentId, entityTitle: task.content?.title, changes,
  });

  /** Brand role + plan features for the caller on this brand; 404 when not a member. */
  async function access(brandDocumentId, user) {
    const role = await roleFor(strapi, brandDocumentId, user.id);
    if (!role) throw new TaskError(404, 'NOT_FOUND', 'Not found');
    const { features, ownerId } = await brandFeatures(strapi, brandDocumentId);
    return { role, features, ownerId };
  }
  function requirePlan(features) {
    if (!features.taskAssignment) throw new TaskError(402, 'PLAN_REQUIRED', 'Task assignment needs a Team or Studio plan on the brand owner\'s account.');
  }

  async function loadTask(id) {
    const t = await docs(TASK).findOne({ documentId: id, populate: POPULATE });
    if (!t || !t.brand) throw new TaskError(404, 'NOT_FOUND', 'Task not found');
    return t;
  }

  async function memberOf(brandDocumentId, memberId) {
    return docs(MEMBERSHIP).findFirst({ filters: { documentId: memberId, brand: { documentId: brandDocumentId } }, fields: ['role', 'status', 'positionKeys'] });
  }

  // -------------------------------------------------------------------- reads

  async function forContent(contentId, user) {
    const c = await docs(CONTENT).findOne({ documentId: contentId, fields: ['title'], populate: { brand: { fields: ['documentId'] } } });
    if (!c?.brand) throw new TaskError(404, 'NOT_FOUND', 'Content not found');
    const { role, features } = await access(c.brand.documentId, user);
    const rows = await docs(TASK).findMany({ filters: { content: { documentId: contentId } }, populate: POPULATE, sort: 'createdAt:desc', limit: 50 });
    return Promise.all(rows.map(async (t) => view(t, { userId: user.id, role, suspended: !features.taskAssignment, events: await eventsOf(t.documentId) })));
  }

  /** Tasks assigned to me across every brand I can still access, overdue first. */
  async function mine(user) {
    const rows = await docs(TASK).findMany({
      filters: { assignee: { user: { id: user.id }, status: 'active' } },
      populate: POPULATE, sort: 'updatedAt:desc', limit: 500,
    });
    const out = [];
    for (const t of rows) {
      const role = await roleFor(strapi, t.brand?.documentId, user.id); // revoked access disappears immediately
      if (!role) continue;
      const { features } = await brandFeatures(strapi, t.brand.documentId);
      out.push(view(t, { userId: user.id, role, suspended: !features.taskAssignment }));
    }
    const d = today();
    return out.sort((a, b) => Number(R.isOverdue(b, d)) - Number(R.isOverdue(a, d)) || String(a.dueDate ?? '9999').localeCompare(String(b.dueDate ?? '9999')));
  }

  async function forBrand(brandId, user) {
    const { role, features } = await access(brandId, user);
    const rows = await docs(TASK).findMany({ filters: { brand: { documentId: brandId } }, populate: POPULATE, sort: 'updatedAt:desc', limit: 500 });
    return rows.map((t) => view(t, { userId: user.id, role, suspended: !features.taskAssignment }));
  }

  // ---------------------------------------------------------------- mutations

  async function create(contentId, user, input = {}) {
    const c = await docs(CONTENT).findOne({ documentId: contentId, populate: { brand: { fields: ['documentId'] } } });
    if (!c?.brand) throw new TaskError(404, 'NOT_FOUND', 'Content not found');
    const brandId = c.brand.documentId;
    const { role, features } = await access(brandId, user);
    requirePlan(features);
    if (!R.actorCapabilities({ role, isAssignee: false, isAssigner: false }).assign) failWith('forbidden');
    const fe = R.assignmentFieldErrors(input);
    if (Object.keys(fe).length) throw new TaskError(400, 'INVALID_INPUT', 'Invalid input', fe);
    const member = input.assigneeId ? await memberOf(brandId, input.assigneeId) : null;
    const err = R.assigneeError({ positionKey: input.positionKey, member });
    if (err) failWith(err);

    const created = await strapi.db.transaction(async ({ trx }) => {
      await lockTask(trx, `content:${contentId}`);
      const open = await docs(TASK).findFirst({ filters: { activeKey: `${contentId}:design` } });
      if (open) throw new TaskError(409, 'CONFLICT', 'This post already has an open design task. Reassign or finish it first.');
      const t = await docs(TASK).create({
        data: {
          brand: brandId, content: contentId, type: 'design', positionKey: input.positionKey, assignee: input.assigneeId, assignedBy: user.id,
          dueDate: input.dueDate || null, priority: input.priority || 'normal', note: input.note || null, status: 'todo',
          briefVersion: c.version, briefSnapshot: c.visualBrief ?? '', version: 1, activeKey: `${contentId}:design`,
        },
      });
      const full = await loadTask(t.documentId);
      await addEvent(full, user, 'assigned', null, 'todo', input.note || null);
      await logTask(full, user, 'task.assigned', [{ field: 'assignee', from: null, to: full.assignee ? displayName(full.assignee.user) : null }, { field: 'dueDate', from: null, to: input.dueDate || null }]);
      return full;
    });
    return view(created, { userId: user.id, role, events: await eventsOf(created.documentId) });
  }

  /** Reassign / change due date, priority or note. Reassigning restarts the task at "to do"; history stays. */
  async function updateAssignment(id, user, input = {}) {
    const t0 = await loadTask(id);
    const brandId = t0.brand.documentId;
    const { role, features } = await access(brandId, user);
    requirePlan(features);
    const caps = R.actorCapabilities({ role, isAssignee: t0.assignee?.user?.id === user.id, isAssigner: t0.assignedBy?.id === user.id });
    if (!caps.manager) failWith('forbidden');
    if (!R.OPEN_STATUSES.includes(t0.status)) failWith('invalid_transition');
    const fe = R.assignmentFieldErrors(input);
    if (Object.keys(fe).length) throw new TaskError(400, 'INVALID_INPUT', 'Invalid input', fe);
    const reassign = input.assigneeId !== undefined && input.assigneeId !== t0.assignee?.documentId;
    const positionKey = input.positionKey ?? t0.positionKey;
    if (reassign || input.positionKey !== undefined) {
      const err = R.assigneeError({ positionKey, member: await memberOf(brandId, input.assigneeId ?? t0.assignee?.documentId) });
      if (err) failWith(err);
    }

    const updated = await strapi.db.transaction(async ({ trx }) => {
      await lockTask(trx, id);
      const fresh = await docs(TASK).findOne({ documentId: id });
      if (Number(input.version) !== Number(fresh.version)) throw new TaskError(409, 'VERSION_CONFLICT', 'Someone else changed this task. Reload and try again.');
      const data = { version: Number(fresh.version) + 1, positionKey };
      for (const k of ['dueDate', 'priority', 'note']) if (input[k] !== undefined) data[k] = input[k] || (k === 'priority' ? 'normal' : null);
      if (reassign) Object.assign(data, { assignee: input.assigneeId, status: 'todo', reviewNote: null });
      await docs(TASK).update({ documentId: id, data });
      const full = await loadTask(id);
      if (reassign) {
        await addEvent(full, user, 'reassigned', fresh.status, 'todo', input.note || null);
        await logTask(full, user, 'task.reassigned', [{ field: 'assignee', from: t0.assignee ? displayName(t0.assignee.user) : null, to: full.assignee ? displayName(full.assignee.user) : null }]);
      } else {
        await addEvent(full, user, 'updated', fresh.status, fresh.status);
      }
      return full;
    });
    return view(updated, { userId: user.id, role, events: await eventsOf(id) });
  }

  async function transition(id, user, input = {}) {
    const t0 = await loadTask(id);
    const brandId = t0.brand.documentId;
    const { role, features } = await access(brandId, user);
    requirePlan(features);
    const caps = R.actorCapabilities({ role, isAssignee: t0.assignee?.user?.id === user.id && t0.assignee?.status === 'active', isAssigner: t0.assignedBy?.id === user.id });

    const updated = await strapi.db.transaction(async ({ trx }) => {
      await lockTask(trx, id);
      const fresh = await loadTask(id);
      if (Number(input.version) !== Number(fresh.version)) throw new TaskError(409, 'VERSION_CONFLICT', 'Someone else changed this task. Reload and try again.');
      const err = R.transitionError(input.action, { status: fresh.status, caps, imageCount: fresh.content?.images?.length ?? 0, note: input.note });
      if (err) failWith(err);
      const to = R.TRANSITIONS[input.action].to;
      const data = { status: to, version: Number(fresh.version) + 1 };
      if (input.action === 'request_changes') data.reviewNote = String(input.note).trim().slice(0, 1000);
      if (to === 'completed') data.completedAt = new Date().toISOString();
      if (to === 'completed' || to === 'cancelled') data.activeKey = null; // frees the post for a new task
      await docs(TASK).update({ documentId: id, data });
      const full = await loadTask(id);
      await addEvent(full, user, input.action, fresh.status, to, input.note ? String(input.note).slice(0, 1000) : null);
      await logTask(full, user, `task.${input.action === 'start' ? 'started' : input.action === 'submit' ? 'submitted' : input.action === 'approve' ? 'approved' : input.action === 'cancel' ? 'cancelled' : 'changes_requested'}`,
        [{ field: 'taskStatus', from: fresh.status, to }]);
      return full;
    });
    return view(updated, { userId: user.id, role, events: await eventsOf(id) });
  }

  return { TaskError, forContent, mine, forBrand, create, updateAssignment, transition };
};
