// wrapType/src/r3f.ts — R3F entry point: SDF surface text via troika-three-text
// Import from '@overpunch/wraptype/r3f'
// Requires: @react-three/fiber, three, troika-three-text

export { WrapTypeMesh } from './react/WrapTypeMesh'
export type { WrapTypeMeshProps } from './react/WrapTypeMesh'

export { createSDFText, updateSDFText } from './core/sdf'
export type { WrapTypeMeshOptions } from './core/sdf'

// Re-export shared shape type so consumers don't need two imports
export type { WrapTypeShape } from './core/types'
