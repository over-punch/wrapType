// wrapType/src/core/geometry.ts — character position computation for each shape and fill mode.
// Characters advance by their measured widths (charWidthMap) and every frame reads correctly from outside
// the surface: right × up = normal, with characters advancing along right.

import type { WrapTypeOptions, CharPosition, WrapTypeShape } from './types'

type Vec3 = [number, number, number]

// ─── Limits and validation ────────────────────────────────────────────────────

/** Most character positions computed for one layout (a DOM node each); more are left out with a warning. */
export const MAX_POSITIONS = 20000

/** Warnings already printed. */
const warned = new Set<string>()

/** Prints a console warning the first time it is seen. */
function warnOnce(message: string): void {
	if (warned.has(message)) return
	warned.add(message)
	console.warn(message)
}

/** A finite number within [min, max]; the fallback (with a warning) when the value is not a finite number. */
function sizeOption(value: unknown, fallback: number, min: number, max: number, name: string): number {
	if (value === undefined) return fallback
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		warnOnce(`[wrapType] ${name} must be a finite number; got ${String(value)}, using ${fallback}`)
		return fallback
	}
	if (value <= 0 && min > 0) {
		warnOnce(`[wrapType] ${name} must be greater than 0; got ${value}, using ${fallback}`)
		return fallback
	}
	if (value < min || value > max) {
		warnOnce(`[wrapType] ${name} must be between ${min} and ${max}; got ${value}`)
		return Math.min(max, Math.max(min, value))
	}
	return value
}

/** Options with every size validated, so no layout can loop forever or produce NaN. */
interface Layout {
	chars: string[]
	r: number
	h: number | undefined
	fs: number
	advRatio: number
	lineRatio: number
	widths: Map<string, number> | undefined
	repeat: boolean
}

