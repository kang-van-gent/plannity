'use strict';

/**
 * Member position tags (plannity-context-member-positions.md). Brand-scoped job
 * labels, independent of roles: they never grant permissions or use seats.
 * app/app/utils/positions.ts mirrors this list; keep them in sync.
 */
const POSITION_KEYS = [
  'content_creator', 'graphic_designer', 'video_editor', 'marketing_manager', 'project_manager',
  'stock_manager', 'social_media', 'photographer', 'client',
];

/** Positions that can take design tasks (and so show the shared My Tasks menu). */
const TASK_POSITIONS = ['graphic_designer', 'video_editor', 'photographer'];

/** Validated, de-duplicated keys in canonical order; `error` when anything is unknown. */
function normalizePositions(value) {
  if (value === undefined || value === null) return { keys: [], error: null };
  if (!Array.isArray(value)) return { keys: [], error: 'invalid_position' };
  if (value.some((k) => !POSITION_KEYS.includes(k))) return { keys: [], error: 'invalid_position' };
  return { keys: POSITION_KEYS.filter((k) => value.includes(k)), error: null };
}

module.exports = { POSITION_KEYS, TASK_POSITIONS, normalizePositions };
