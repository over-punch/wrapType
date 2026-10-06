// wrapType/src/core/sdf.ts — troika-three-text SDF surface text factory (GPU-rendered, R3F)

import { Text } from 'troika-three-text'
import * as THREE from 'three'
import type { WrapTypeShape } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for the SDF surface text renderer */
export interface WrapTypeMeshOptions {
	/** Text content. Words are distributed across the surface. */
	text: string
	/** troika font URL (WOFF/TTF). Default: troika built-in font */
	font?: string
	/** Font size in Three.js units. Default: 0.1 */
	fontSize?: number
	/** Base letter spacing in Three.js units. Default: 0 */
	letterSpacing?: number
	/** Max text width before wrapping (Three.js units). Default: Infinity */
	maxWidth?: number
	/** Text alignment. Default: 'center' */
	textAlign?: 'left' | 'center' | 'right'
	/** CSS/hex colour string or number. Default: '#ffffff' */
	color?: string | number
	/**
	 * Automatically widen letter spacing on tighter curves to compensate for
	 * apparent crowding. Default: true
	 */
	curvatureTracking?: boolean
	/**
	 * Adjustment factor per unit of curvature (1/radius).
	 * Range: 0 = no effect, ~0.01 = strong. Default: 0.002
	 */
	curvatureTrackingFactor?: number
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: Required<WrapTypeMeshOptions> = {
	text: '',
	font: '',
	fontSize: 0.1,
	letterSpacing: 0,
	maxWidth: Infinity,
	textAlign: 'center',
	color: '#ffffff',
	curvatureTracking: true,
	curvatureTrackingFactor: 0.002,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve options against defaults */
function resolve(opts: WrapTypeMeshOptions): Required<WrapTypeMeshOptions> {
	return { ...DEFAULTS, ...opts }
}

/**
 * Tighter curves produce apparent crowding; widen tracking to compensate.
 * Returns the original letterSpacing when curvatureTracking is off or radius = 0.
 */
function adjustedTracking(
	base: number,
	radius: number,
	factor: number,
): number {
	if (radius <= 0) return base
	return base + (1 / radius) * factor
}

/** Create a troika Text instance with common properties set */
function makeText(
	text: string,
	opts: Required<WrapTypeMeshOptions>,
	letterSpacingOverride?: number,
): Text {
	const t = new Text()
	t.text = text
	t.fontSize = opts.fontSize
	t.letterSpacing = letterSpacingOverride ?? opts.letterSpacing
	t.textAlign = opts.textAlign
	t.color = opts.color
	if (opts.font) t.font = opts.font
	if (opts.maxWidth < Infinity) t.maxWidth = opts.maxWidth
	t.anchorX = 'center'
	t.anchorY = 'middle'
	t.sync()
	return t
}

// ─── Shape builders ───────────────────────────────────────────────────────────

/**
 * Distribute words evenly around the equator of a sphere or cylinder.
 * Each word gets its own Text instance with curveRadius = radius, so troika
 * renders the glyph mesh curved to match the surface.
 */
function buildRadialGroup(
	words: string[],
	radius: number,
	opts: Required<WrapTypeMeshOptions>,
): THREE.Group {
	const group = new THREE.Group()
	const ls = opts.curvatureTracking
		? adjustedTracking(opts.letterSpacing, radius, opts.curvatureTrackingFactor)
		: opts.letterSpacing

	if (words.length === 1) {
		const t = makeText(words[0], opts, ls)
		t.curveRadius = radius
		t.position.set(0, 0, radius)
		group.add(t)
		return group
	}

	const step = (Math.PI * 2) / words.length
	words.forEach((word, i) => {
		const angle = i * step
		const t = makeText(word, opts, ls)
		t.curveRadius = radius
		t.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
		t.rotation.y = angle
		group.add(t)
	})
	return group
}

/** Flat plane — single Text at origin, no curvature */
function buildPlaneGroup(text: string, opts: Required<WrapTypeMeshOptions>): THREE.Group {
	const group = new THREE.Group()
	group.add(makeText(text, opts))
	return group
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a Three.js Group containing troika Text objects arranged on the
 * surface of the given shape. The group should be added to your scene.
 *
 * Returns the group and a `dispose()` function that frees all GPU resources.
 *
 * @param shape   - Built-in shape: 'sphere' | 'cylinder' | 'torus' | 'plane'
 * @param options - Text content and visual options
 * @param radius  - Shape radius in Three.js units. Default: 1.0
 */
export function createSDFText(
	shape: WrapTypeShape,
	options: WrapTypeMeshOptions,
	radius = 1.0,
): { group: THREE.Group; dispose: () => void } {
	const opts = resolve(options)
	if (!(Number.isFinite(radius) && radius > 0)) radius = 1.0
	const words = opts.text.trim().split(/\s+/).filter(Boolean)
	const display = opts.text.trim()

	let group: THREE.Group
	switch (shape) {
		case 'sphere':
		case 'cylinder':
		case 'torus':
			group = buildRadialGroup(words.length > 0 ? words : [''], radius, opts)
			break
		case 'plane':
		default:
			group = buildPlaneGroup(display || '', opts)
			break
	}

	function dispose(): void {
		group.traverse((obj) => {
			if (obj instanceof Text) obj.dispose()
		})
	}

	return { group, dispose }
}

/**
 * Update an existing SDF group in-place — disposes old Text children, rebuilds.
 * The group identity stays the same so scene references remain valid.
 *
 * @param group   - Existing group returned by createSDFText
 * @param shape   - New shape
 * @param options - New options
 * @param radius  - New radius. Default: 1.0
 */
export function updateSDFText(
	group: THREE.Group,
	shape: WrapTypeShape,
	options: WrapTypeMeshOptions,
	radius = 1.0,
): void {
	// Dispose all existing troika Text children and remove them from the group
	const toDispose: Text[] = []
	group.traverse((obj) => {
		if (obj instanceof Text) toDispose.push(obj)
	})
	toDispose.forEach((t) => {
		t.dispose()
		group.remove(t)
	})

	// Rebuild and reparent children into existing group
	const { group: next } = createSDFText(shape, options, radius)
	next.children.slice().forEach((child) => {
		next.remove(child)
		group.add(child)
	})
}