/** Grapheme segmenter: emoji sequences and combining marks stay in one slot. */
const graphemeSegmenter: { segment: (t: string) => Iterable<{ segment: string }> } | null =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new (Intl as unknown as { Segmenter: new (l: undefined, o: { granularity: 'grapheme' }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' })
		: null

/** Split text into graphemes (code points when Intl.Segmenter is unavailable). */
export function splitGraphemes(text: string): string[] {
	return graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), (s) => s.segment) : Array.from(text)
}

/** Validate options into a layout. */
function layoutFor(opts: WrapTypeOptions, defaultRadius = 300): Layout {
	if (!opts.text) warnOnce('[wrapType] opts.text is empty — falling back to "Type".')
	const chars = splitGraphemes(opts.text || 'Type')
	const r = sizeOption(opts.radius, defaultRadius, 1, 10000, 'radius')
	return {
		chars,
		r,
		h: opts.height === undefined ? undefined : sizeOption(opts.height, r * 2, 1, 20000, 'height'),
		fs: sizeOption(opts.fontSize, 14, 1, 1000, 'fontSize'),
		advRatio: sizeOption(opts.charAdvanceRatio, 0.62, 0.05, 10, 'charAdvanceRatio'),
		lineRatio: sizeOption(opts.lineHeightRatio, 1.4, 0.2, 10, 'lineHeightRatio'),
		widths: opts.charWidthMap,
		repeat: opts.repeat !== false,
	}
}

/** The advance width of a character: measured when available, else fontSize × charAdvanceRatio. */
function advance(L: Layout, char: string): number {
	const w = L.widths?.get(char)
	return w !== undefined && Number.isFinite(w) && w > 0 ? w : L.fs * L.advRatio
}

// ─── Vector helpers ───────────────────────────────────────────────────────────

/** Normalise a 3-vector */
function norm(v: Vec3): Vec3 {
	const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
	if (len === 0) return [0, 1, 0]
	return [v[0] / len, v[1] / len, v[2] / len]
}

/** Cross product of two 3-vectors */
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Dot product of two 3-vectors */
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** A reading frame for an outward normal, with up as close to world +Y as possible: right × up = normal. */
function surfaceFrame(normal: Vec3): { right: Vec3; up: Vec3 } {
	const worldUp: Vec3 = Math.abs(dot(normal, [0, 1, 0])) > 0.99 ? [0, 0, -1] : [0, 1, 0]
	const right = norm(cross(worldUp, normal))
	const up = norm(cross(normal, right))
	return { right, up }
}

// ─── Runs of text ─────────────────────────────────────────────────────────────

/**
 * Lay characters along a run of the given length, by their advance widths. Returns each character with the
 * offset of its centre from the start of the run (0…length) and its scale (1 unless fit is 'scale').
 *
 * - closed runs (rings) are justified so the text meets itself without a seam or overlap;
 * - with repeat (default), the text cycles to fill the run; without, each character appears once, and what
 *   doesn't fit is left out (with a warning).
 */
function run(
	L: Layout, startIdx: number, length: number,
	opt: { closed: boolean; justify: boolean; scaleToFit?: boolean },
): { chars: string[]; offsets: number[]; scale: number; nextIdx: number } {
	const chars: string[] = []
	const widths: number[] = []
	let used = 0
	let i = startIdx
	if (opt.scaleToFit) {
		// The whole text, once, scaled to fill the run exactly.
		for (const c of L.chars) { chars.push(c); widths.push(advance(L, c)); used += advance(L, c) }
		const scale = used > 0 ? length / used : 1
		let x = 0
		const offsets = widths.map((w) => { const o = (x + w / 2) * scale; x += w; return o })
		return { chars, offsets, scale, nextIdx: L.chars.length }
	}
	while (chars.length < MAX_POSITIONS) {
		if (!L.repeat && i >= L.chars.length) break
		const c = L.chars[i % L.chars.length]
		const w = advance(L, c)
		if (chars.length > 0 && used + w > length) break
		if (chars.length === 0 && w > length) break
		chars.push(c)
		widths.push(w)
		used += w
		i++
	}
	if (!L.repeat && i < L.chars.length && startIdx === 0) {
		warnOnce(`[wrapType] the text is longer than the surface; ${L.chars.length - i} characters were left out`)
	}
	const slots = opt.closed ? chars.length : chars.length - 1
	const gap = opt.justify && L.repeat && slots > 0 ? Math.max(0, length - used) / slots : 0
	let x = 0
	const offsets = widths.map((w) => { const o = x + w / 2; x += w + gap; return o })
	return { chars, offsets, scale: 1, nextIdx: i }
}

// ─── Rings (sphere latitudes, cylinder rows, torus, stool) ────────────────────

/**
 * Characters around a horizontal ring of radius ringR at height y, reading left to right from outside.
 * Characters advance clockwise seen from above (decreasing angle), so they read correctly.
 */
function ring(
	L: Layout, startIdx: number, centre: Vec3, ringR: number, y: number,
	normalAt: (theta: number) => Vec3, closed = true, justify = true, scaleToFit = false,
): { positions: CharPosition[]; nextIdx: number } {
	const circ = 2 * Math.PI * ringR
	const { chars, offsets, scale, nextIdx } = run(L, startIdx, circ, { closed, justify, scaleToFit })
	const positions = chars.map((char, k) => {
		const theta = -offsets[k] / ringR
		const position: Vec3 = [centre[0] + ringR * Math.cos(theta), y, centre[2] + ringR * Math.sin(theta)]
		const normal = normalAt(theta)
		// Reading direction: the clockwise tangent; up completes a right-handed frame (right × up = normal).
		const right: Vec3 = [Math.sin(theta), 0, -Math.cos(theta)]
		const up = norm(cross(normal, right))
		const cp: CharPosition = { char, position, normal, right, up }
		if (scale !== 1) cp.scale = scale
		return cp
	})
	return { positions, nextIdx }
}

/** Radial horizontal normal. */
const radial = (theta: number): Vec3 => [Math.cos(theta), 0, Math.sin(theta)]

// ─── Sphere ───────────────────────────────────────────────────────────────────

/** Characters around the sphere's equator (flow mode). */
function sphereFlow(L: Layout): CharPosition[] {
	return ring(L, 0, [0, 0, 0], L.r, 0, radial, true, true).positions
}

/** Latitude bands over the sphere (cover mode); the text continues from band to band. */
function sphereCover(L: Layout): CharPosition[] {
	const lineH = L.fs * L.lineRatio
	const phiMin = Math.PI * 0.12
	const phiMax = Math.PI * 0.88
	const bands = Math.max(1, Math.floor((phiMax - phiMin) * L.r / lineH))
	const positions: CharPosition[] = []
	let idx = 0
	for (let b = 0; b <= bands && positions.length < MAX_POSITIONS; b++) {
		const phi = phiMin + (b / bands) * (phiMax - phiMin)
		const y = L.r * Math.cos(phi)
		const ringR = L.r * Math.sin(phi)
		const band = ring(L, idx, [0, 0, 0], ringR, y, (theta) => norm([ringR * Math.cos(theta), y, ringR * Math.sin(theta)]))
		positions.push(...band.positions)
		idx = band.nextIdx
		if (!L.repeat && idx >= L.chars.length) break
	}
	return positions
}

/** The text once around the equator, scaled to fit it exactly (full-width mode). */
function sphereFullWidth(L: Layout): CharPosition[] {
	return ring(L, 0, [0, 0, 0], L.r, 0, radial, true, false, true).positions
}

/** One character per line down a meridian, top to bottom (full-height mode). */
function sphereFullHeight(L: Layout): CharPosition[] {
	const lineH = L.fs * L.lineRatio
	const phiMin = Math.PI * 0.05
	const phiMax = Math.PI * 0.95
	const total = Math.min(MAX_POSITIONS, Math.ceil((phiMax - phiMin) * L.r / lineH), L.repeat ? Infinity : L.chars.length)
	const positions: CharPosition[] = []
	for (let i = 0; i < total; i++) {
		const phi = phiMin + (i / total) * (phiMax - phiMin)
		const position: Vec3 = [0, L.r * Math.cos(phi), L.r * Math.sin(phi)]
		const normal = norm(position)
		positions.push({ char: L.chars[i % L.chars.length], position, normal, ...surfaceFrame(normal) })
	}
	return positions
}

// ─── Cylinder ─────────────────────────────────────────────────────────────────

/** Characters around the cylinder in a single band (flow). */
function cylinderFlow(L: Layout): CharPosition[] {
	return ring(L, 0, [0, 0, 0], L.r, 0, radial).positions
}

/** Rows over the full cylinder (cover), top to bottom. */
function cylinderCover(L: Layout): CharPosition[] {
	const h = L.h ?? L.r * 2
	const lineH = L.fs * L.lineRatio
	const rows = Math.max(1, Math.ceil(h / lineH))
	const positions: CharPosition[] = []
	let idx = 0
	for (let row = 0; row < rows && positions.length < MAX_POSITIONS; row++) {
		const y = h / 2 - (row + 0.5) * lineH
		const r = ring(L, idx, [0, 0, 0], L.r, y, radial)
		positions.push(...r.positions)
		idx = r.nextIdx
		if (!L.repeat && idx >= L.chars.length) break
	}
	return positions
}

// ─── Torus ────────────────────────────────────────────────────────────────────

/** Characters around the torus's outer ring (flow). */
function torusFlow(L: Layout): CharPosition[] {
	const tube = L.r * 0.3
	return ring(L, 0, [0, 0, 0], L.r + tube, 0, radial).positions
}

/** Rings over the whole torus surface (cover): one ring of text per tube angle. */
function torusCover(L: Layout): CharPosition[] {
	const R = L.r
	const tube = L.r * 0.3
	const lineH = L.fs * L.lineRatio
	const rows = Math.max(1, Math.ceil(2 * Math.PI * tube / lineH))
	const positions: CharPosition[] = []
	let idx = 0
	for (let row = 0; row < rows && positions.length < MAX_POSITIONS; row++) {
		// From the top of the tube, outward and down, under and back in.
		const a = Math.PI / 2 - (row / rows) * 2 * Math.PI
		const ringR = R + tube * Math.cos(a)
		const y = tube * Math.sin(a)
		const r = ring(L, idx, [0, 0, 0], ringR, y, (theta) => norm([Math.cos(a) * Math.cos(theta), Math.sin(a), Math.cos(a) * Math.sin(theta)]))
		positions.push(...r.positions)
		idx = r.nextIdx
		if (!L.repeat && idx >= L.chars.length) break
	}
	return positions
}

// ─── Plane ────────────────────────────────────────────────────────────────────

/** Rows across a flat square facing the camera (+Z), top to bottom. */
function planeCover(L: Layout): CharPosition[] {
	const size = L.r * 2
	const lineH = L.fs * L.lineRatio
	const rows = Math.max(1, Math.floor(size / lineH))
	const positions: CharPosition[] = []
	let idx = 0
	for (let row = 0; row < rows && positions.length < MAX_POSITIONS; row++) {
		const y = size / 2 - (row + 0.5) * lineH
		const { chars, offsets, nextIdx } = run(L, idx, size, { closed: false, justify: true })
		idx = nextIdx
		chars.forEach((char, k) => {
			positions.push({ char, position: [-size / 2 + offsets[k], y, 0], normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] })
		})
		if (!L.repeat && idx >= L.chars.length) break
	}
	return positions
}

