// wrapType/src/react/WrapTypeScene.tsx — React component wrapping the CSS3DRenderer scene
'use client'

import { useRef } from 'react'
import { useWrapScene } from './useWrapType'
import type { WrapTypeOptions, CharPosition } from '../core/types'

/** Props for WrapTypeScene — all WrapTypeOptions, optional custom positions, and HTML attributes */
export interface WrapTypeSceneProps extends WrapTypeOptions, Omit<React.HTMLAttributes<HTMLDivElement>, 'color' | 'children'> {
	/**
	 * Pre-computed character positions, e.g. from `getCharPositionsFromMesh`. When provided, bypasses the
	 * built-in geometry. The scene still respects `autoRotate`, `color`, `fontSize`, `fontFamily` and
	 * `fontWeight`. A new array with the same content doesn't rebuild the scene.
	 */
	positions?: CharPosition[]
}

/** WrapTypeOptions keys: consumed by the scene, not forwarded to the DOM element. */
const OPTION_KEYS: (keyof WrapTypeOptions)[] = [
	'text', 'fontFamily', 'fontWeight', 'fontSize', 'color', 'charWidthMap', 'shape', 'mode', 'fill', 'camera',
	'cameraPosition', 'autoRotate', 'autoRotateSpeed', 'radius', 'height', 'charAdvanceRatio', 'lineHeightRatio',
	'repeat', 'characterCurve', 'showBackfaces', 'zoom',
]

/**
 * Renders text wrapping a 3D surface inside a positioned container div. The container fills its parent —
 * give it explicit width and height. HTML attributes (id, aria-*, data-*, role, title…) are forwarded.
 * Screen readers get the text once; the 3D characters are hidden from them.
 *
 * @example
 * <WrapTypeScene text="Typography" shape="sphere" fill="cover" autoRotate style={{ width: '100%', height: '500px' }} />
 */
export function WrapTypeScene({ className, style, positions, ...rest }: WrapTypeSceneProps) {
	const options = {} as WrapTypeOptions
	const htmlProps: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(rest)) {
		if ((OPTION_KEYS as string[]).includes(key)) (options as unknown as Record<string, unknown>)[key] = value
		else htmlProps[key] = value
	}
	const containerRef = useRef<HTMLDivElement>(null)
	useWrapScene(containerRef, options, positions)

	return (
		<div
			ref={containerRef}
			className={className}
			style={{ width: '100%', height: '100%', ...style }}
			{...htmlProps}
		/>
	)
}
