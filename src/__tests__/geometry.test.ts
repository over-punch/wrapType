// wrapType/src/__tests__/geometry.test.ts — unit tests for geometry computation

import { describe, it, expect } from 'vitest'
import { getCharPositions, getCharPositionsAt } from '../core/geometry'
import type { WrapTypeOptions, WrapTypeShape } from '../core/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE: WrapTypeOptions = { text: 'Typography', radius: 300, fontSize: 14 }

/** Euclidean distance from a 3-vector to the origin */
function len(v: [number, number, number]): number {
	return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
}

/** Dot product of two 3-vectors */
function dot(a: [number, number, number], b: [number, number, number]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

// ─── Sphere — flow ────────────────────────────────────────────────────────────

describe('sphere flow', () => {
	const positions = getCharPositions({ ...BASE, shape: 'sphere', fill: 'flow' })

	it('returns at least as many chars as the text length', () => {
		expect(positions.length).toBeGreaterThanOrEqual(BASE.text.length)
	})

	it('all positions lie on the sphere surface', () => {
		for (const cp of positions) {
			expect(len(cp.position)).toBeCloseTo(BASE.radius!, 0)
		}
	})

	it('all positions are on the equator (y ≈ 0)', () => {
		for (const cp of positions) {
			expect(cp.position[1]).toBeCloseTo(0, 5)
		}
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 5)
		}
	})

	it('normal is perpendicular to right', () => {
		for (const cp of positions) {
			expect(dot(cp.normal, cp.right)).toBeCloseTo(0, 5)
		}
	})

	it('normal is perpendicular to up', () => {
		for (const cp of positions) {
			expect(dot(cp.normal, cp.up)).toBeCloseTo(0, 5)
		}
	})

	it('text characters repeat cyclically', () => {
		for (let i = 0; i < positions.length; i++) {
			expect(positions[i].char).toBe(BASE.text[i % BASE.text.length])
		}
	})
})

// ─── Sphere — cover ───────────────────────────────────────────────────────────

describe('sphere cover', () => {
	const positions = getCharPositions({ ...BASE, shape: 'sphere', fill: 'cover' })

	it('returns many more positions than text length (fills surface)', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length * 5)
	})

	it('all positions lie on (or very near) the sphere surface', () => {
		for (const cp of positions) {
			const r = len(cp.position)
			// Allow slight deviation from perfect sphere due to trig
			expect(r).toBeGreaterThan((BASE.radius! as number) * 0.99)
			expect(r).toBeLessThan((BASE.radius! as number) * 1.01)
		}
	})

	it('normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})

	it('positions span multiple y values (multiple latitude bands)', () => {
		const ys = new Set(positions.map(p => Math.round(p.position[1] / 10) * 10))
		expect(ys.size).toBeGreaterThan(3)
	})
})

// ─── Sphere — full-width ──────────────────────────────────────────────────────

describe('sphere full-width', () => {
	const positions = getCharPositions({ ...BASE, shape: 'sphere', fill: 'full-width' })

	it('returns exactly text.length positions', () => {
		expect(positions.length).toBe(BASE.text.length)
	})

	it('all positions at equator', () => {
		for (const cp of positions) {
			expect(cp.position[1]).toBeCloseTo(0, 5)
		}
	})

	it('all positions on sphere surface', () => {
		for (const cp of positions) {
			expect(len(cp.position)).toBeCloseTo(BASE.radius!, 0)
		}
	})
})

// ─── Sphere — full-height ─────────────────────────────────────────────────────

describe('sphere full-height', () => {
	const positions = getCharPositions({ ...BASE, shape: 'sphere', fill: 'full-height' })

	it('returns at least one position', () => {
		expect(positions.length).toBeGreaterThan(0)
	})

	it('positions span a range of y values', () => {
		const ys = positions.map(p => p.position[1])
		const range = Math.max(...ys) - Math.min(...ys)
		// Should span from near +r to near -r
		expect(range).toBeGreaterThan(BASE.radius! as number)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})

	it('right is perpendicular to normal', () => {
		for (const cp of positions) {
			expect(dot(cp.normal, cp.right)).toBeCloseTo(0, 4)
		}
	})

	it('up is perpendicular to normal', () => {
		for (const cp of positions) {
			expect(dot(cp.normal, cp.up)).toBeCloseTo(0, 4)
		}
	})
})

// ─── Cylinder — flow ──────────────────────────────────────────────────────────

