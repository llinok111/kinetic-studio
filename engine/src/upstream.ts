/**
 * The single place where the engine touches upstream code.
 *
 * Everything imported here is `@use-gesture` core source, unmodified. Keeping the
 * imports in one file means:
 *   - `grep -rn "packages/core" engine/src` returns exactly one file, so the
 *     "upstream untouched" claim is auditable in one command;
 *   - an upstream version bump only has to be reconciled here.
 */

export { Controller } from '../../packages/core/src/index'
export { registerAction, dragAction, pinchAction } from '../../packages/core/src/actions'
export { rubberbandIfOutOfBounds } from '../../packages/core/src/utils/maths'
export type { UserDragConfig, UserPinchConfig } from '../../packages/core/src/types'
