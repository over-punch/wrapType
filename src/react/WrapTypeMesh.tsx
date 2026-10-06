// wrapType/src/react/WrapTypeMesh.tsx — R3F component: SDF text on 3D surface via troika-three-text

import { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createSDFText, updateSDFText } from '../core/sdf'
import type { WrapTypeMeshOptions } from '../core/sdf'
import type { WrapTypeShape } from '../core/types'

/** Props for WrapTypeMesh */
export interface WrapTypeMeshProps extends WrapTypeMeshOptions {
	/** Built-in shape. Default: 'sphere' */
	shape?: WrapTypeShape
	/** Shape radius in Three.js units. Default: 1.0 */
	radius?: number
	/** Position in scene. Default: [0, 0, 0] */
	position?: [number, number, number]
	/** Rotation in radians [x, y, z]. Default: [0, 0, 0] */
	rotation?: [number, number, number]
	/** Scale. Default: [1, 1, 1] */
	scale?: [number, number, number]
	/** Auto-rotate around Y axis. Default: false */
	autoRotate?: boolean
	/** Auto-rotation speed in radians/second. Default: 0.3 */
	autoRotateSpeed?: number
}

/**
 * React Three Fiber component that renders GPU-antialiased (SDF) text
 * projected onto a 3D surface using troika-three-text's native curveRadius.
 *
 * Must be rendered inside a R3F `<Canvas>`. Unlike WrapTypeScene (which uses
 * CSS3DRenderer), WrapTypeMesh lives in the WebGL scene and composes with
 * Three.js lights, shaders, and post-processing.
 *
 * The component manages its own THREE.Group imperatively — no JSX intrinsics
 * are used, so it works without R3F's global JSX type augmentation.
 *
 * @example
 * <Canvas>
 *   <WrapTypeMesh shape="sphere" radius={1} text="Hello world" color="#fff" autoRotate />
 * </Canvas>
 */
export const WrapTypeMesh = forwardRef<THREE.Group, WrapTypeMeshProps>(
	(
		{
			shape = 'sphere',
			radius = 1.0,
			position = [0, 0, 0],
			rotation = [0, 0, 0],
			scale = [1, 1, 1],
			autoRotate = false,
			autoRotateSpeed = 0.3,
			text,
			font,
			fontSize,
			letterSpacing,
			maxWidth,
			textAlign,
			color,
			curvatureTracking,
			curvatureTrackingFactor,
		},
		forwardedRef,
	) => {
		const { scene } = useThree()
		// One group for the component's lifetime, so the forwarded ref is set from the first render.
		const group = useMemo(() => new THREE.Group(), [])
		const groupRef = useRef<THREE.Group | null>(group)
		const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1.0
		// Reduced motion stops auto-rotation (read live).
		const reducedRef = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
		useEffect(() => {
			const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
			const onChange = () => { reducedRef.current = !!mq?.matches }
			mq?.addEventListener?.('change', onChange)
			return () => mq?.removeEventListener?.('change', onChange)
		}, [])

		// Build a stable options object for the core factory
		const options: WrapTypeMeshOptions = {
			text,
			...(font              !== undefined && { font }),
			...(fontSize          !== undefined && { fontSize }),
			...(letterSpacing     !== undefined && { letterSpacing }),
			...(maxWidth          !== undefined && { maxWidth }),
			...(textAlign         !== undefined && { textAlign }),
			...(color             !== undefined && { color }),
			...(curvatureTracking !== undefined && { curvatureTracking }),
			...(curvatureTrackingFactor !== undefined && { curvatureTrackingFactor }),
		}

		// Serialise options so we can detect changes without deep equality
		const optionsKey = JSON.stringify({ shape, radius: safeRadius, ...options })
		const prevKeyRef = useRef<string>('')
		const initializedRef = useRef(false)

		// Expose the group via forwardRef — only when mounted (null during unmount)
		useImperativeHandle(forwardedRef, () => group, [group])

		// Create the group on mount; add it to the scene imperatively
		useEffect(() => {
			group.position.set(...position)
			group.rotation.set(...rotation)
			group.scale.set(...scale)
			groupRef.current = group
			scene.add(group)

			const { group: built } = createSDFText(shape, options, safeRadius)
			built.children.slice().forEach((child) => {
				built.remove(child)
				group.add(child)
			})
			initializedRef.current = true
			prevKeyRef.current = optionsKey

			return () => {
				// Dispose the troika Text children (GPU resources) and remove the group from the scene.
				group.children.slice().forEach((child) => {
					;(child as unknown as { dispose?: () => void }).dispose?.()
					group.remove(child)
				})
				scene.remove(group)
				initializedRef.current = false
			}
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [scene])

		// Rebuild text when options change (but not on initial mount)
		useEffect(() => {
			const group = groupRef.current
			if (!group || !initializedRef.current) return
			if (optionsKey === prevKeyRef.current) return
			updateSDFText(group, shape, options, safeRadius)
			prevKeyRef.current = optionsKey
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [optionsKey])

		// Sync transform props when they change
		useEffect(() => {
			const group = groupRef.current
			if (!group) return
			group.position.set(...position)
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [position[0], position[1], position[2]])

		useEffect(() => {
			const group = groupRef.current
			if (!group) return
			group.rotation.set(...rotation)
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [rotation[0], rotation[1], rotation[2]])

		useEffect(() => {
			const group = groupRef.current
			if (!group) return
			group.scale.set(...scale)
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [scale[0], scale[1], scale[2]])

		// Auto-rotate animation
		useFrame((_state, delta) => {
			if (!autoRotate || !groupRef.current || reducedRef.current) return
			groupRef.current.rotation.y += autoRotateSpeed * delta
		})

		// This component manages its own scene object — no JSX output needed
		return null
	},
)

WrapTypeMesh.displayName = 'WrapTypeMesh'
