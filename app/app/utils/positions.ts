// Member position tags (plannity-context-member-positions.md). Labels only:
// roles decide permissions. Mirrors server/src/utils/positions.js.
import type { PositionKey } from '~/types'
import { POSITION_KEYS } from '~/types'

/** Positions that take design tasks — members with one see the shared My Tasks menu. */
export const TASK_POSITIONS: PositionKey[] = ['graphic_designer', 'video_editor', 'photographer']

export const POSITION_COLORS: Record<PositionKey, string> = {
  content_creator: '#6C4CF5', graphic_designer: '#FF6FAE', video_editor: '#FF8A3D', marketing_manager: '#62C5F4', project_manager: '#3FB68B',
  stock_manager: '#8B7355', social_media: '#FFB23F', photographer: '#A7E66B', client: '#94A3B8',
}

export function normalizePositions(value: unknown): { keys: PositionKey[]; error: string | null } {
  if (value === undefined || value === null) return { keys: [], error: null }
  if (!Array.isArray(value) || value.some((k) => !(POSITION_KEYS as readonly string[]).includes(k))) return { keys: [], error: 'invalid_position' }
  return { keys: POSITION_KEYS.filter((k) => value.includes(k)), error: null }
}
