// wrapType/src/react/useWrapType.ts — React hook for mounting a wrapType scene into a ref
'use client'

import { useEffect, useRef } from 'react'
import { createWrapScene } from '../core/scene'
import type { SceneHandle } from '../core/scene'
import type { WrapTypeOptions, CharPosition } from '../core/types'

/** Return value of useWrapType */
export interface WrapTypeHandle {
	/** Attach this ref to the container div */
	ref: React.RefObject<HTMLDivElement | null>
}

/**
 * A key that changes when any option (or the custom positions' content) changes. Maps (charWidthMap) are
 * included by their entries; positions by their count and first and last entries, so an inline array
 * with the same content doesn't rebuild the scene on every render.
 */
export function wrapTypeKey(opts: WrapTypeOptions, positions?: CharPosition[] | null): string {
	const { charWidthMap, ...rest } = opts
	const posKey = positions
		? `${positions.length}|${JSON.stringify(positions[0] ?? null)}|${JSON.stringify(positions[positions.length - 1] ?? null)}`
		: ''
	return JSON.stringify(rest) + (charWidthMap ? JSON.stringify([...charWidthMap]) : '') + posKey
}

/**
 * Mount a wrapType scene into the element `ref`, rebuild it when any option or the custom positions change,
 * re-measure once fonts load (only if they hadn't yet), and destroy it on unmount.
 *
 * @param positions - Optional pre-computed positions (e.g. from getCharPositionsFromMesh); by default the
 *                    scene lays the text out with measured character widths.
 */
export function useWrapScene(
	ref: React.RefObject<HTMLElement | null>,
	opts: WrapTypeOptions,
	positions?: CharPosition[] | null,
): void {
	const handleRef = useRef<SceneHandle | null>(null)
	const optsRef = useRef(opts)
	optsRef.current = opts
	const positionsRef = useRef(positions)
	positionsRef.current = positions
	const key = wrapTypeKey(opts, positions)

	useEffect(() => {
		const container = ref.current
		if (!container || typeof window === 'undefined') return
		const mount = () => {
			handleRef.current?.destroy()
			handleRef.current = createWrapScene(container, positionsRef.current ?? null, optsRef.current)
		}
		mount()
		// Fonts that were still loading give fallback widths: re-lay the text out once they load.
		let cancelled = false
		if (document.fonts && document.fonts.status !== 'loaded') {
			document.fonts.ready.then(() => { if (!cancelled) mount() }).catch(() => {})
		}
		return () => {
			cancelled = true
			handleRef.current?.destroy()
			handleRef.current = null
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key])
}

/**
 * Low-level hook that mounts a CSS3DRenderer scene into a div ref.
 * Use when you need direct control over the container element.
 *
 * @example
 * const { ref } = useWrapType({ text: 'Typography', shape: 'sphere', fill: 'cover', autoRotate: true })
 * return <div ref={ref} style={{ width: '100%', height: '500px' }} />
 */
export function useWrapType(opts: WrapTypeOptions): WrapTypeHandle {
	const ref = useRef<HTMLDivElement>(null)
	useWrapScene(ref, opts)
	return { ref }
}
