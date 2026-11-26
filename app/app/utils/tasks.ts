// Task workflow rules — mirrors server/src/utils/task-rules.js (UX only there
// is the source of truth). Task status stays separate from post status.
import type { BrandRole, PositionKey, TaskAction, TaskStatus } from '~/types'
import { roleCan } from './permissions'
import { TASK_POSITIONS } from './positions'

export const OPEN_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'changes_requested']

export const TASK_TRANSITIONS: Record<TaskAction, { from: TaskStatus[]; to: TaskStatus; who: 'assignee' | 'reviewer' | 'manager' }> = {
  start: { from: ['todo', 'changes_requested'], to: 'in_progress', who: 'assignee' },
  submit: { from: ['in_progress'], to: 'in_review', who: 'assignee' },
  approve: { from: ['in_review'], to: 'completed', who: 'reviewer' },
  request_changes: { from: ['in_review'], to: 'changes_requested', who: 'reviewer' },
  cancel: { from: OPEN_TASK_STATUSES, to: 'cancelled', who: 'manager' },
}

export function actorCapabilities(role: BrandRole | null | undefined, isAssignee: boolean, isAssigner: boolean) {
  const canEdit = roleCan(role, 'content.update')
  const manager = role === 'owner' || role === 'admin' || (isAssigner && canEdit)
  return { assignee: isAssignee && canEdit, reviewer: manager, manager, assign: canEdit }
}

export function transitionError(action: TaskAction, status: TaskStatus, caps: ReturnType<typeof actorCapabilities>, imageCount = 0, note = ''): string | null {
  const t = TASK_TRANSITIONS[action]
  if (!caps[t.who]) return 'forbidden'
  if (!t.from.includes(status)) return 'invalid_transition'
  if (action === 'submit' && imageCount < 1) return 'needs_image'
  if (action === 'request_changes' && !note.trim()) return 'note_required'
  return null
}

export function assigneeError(positionKey: PositionKey, member: { role: BrandRole; positionKeys: PositionKey[]; status?: string } | null | undefined): string | null {
  if (!TASK_POSITIONS.includes(positionKey)) return 'invalid_position'
  if (!member || (member.status && member.status !== 'active')) return 'invalid_assignee'
  if (!roleCan(member.role, 'content.update')) return 'assignee_cannot_edit'
  if (!member.positionKeys.includes(positionKey)) return 'position_mismatch'
  return null
}

export const isOverdue = (t: { dueDate: string | null; status: TaskStatus }, today: string) => !!t.dueDate && t.dueDate < today && OPEN_TASK_STATUSES.includes(t.status)

/** UI grouping for My Tasks filters. */
export const TASK_GROUP: Record<TaskStatus, 'todo' | 'working' | 'review' | 'done'> = {
  todo: 'todo', in_progress: 'working', changes_requested: 'working', in_review: 'review', completed: 'done', cancelled: 'done',
}