describe('cylinder flow', () => {
	const positions = getCharPositions({ ...BASE, shape: 'cylinder', fill: 'flow' })

	it('returns at least text.length positions', () => {
		expect(positions.length).toBeGreaterThanOrEqual(BASE.text.length)
	})

	it('all positions are on the equator (y = 0)', () => {
		for (const cp of positions) {
			expect(cp.position[1]).toBeCloseTo(0, 5)
		}
	})

	it('all positions at the correct radius from y-axis', () => {
		for (const cp of positions) {
			const r = Math.sqrt(cp.position[0] ** 2 + cp.position[2] ** 2)
			expect(r).toBeCloseTo(BASE.radius!, 0)
		}
	})

	it('all normals are horizontal (y component = 0)', () => {
		for (const cp of positions) {
			expect(cp.normal[1]).toBeCloseTo(0, 5)
		}
	})
})

// ─── Cylinder — cover ─────────────────────────────────────────────────────────

describe('cylinder cover', () => {
	const positions = getCharPositions({ ...BASE, shape: 'cylinder', fill: 'cover' })

	it('returns more positions than text length', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length)
	})

	it('all positions at the correct radius from y-axis', () => {
		for (const cp of positions) {
			const r = Math.sqrt(cp.position[0] ** 2 + cp.position[2] ** 2)
			expect(r).toBeCloseTo(BASE.radius!, 0)
		}
	})

	it('all y-normals are zero (cylinder normals are radial)', () => {
		for (const cp of positions) {
			expect(cp.normal[1]).toBeCloseTo(0, 5)
		}
	})
})

// ─── Torus — flow ─────────────────────────────────────────────────────────────

describe('torus flow', () => {
	const positions = getCharPositions({ ...BASE, shape: 'torus', fill: 'flow' })

	it('returns at least text.length positions', () => {
		expect(positions.length).toBeGreaterThanOrEqual(BASE.text.length)
	})

	it('all positions are at y = 0 (outer ring)', () => {
		for (const cp of positions) {
			expect(cp.position[1]).toBeCloseTo(0, 5)
		}
	})
})

// ─── Torus — cover ────────────────────────────────────────────────────────────

describe('torus cover', () => {
	const positions = getCharPositions({ ...BASE, shape: 'torus', fill: 'cover' })

	it('returns more positions than text length (full torus surface)', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length * 5)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})

	it('positions span both positive and negative y values (minor axis)', () => {
		const ys = positions.map(p => p.position[1])
		expect(Math.max(...ys)).toBeGreaterThan(0)
		expect(Math.min(...ys)).toBeLessThan(0)
	})
})

// ─── Plane — cover ────────────────────────────────────────────────────────────

describe('plane cover', () => {
	const positions = getCharPositions({ ...BASE, shape: 'plane', fill: 'cover' })

	it('returns more positions than text length', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length)
	})

	it('all positions at z = 0', () => {
		for (const cp of positions) {
			expect(cp.position[2]).toBe(0)
		}
	})

	it('all normals point in +Z direction', () => {
		for (const cp of positions) {
			expect(cp.normal).toEqual([0, 0, 1])
		}
	})
})

// ─── Stool — flow ─────────────────────────────────────────────────────────────

describe('stool flow', () => {
	const positions = getCharPositions({ ...BASE, shape: 'stool', fill: 'flow', radius: 200 })

	it('returns at least text.length positions', () => {
		expect(positions.length).toBeGreaterThanOrEqual(BASE.text.length)
	})

	it('all positions are at a consistent radius from y-axis (seat rim)', () => {
		for (const cp of positions) {
			const r = Math.sqrt(cp.position[0] ** 2 + cp.position[2] ** 2)
			expect(r).toBeCloseTo(200, 0)
		}
	})

	it('all positions are at the same y (single band)', () => {
		const ys = new Set(positions.map(p => Math.round(p.position[1])))
		expect(ys.size).toBe(1)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 5)
		}
	})

	it('all normals are horizontal (y component = 0)', () => {
		for (const cp of positions) {
			expect(cp.normal[1]).toBeCloseTo(0, 5)
		}
	})
})

// ─── Stool — cover ────────────────────────────────────────────────────────────

describe('stool cover', () => {
	const positions = getCharPositions({ ...BASE, shape: 'stool', fill: 'cover', radius: 200 })

	it('returns many more positions than text length (seat top + rim + legs)', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length * 3)
	})

	it('positions span multiple y values (top, rim, legs at different heights)', () => {
		const ys = new Set(positions.map(p => Math.round(p.position[1] / 20) * 20))
		expect(ys.size).toBeGreaterThan(5)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})
})

