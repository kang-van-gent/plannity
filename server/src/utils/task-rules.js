'use strict';

/**
 * Task assignment rules (plannity-context-task-assignment.md). Pure functions,
 * shared by the Strapi service and mirrored in app/app/utils/tasks.ts.
 *
 * Task status is separate from content status: completing a task never marks
 * the post approved or published.
 *
 *   todo → in_progress → in_review → completed
 *   in_review → changes_requested → in_progress
 *   any open status → cancelled (managers)        reassign → todo
 */
const { roleCan } = require('./permissions');
const { TASK_POSITIONS } = require('./positions');

const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'changes_requested', 'completed', 'cancelled'];
const OPEN_STATUSES = ['todo', 'in_progress', 'in_review', 'changes_requested'];
const PRIORITIES = ['normal', 'high'];

/** action → allowed from-statuses, target status and who may do it. */
const TRANSITIONS = {
  start: { from: ['todo', 'changes_requested'], to: 'in_progress', who: 'assignee' },
  submit: { from: ['in_progress'], to: 'in_review', who: 'assignee' },
  approve: { from: ['in_review'], to: 'completed', who: 'reviewer' },
  request_changes: { from: ['in_review'], to: 'changes_requested', who: 'reviewer' },
  cancel: { from: OPEN_STATUSES, to: 'cancelled', who: 'manager' },
};

const isManagerRole = (role) => role === 'owner' || role === 'admin';

/**
 * Who the actor is for this task.
 *  - assignee: the assigned member, while they can still edit content
 *  - reviewer/manager: Owner/Admin, or whoever assigned it (if they can still edit)
 */
function actorCapabilities({ role, isAssignee, isAssigner }) {
  const canEdit = roleCan(role, 'content.update');
  return {
    assignee: isAssignee && canEdit,
    reviewer: isManagerRole(role) || (isAssigner && canEdit),
    manager: isManagerRole(role) || (isAssigner && canEdit),
    assign: canEdit,
  };
}

/** Why `action` can't happen (null = allowed). */
function transitionError(action, { status, caps, imageCount = 0, note = '' }) {
  const t = TRANSITIONS[action];
  if (!t) return 'invalid_action';
  if (!caps[t.who]) return 'forbidden';
  if (!t.from.includes(status)) return 'invalid_transition';
  if (action === 'submit' && imageCount < 1) return 'needs_image';
  if (action === 'request_changes' && !String(note || '').trim()) return 'note_required';
  return null;
}

/**
 * Why `assignee` can't take this task (null = allowed). Position is a filter,
 * never authorization: the member also needs content-edit rights.
 */
function assigneeError({ positionKey, member }) {
  if (!TASK_POSITIONS.includes(positionKey)) return 'invalid_position';
  if (!member || member.status !== 'active') return 'invalid_assignee';
  if (!roleCan(member.role, 'content.update')) return 'assignee_cannot_edit';
  if (!(member.positionKeys || []).includes(positionKey)) return 'position_mismatch';
  return null;
}

/** Field checks for create / reassignment. */
function assignmentFieldErrors({ dueDate, priority, note }) {
  const e = {};
  if (dueDate !== undefined && dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate))) e.dueDate = 'invalid_date';
  if (priority !== undefined && !PRIORITIES.includes(priority)) e.priority = 'invalid';
  if (note !== undefined && note !== null && String(note).length > 1000) e.note = 'too_long';
  return e;
}

/** Overdue = past its due date and not finished. */
const isOverdue = (task, today) => !!task.dueDate && task.dueDate < today && OPEN_STATUSES.includes(task.status);

module.exports = { TASK_STATUSES, OPEN_STATUSES, PRIORITIES, TRANSITIONS, actorCapabilities, transitionError, assigneeError, assignmentFieldErrors, isOverdue };
