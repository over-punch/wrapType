// wrapType/src/core/scene.ts — CSS3DRenderer scene lifecycle: create, resize, destroy

import {
	Scene,
	PerspectiveCamera,
	Matrix4,
} from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { WrapTypeOptions, CharPosition } from './types'
import { isAnimatedShape, getCharPositionsAt, splitGraphemes } from './geometry'

// ─── Font measurement ─────────────────────────────────────────────────────────

/**
 * Resolve a CSS font-family value to one the Canvas 2D API can parse.
 * Canvas `ctx.font` silently rejects CSS custom properties (e.g. the
 * `var(--font-inter)` handle that next/font emits), leaving the context at its
 * 10px sans-serif default — which yields tiny advance widths and collapses
 * justified layouts. We resolve the family through a hidden DOM probe (in the
 * scene's own cascade, so scoped vars resolve correctly) so canvas gets the
 * concrete family names. Plain family strings are returned untouched.
 * @param fontFamily - the family value as passed by the caller
 * @param contextEl - element whose cascade defines any custom properties
 */
function resolveFontFamily(fontFamily: string, contextEl?: HTMLElement): string {
	if (typeof document === 'undefined' || !fontFamily.includes('var(')) return fontFamily

	const probe = document.createElement('span')
	probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
	probe.style.fontFamily = fontFamily
	const host = contextEl ?? document.body
	host.appendChild(probe)
	const resolved = getComputedStyle(probe).fontFamily
	host.removeChild(probe)
	return resolved || fontFamily
}

/**
 * Measure the advance width of each unique character (grapheme) in `text` with the Canvas 2D API, for
 * proportional spacing in getCharPositions (pass the result as `charWidthMap`). Returns an empty map when
 * canvas is unavailable (SSR).
 * @param contextEl - element used to resolve CSS custom properties in `fontFamily`
 */