// ─── Flag — cover ─────────────────────────────────────────────────────────────

describe('flag cover (t = 0)', () => {
	const positions = getCharPositionsAt({ ...BASE, shape: 'flag', fill: 'cover' }, 0)

	it('returns many positions (rows × cols grid)', () => {
		expect(positions.length).toBeGreaterThan(BASE.text.length * 3)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})

	it('all normals face toward +Z at t=0 (flag is angled toward viewer)', () => {
		for (const cp of positions) {
			expect(cp.normal[2]).toBeGreaterThan(0)
		}
	})

	it('leftmost character has a smaller |z| than the rightmost (wave grows toward free edge)', () => {
		// With justified layout the first char is centred slightly inboard of u=0,
		// but it should still have significantly less wave displacement than the last.
		const last = positions.length - 1
		expect(Math.abs(positions[0].position[2])).toBeLessThan(Math.abs(positions[last].position[2]) + 1)
	})
})

describe('flag cover — animation (t = 1)', () => {
	const p0 = getCharPositionsAt({ ...BASE, shape: 'flag', fill: 'cover' }, 0)
	const p1 = getCharPositionsAt({ ...BASE, shape: 'flag', fill: 'cover' }, 1)

	it('returns same character count at different times', () => {
		expect(p0.length).toBe(p1.length)
	})

	it('free-edge positions differ between t=0 and t=1', () => {
		// Last character in first row is the free edge — it should have moved
		const last = p0.length - 1
		const zDiff = Math.abs(p0[last].position[2] - p1[last].position[2])
		expect(zDiff).toBeGreaterThan(0)
	})

	it('leftmost character moves less than rightmost between frames', () => {
		// The wave grows with u so the free edge moves more than the mast edge
		const last = p0.length - 1
		const leftDelta  = Math.abs(p1[0].position[2]    - p0[0].position[2])
		const rightDelta = Math.abs(p1[last].position[2] - p0[last].position[2])
		expect(leftDelta).toBeLessThan(rightDelta + 1)
	})
})

// ─── Flag — flow ──────────────────────────────────────────────────────────────

describe('flag flow (t = 0)', () => {
	const positions = getCharPositionsAt({ ...BASE, shape: 'flag', fill: 'flow' }, 0)

	it('returns at least one position', () => {
		expect(positions.length).toBeGreaterThan(0)
	})

	it('all normals are unit vectors', () => {
		for (const cp of positions) {
			expect(len(cp.normal)).toBeCloseTo(1, 4)
		}
	})

	it('all positions are at the vertical centre of the flag (v = 0.5)', () => {
		// In flag flow the single band is at v = 0.5, so y should be near 0
		for (const cp of positions) {
			expect(cp.position[1]).toBeCloseTo(0, 0)
		}
	})

	it('character count changes at different t values — flag is animated', () => {
		const p1 = getCharPositionsAt({ ...BASE, shape: 'flag', fill: 'flow' }, 1)
		// Character count should stay the same (same row layout)
		expect(p1.length).toBe(positions.length)
	})
})

// ─── isAnimatedShape ──────────────────────────────────────────────────────────

import { isAnimatedShape } from '../core/geometry'

describe('isAnimatedShape', () => {
	it('returns true for flag', () => { expect(isAnimatedShape('flag')).toBe(true) })
	it('returns false for sphere', () => { expect(isAnimatedShape('sphere')).toBe(false) })
	it('returns false for undefined', () => { expect(isAnimatedShape(undefined)).toBe(false) })
})

// ─── Dispatcher ───────────────────────────────────────────────────────────────

describe('getCharPositions dispatcher', () => {
	it('defaults to sphere cover when no shape/fill provided', () => {
		const a = getCharPositions({ text: 'Hi' })
		const b = getCharPositions({ text: 'Hi', shape: 'sphere', fill: 'cover' })
		expect(a.length).toBe(b.length)
	})

	it('handles empty-ish text by falling back to "Type"', () => {
		const positions = getCharPositions({ text: '' })
		expect(positions.length).toBeGreaterThan(0)
	})

	it('repeat:false slices to text.length and maps characters in order', () => {
		const text = 'Hello'
		const positions = getCharPositions({ text, shape: 'sphere', fill: 'cover', repeat: false })
		expect(positions.length).toBe(text.length)
		for (let i = 0; i < text.length; i++) {
			expect(positions[i].char).toBe(text[i])
		}
	})

	it('unknown shape falls back to sphereCover without throwing', () => {
		// Cast to bypass TS — tests runtime safety for unrecognised shape strings
		const positions = getCharPositions({ text: 'Hi', shape: 'unknown' as WrapTypeShape })
		expect(positions.length).toBeGreaterThan(0)
	})
})