// ─── Stool ────────────────────────────────────────────────────────────────────

/** A single band around the stool's seat rim (flow). */
function stoolFlow(L: Layout): CharPosition[] {
	return ring(L, 0, [0, 0, 0], L.r, L.r * 0.55, radial).positions
}

/** Seat top (read from above), seat rim, and four legs (cover). */
function stoolCover(L: Layout): CharPosition[] {
	const r = L.r
	const seatY = r * 0.55
	const seatThick = r * 0.08
	const legRadius = Math.max(8, r * 0.07)
	const legOffset = r * 0.58
	const legBottom = -r * 1.2
	const legHeight = seatY - legBottom
	const lineH = L.fs * L.lineRatio
	const positions: CharPosition[] = []
	let idx = 0

	// Seat top: rows across the disk, read from above (front edge toward +Z).
	const rows = Math.floor((r * 2) / lineH)
	for (let row = 0; row < rows && positions.length < MAX_POSITIONS; row++) {
		const z = -r + (row + 0.5) * lineH
		const half = Math.sqrt(Math.max(0, r * r - z * z))
		if (half < L.fs) continue
		const { chars, offsets, nextIdx } = run(L, idx, half * 2, { closed: false, justify: true })
		idx = nextIdx
		chars.forEach((char, k) => {
			positions.push({ char, position: [-half + offsets[k], seatY, z], normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] })
		})
	}

	// Seat rim.
	const rimRows = Math.max(1, Math.ceil(seatThick / lineH))
	for (let row = 0; row < rimRows; row++) {
		const band = ring(L, idx, [0, 0, 0], r, seatY - seatThick + (row + 0.5) * lineH, radial)
		positions.push(...band.positions)
		idx = band.nextIdx
	}

	// Four legs.
	const legRows = Math.ceil(legHeight / lineH)
	for (const [lx, lz] of [[legOffset, legOffset], [-legOffset, legOffset], [legOffset, -legOffset], [-legOffset, -legOffset]]) {
		for (let row = 0; row < legRows && positions.length < MAX_POSITIONS; row++) {
			const band = ring(L, idx, [lx, 0, lz], legRadius, seatY - (row + 0.5) * lineH, radial)
			positions.push(...band.positions)
			idx = band.nextIdx
		}
	}
	return L.repeat ? positions : positions.slice(0, L.chars.length)
}