export function measureCharWidths(
	text: string,
	fontSize: number,
	fontFamily: string,
	fontWeight: string | number,
	contextEl?: HTMLElement,
): Map<string, number> {
	const map = new Map<string, number>()
	if (typeof document === 'undefined') return map

	const canvas  = document.createElement('canvas')
	const ctx     = canvas.getContext?.('2d')
	if (!ctx) return map

	const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 14
	ctx.font = `${fontWeight} ${size}px ${resolveFontFamily(fontFamily, contextEl)}`

	for (const char of splitGraphemes(text)) {
		if (!map.has(char)) {
			const w = ctx.measureText(char).width
			if (Number.isFinite(w) && w > 0) map.set(char, w)
		}
	}
	return map
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Handle returned by createWrapScene — use to resize or destroy the scene */
export interface SceneHandle {
	/** Tear down the scene, cancel the rAF loop, and remove DOM elements */
	destroy: () => void
	/** Rebuild character objects with new positions (call after options change) */
	rebuild: (positions: CharPosition[]) => void
}

// ─── Orientation ──────────────────────────────────────────────────────────────

/**
 * Build a rotation matrix that orients a CSS3DObject so its visible face points along `normal` (outward),
 * with `right` as the reading direction and `up` as the ascender direction.
 *
 * In CSS3DRenderer an element's visible front face is its local +Z axis (an unrotated element faces a
 * camera on +Z). We therefore map local +X = right, +Y = up, +Z = normal. The geometry guarantees
 * right × up = normal, so this is a rotation (no mirroring).
 *
 * Matrix4.set() takes row-major arguments; columns 0-2 are the local X, Y, Z axes.
 */
function orientationMatrix(
	right:  [number, number, number],
	up:     [number, number, number],
	normal: [number, number, number],
): Matrix4 {
	const [rx, ry, rz] = right
	const [ux, uy, uz] = up
	const [nx, ny, nz] = normal
	const mat = new Matrix4()
	mat.set(
		rx,  ux,  nx,  0,
		ry,  uy,  ny,  0,
		rz,  uz,  nz,  0,
		0,   0,   0,   1,
	)
	return mat
}

// ─── Scene creation ───────────────────────────────────────────────────────────

/** Visually hidden but read by screen readers (the standard sr-only pattern). */
const SR_ONLY = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'

/**
 * Initialise a CSS3DRenderer scene inside `container`, place character objects at the computed positions,
 * and render. Pass `null` as `charPositions` to compute them here with measured character widths
 * (recommended); pass your own (e.g. from getCharPositionsFromMesh) to use them as they are.
 *
 * The text is exposed once to screen readers (a visually hidden copy); the 3D characters are hidden from
 * them. Characters facing away from the camera are hidden unless `showBackfaces`. The render loop runs only
 * while something moves (orbit, damping, auto-rotation, the flag) and while the scene is on screen;
 * reduced motion stops auto-rotation and the flag's wave, including when the setting changes mid-run.
 * Returns a handle to destroy or rebuild the scene.
 */
export function createWrapScene(
	container: HTMLElement,
	charPositions: CharPosition[] | null,
	opts: WrapTypeOptions,
): SceneHandle {
	// ── Measured widths (for the flag's per-frame layout and positions computed here) ──
	const charWidthMap = measureCharWidths(
		opts.text || 'Type',
		opts.fontSize   ?? 14,
		opts.fontFamily ?? 'sans-serif',
		opts.fontWeight ?? 'normal',
		container,
	)
	opts = { ...opts, charWidthMap: opts.charWidthMap ?? charWidthMap }
	const motionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
	let reduced = !!motionQuery?.matches

	const scene  = new Scene()
	const width  = container.clientWidth  || 600
	const height = container.clientHeight || 400

	const camera = new PerspectiveCamera(75, width / height, 1, 10000)
	const camPos = opts.cameraPosition && opts.cameraPosition.every((n) => Number.isFinite(n)) ? opts.cameraPosition : [0, 0, 700]
	camera.position.set(camPos[0], camPos[1], camPos[2])
	camera.lookAt(0, 0, 0)

	// ── CSS3D renderer ─────────────────────────────────────────────────────────
	const renderer = new CSS3DRenderer()
	renderer.setSize(width, height)
	renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;'
	// The 3D characters repeat the text hundreds of times, one letter at a time: hide them from screen
	// readers and expose the text once instead.
	renderer.domElement.setAttribute('aria-hidden', 'true')
	const srText = document.createElement('span')
	srText.style.cssText = SR_ONLY
	srText.textContent = opts.text ?? ''

	// The container needs position:relative so the absolute renderer overlays correctly
	const prevPos      = container.style.position
	const prevOverflow = container.style.overflow
	if (!prevPos || prevPos === 'static') container.style.position = 'relative'
	container.style.overflow = 'hidden'

	// Save scroll before DOM mutations — iOS Safari ignores overflow-anchor:none
	const scrollYBefore = window.scrollY
	container.appendChild(srText)
	container.appendChild(renderer.domElement)
	requestAnimationFrame(() => {
		if (Math.abs(window.scrollY - scrollYBefore) > 2) {
			window.scrollTo({ top: scrollYBefore, behavior: 'instant' })
		}
	})

	// ── Character objects ──────────────────────────────────────────────────────
	const objects: CSS3DObject[] = []
	const animated = isAnimatedShape(opts.shape)
	let current: CharPosition[] = charPositions ?? getCharPositionsAt(opts, 0)
	/** Custom positions passed to rebuild() win over the flag's own animation. */
	let customPositions = charPositions !== null && charPositions !== undefined

	function buildObjects(positions: CharPosition[]) {
		for (const o of objects) scene.remove(o)
		objects.length = 0

		const curve  = Math.min(1, Math.max(0, Number.isFinite(opts.characterCurve) ? opts.characterCurve! : 0))
		const radius = Number.isFinite(opts.radius) && opts.radius! > 0 ? opts.radius! : 300
		const fs     = Number.isFinite(opts.fontSize) && opts.fontSize! > 0 ? opts.fontSize! : 14
		const xAngleFactor = curve * (fs / radius) * (180 / Math.PI) * 0.5
		const perspStr     = curve > 0 ? `perspective(${radius * 4}px) ` : ''

		for (const cp of positions) {
			// Inner span: the glyph and its per-character curvature transform (CSS3DRenderer never touches it).
			const el = document.createElement('span')
			el.textContent = cp.char === ' ' ? ' ' : cp.char
			const scale = cp.scale !== undefined && Number.isFinite(cp.scale) && cp.scale > 0 ? cp.scale : 1
			const advW = (opts.charWidthMap?.get(cp.char) ?? fs * (opts.charAdvanceRatio ?? 0.62)) * scale
			const yAngle = curve > 0 ? curve * (advW / radius) * (180 / Math.PI) * 0.5 : 0
			// Styles are set as properties (not concatenated), so a colour or font string can't add others.
			const st = el.style
			st.fontFamily = opts.fontFamily ?? 'inherit'
			st.fontSize = `${fs * scale}px`
			st.fontWeight = String(opts.fontWeight ?? 'normal')
			st.color = opts.color ?? 'white'
			st.pointerEvents = 'none'
			st.userSelect = 'none'
			st.whiteSpace = 'nowrap'
			st.display = 'block'
			st.lineHeight = '1'
			if (curve > 0) st.transform = `${perspStr}rotateX(${-xAngleFactor}deg) rotateY(${yAngle}deg)`

			// Outer wrapper: CSS3DRenderer writes the world-space matrix3d here.
			const wrapper = document.createElement('div')
			wrapper.style.lineHeight = '1'
			// One compositor layer per character: costly in memory, but each frame then moves layers instead of
			// repainting every glyph (2,000 characters: 158 ms vs 425–533 ms per frame without it).
			wrapper.style.willChange = 'transform'
			if (!opts.showBackfaces) wrapper.style.backfaceVisibility = 'hidden'
			wrapper.appendChild(el)

			const obj = new CSS3DObject(wrapper)
			obj.position.set(cp.position[0], cp.position[1], cp.position[2])
			obj.quaternion.setFromRotationMatrix(orientationMatrix(cp.right, cp.up, cp.normal))
			scene.add(obj)
			objects.push(obj)
		}
	}

	/** Move existing objects in place (no DOM writes); rebuild only if the count changes. */
	function updateObjects(positions: CharPosition[]) {
		if (positions.length !== objects.length) {
			buildObjects(positions)
			return
		}
		for (let i = 0; i < positions.length; i++) {
			const cp  = positions[i]
			const obj = objects[i]
			obj.position.set(cp.position[0], cp.position[1], cp.position[2])
			obj.quaternion.setFromRotationMatrix(orientationMatrix(cp.right, cp.up, cp.normal))
		}
	}

	buildObjects(current)

	// ── Orbit controls ─────────────────────────────────────────────────────────
	// OrbitControls need a DOM element for pointer events — a transparent overlay keeps the text layer at
	// pointer-events:none.
	let controls: OrbitControls | null = null
	let overlay: HTMLDivElement | null = null

	if (opts.camera !== 'fixed') {
		overlay = document.createElement('div')
		overlay.setAttribute('aria-hidden', 'true')
		overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none;'
		container.appendChild(overlay)

		controls = new OrbitControls(camera, overlay)
		controls.enableDamping    = true
		controls.dampingFactor    = 0.05
		controls.autoRotate       = (opts.autoRotate ?? false) && !reduced
		controls.autoRotateSpeed  = Number.isFinite(opts.autoRotateSpeed) ? opts.autoRotateSpeed! : 1.0
		controls.enableZoom       = opts.zoom !== false
		controls.enablePan        = false
	}

	// ── Render loop: runs while something moves, sleeps otherwise ──────────────
	let rafId      = 0
	let visible    = true
	let needRender = true
	let elapsed    = 0
	let lastTime   = performance.now()

	/** Whether the scene moves by itself (wave or auto-rotation) right now. */
	const selfMoving = () => (animated && !reduced && !customPositions) || !!controls?.autoRotate

	function animate(now: number) {
		// -1 while this frame runs: controls.update() fires 'change' synchronously, and wake() must not
		// schedule a second loop from inside the frame.
		rafId = -1
		if (!visible || !container.isConnected) { rafId = 0; return }

		if (animated && !reduced && !customPositions) {
			elapsed += Math.min(0.1, Math.max(0, (now - lastTime) / 1000))
			updateObjects(getCharPositionsAt(opts, elapsed))
			needRender = true
		}
		lastTime = now

		// controls.update() returns true while the camera moves (drag, damping, auto-rotation)
		const moved = controls?.update() ?? false
		if (moved || needRender) {
			renderer.render(scene, camera)
			needRender = false
		}
		rafId = moved || selfMoving() ? requestAnimationFrame(animate) : 0
	}

	/** Start the loop if it isn't running. Safe to call any number of times. */
	function wake() {
		if (!rafId && visible) {
			lastTime = performance.now()
			rafId = requestAnimationFrame(animate)
		}
	}
	controls?.addEventListener('start', wake)
	controls?.addEventListener('change', () => { needRender = true; wake() })
	wake()

	// ── Reduced motion turned on or off while running ──────────────────────────
	const onMotion = () => {
		reduced = !!motionQuery?.matches
		if (controls) controls.autoRotate = (opts.autoRotate ?? false) && !reduced
		if (reduced && animated && !customPositions) { updateObjects(getCharPositionsAt(opts, 0)); elapsed = 0 }
		needRender = true
		wake()
	}
	motionQuery?.addEventListener?.('change', onMotion)

	// ── Pause while off screen ─────────────────────────────────────────────────
	const io = new IntersectionObserver(([entry]) => {
		visible = entry.isIntersecting
		if (visible) { needRender = true; wake() }
		else if (rafId > 0) { cancelAnimationFrame(rafId); rafId = 0 }
	})
	io.observe(container)

	// ── Resize ─────────────────────────────────────────────────────────────────
	const ro = new ResizeObserver(() => {
		const w = container.clientWidth
		const h = container.clientHeight
		if (w === 0 || h === 0) return
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		renderer.setSize(w, h)
		needRender = true
		wake()
	})
	ro.observe(container)

	// ── Handle ─────────────────────────────────────────────────────────────────
	return {
		destroy() {
			if (rafId > 0) cancelAnimationFrame(rafId)
			rafId = 0
			visible = false
			io.disconnect()
			ro.disconnect()
			motionQuery?.removeEventListener?.('change', onMotion)
			controls?.dispose()
			renderer.domElement.remove()
			srText.remove()
			overlay?.remove()
			scene.clear()
			container.style.position = prevPos
			container.style.overflow = prevOverflow
		},
		rebuild(positions: CharPosition[]) {
			customPositions = true
			current = positions
			buildObjects(current)
			needRender = true
			wake()
		},
	}
}