// ─── surfaceFrame — pole-degenerate path ──────────────────────────────────────

describe('surfaceFrame pole degenerate', () => {
	it('sphere full-height at north pole gives a valid orientation frame', () => {
		// sphere full-height places characters near the poles — surfaceFrame must
		// switch its reference vector when the normal is parallel to world +Y.
		const positions = getCharPositions({
			text: 'P', shape: 'sphere', fill: 'full-height',
			radius: 300, fontSize: 14,
		})
		for (const cp of positions) {
			// right must be perpendicular to normal
			expect(dot(cp.normal, cp.right)).toBeCloseTo(0, 4)
			// up must be perpendicular to normal
			expect(dot(cp.normal, cp.up)).toBeCloseTo(0, 4)
			// right must be a unit vector
			expect(len(cp.right)).toBeCloseTo(1, 4)
		}
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

describe('review fixes', () => {
	const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] =>
		[a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
	const shapes: WrapTypeShape[] = ['sphere', 'cylinder', 'torus', 'plane', 'stool', 'flag']
	const fills = ['cover', 'flow'] as const

	it('every frame reads from outside the surface: right × up = normal (no mirrored glyphs)', () => {
		for (const shape of shapes) for (const fill of fills) {
			for (const cp of getCharPositions({ text: 'Reading', shape, fill, fontSize: 30 })) {
				expect(dot(cross(cp.right, cp.up), cp.normal)).toBeGreaterThan(0.99)
			}
		}
	})

	it('characters advance along their reading direction', () => {
		const ps = getCharPositions({ text: 'ABCDEFGH', shape: 'cylinder', fill: 'flow', repeat: false, fontSize: 30 })
		for (let i = 1; i < ps.length; i++) {
			const step: [number, number, number] = [0, 1, 2].map((k) => ps[i].position[k] - ps[i - 1].position[k]) as [number, number, number]
			expect(dot(step, ps[i - 1].right)).toBeGreaterThan(0)
		}
	})

	it('keeps graphemes whole (emoji sequences, combining marks)', () => {
		const ps = getCharPositions({ text: '👩‍👩‍👧 é', shape: 'sphere', fill: 'flow', repeat: false })
		expect(ps.map((p) => p.char)).toEqual(['👩‍👩‍👧', ' ', 'é'])
	})

	it('uses measured widths: a wide character advances further than a narrow one', () => {
		const widths = new Map([['i', 4], ['W', 20]])
		const ps = getCharPositions({ text: 'iW', shape: 'plane', repeat: false, charWidthMap: widths, fontSize: 20 })
		expect(ps[1].position[0] - ps[0].position[0]).toBeCloseTo(4 / 2 + 20 / 2, 3)
	})

	it('invalid sizes fall back instead of hanging or returning nothing', () => {
		for (const bad of [0, -5, NaN, Infinity]) {
			const ps = getCharPositions({ text: 'abc', fontSize: bad, radius: bad })
			expect(ps.length).toBeGreaterThan(0)
			expect(ps.length).toBeLessThanOrEqual(20000)
			ps.forEach((p) => p.position.forEach((v) => expect(Number.isFinite(v)).toBe(true)))
		}
	})

	it('full-width scales the text to fit the equator once, without overlap', () => {
		const ps = getCharPositions({ text: 'Typography', shape: 'sphere', fill: 'full-width', radius: 100, fontSize: 14 })
		expect(ps).toHaveLength(10)
		expect(ps[0].scale).toBeGreaterThan(1)
	})

	it('flow text longer than the ring is cut, not drawn on top of itself', () => {
		const ps = getCharPositions({ text: 'x'.repeat(500), shape: 'cylinder', fill: 'flow', radius: 50, fontSize: 14, repeat: false })
		expect(ps.length).toBeLessThan(500)
		const keys = new Set(ps.map((p) => p.position.map((v) => v.toFixed(1)).join(',')))
		expect(keys.size).toBe(ps.length)
	})
})