// ─── Flag ─────────────────────────────────────────────────────────────────────

/** Flag wave parameters for a layout. */
function flagParams(L: Layout) {
	return { W: L.r * 1.5, H: L.r, amp: L.r * 0.12, omega: 1.5, speed: 2.5 }
}

/**
 * One world-space point on the waving flag surface.
 * u ∈ [0,1]: 0 = mast (fixed), 1 = free edge; v ∈ [0,1]: 0 = bottom, 1 = top.
 */
function flagPoint(u: number, v: number, t: number, p: ReturnType<typeof flagParams>): Vec3 {
	const phase = u * p.omega * 2 * Math.PI - t * p.speed
	return [(u - 0.5) * p.W, (v - 0.5) * p.H, p.amp * Math.sin(phase) * u]
}

/** A character on the flag at (u, v, t), with its frame from the surface's tangent. */
function flagCharAt(char: string, u: number, v: number, t: number, p: ReturnType<typeof flagParams>): CharPosition {
	const EPS = 1e-4
	const pt = flagPoint(u, v, t, p)
	const other = flagPoint(u <= 1 - EPS ? u + EPS : u - EPS, v, t, p)
	const tangent: Vec3 = u <= 1 - EPS
		? [other[0] - pt[0], other[1] - pt[1], other[2] - pt[2]]
		: [pt[0] - other[0], pt[1] - other[1], pt[2] - other[2]]
	const right = norm(tangent)
	const up: Vec3 = [0, 1, 0]
	let normal = norm(cross(right, up))
	if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]]
	return { char, position: pt, normal, right, up }
}

