// wrapType/src/core.ts — React-free entry (@overpunch/wraptype/core): geometry and the CSS3D scene (needs three).
export type { WrapTypeShape, WrapTypeMode, WrapTypeFill, WrapTypeCamera, WrapTypeOptions, CharPosition } from './core/types'
export { WRAP_TYPE_CLASS } from './core/types'
export { getCharPositions, getCharPositionsAt, isAnimatedShape, splitGraphemes, MAX_POSITIONS } from './core/geometry'
export { getCharPositionsFromMesh } from './core/mesh'
export { createWrapScene, measureCharWidths } from './core/scene'
export type { SceneHandle } from './core/scene'