/** Rows across the whole flag (cover), justified, top to bottom. */
function flagCover(L: Layout, t: number): CharPosition[] {
	const p = flagParams(L)
	const lineH = L.fs * L.lineRatio
	const rows = Math.max(1, Math.floor(p.H / lineH))
	const positions: CharPosition[] = []
	let idx = 0
	for (let row = 0; row < rows && positions.length < MAX_POSITIONS; row++) {
		const v = rows > 1 ? 1 - row / (rows - 1) : 0.5
		const { chars, offsets, nextIdx } = run(L, idx, p.W, { closed: false, justify: true })
		idx = nextIdx
		chars.forEach((char, k) => positions.push(flagCharAt(char, offsets[k] / p.W, v, t, p)))
		if (!L.repeat && idx >= L.chars.length) break
	}
	return positions
}

/** One justified row along the middle of the flag (flow). */
function flagFlow(L: Layout, t: number): CharPosition[] {
	const p = flagParams(L)
	const { chars, offsets } = run(L, 0, p.W, { closed: false, justify: true })
	return chars.map((char, k) => flagCharAt(char, offsets[k] / p.W, 0.5, t, p))
}

// ─── Animation helpers ────────────────────────────────────────────────────────

/** Returns true for shapes whose character positions change over time. */
export function isAnimatedShape(shape: WrapTypeShape | undefined): boolean {
	return shape === 'flag'
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

/**
 * Compute the list of character positions and orientations for the given shape + fill at animation time
 * `t` (seconds). Characters advance by their measured widths when `charWidthMap` is given (createWrapScene
 * and the React components measure them for you), else by fontSize × charAdvanceRatio. Each frame reads
 * correctly from outside the surface. With `repeat: false` each character appears once.
 */
export function getCharPositionsAt(opts: WrapTypeOptions, t: number): CharPosition[] {
	const shape = opts.shape ?? 'sphere'
	const fill = opts.fill ?? 'cover'
	const L = layoutFor(opts, shape === 'stool' ? 200 : 300)
	const time = Number.isFinite(t) ? t : 0

	if (fill === 'pattern') warnOnce('[wrapType] fill:"pattern" is not yet implemented — falling back to "cover".')
	if (opts.mode === 'silhouette') warnOnce('[wrapType] mode:"silhouette" is not yet implemented — falling back to "surface".')
	if ((fill === 'full-width' || fill === 'full-height') && shape !== 'sphere') {
		warnOnce(`[wrapType] fill:"${fill}" is only available on the sphere — using "cover" on ${shape}.`)
	}

	let positions: CharPosition[]
	if (shape === 'sphere') {
		if (fill === 'flow') positions = sphereFlow(L)
		else if (fill === 'full-width') positions = sphereFullWidth(L)
		else if (fill === 'full-height') positions = sphereFullHeight(L)
		else positions = sphereCover(L)
	} else if (shape === 'cylinder') {
		positions = fill === 'flow' ? cylinderFlow(L) : cylinderCover(L)
	} else if (shape === 'torus') {
		positions = fill === 'flow' ? torusFlow(L) : torusCover(L)
	} else if (shape === 'plane') {
		positions = planeCover(L)
	} else if (shape === 'stool') {
		positions = fill === 'flow' ? stoolFlow(L) : stoolCover(L)
	} else if (shape === 'flag') {
		positions = fill === 'flow' ? flagFlow(L, time) : flagCover(L, time)
	} else {
		positions = sphereCover(L)
	}

	if (positions.length >= MAX_POSITIONS) {
		warnOnce(`[wrapType] the layout needs more than ${MAX_POSITIONS} characters; the rest were left out (use a larger fontSize or a smaller radius)`)
		positions = positions.slice(0, MAX_POSITIONS)
	}
	return positions
}

/** Static alias — equivalent to getCharPositionsAt(opts, 0). */
export function getCharPositions(opts: WrapTypeOptions): CharPosition[] {
	return getCharPositionsAt(opts, 0)
}
