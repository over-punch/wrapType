// wrapType/src/__tests__/react.test.tsx — @testing-library/react tests for useWrapType and WrapTypeScene

import React from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── document.fonts.ready — never settles so the mount-after-fonts effect
//     in useWrapType / WrapTypeScene does not fire during tests ───────────────
Object.defineProperty(document, 'fonts', {
	value: { ready: new Promise(() => {}) },
	configurable: true,
})

// ─── Canvas 2D mock (measureCharWidths in scene.ts uses canvas) ───────────────

const mockCtx = {
	font: '',
	measureText: vi.fn(() => ({ width: 8 })),
}

HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext

// ─── ResizeObserver / IntersectionObserver mocks ─────────────────────────────

class MockResizeObserver {
	observe    = vi.fn()
	unobserve  = vi.fn()
	disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

class MockIntersectionObserver {
	observe    = vi.fn()
	unobserve  = vi.fn()
	disconnect = vi.fn()
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

// ─── requestAnimationFrame mock ───────────────────────────────────────────────
// Do NOT execute the callback synchronously — scene.ts has a raf animation
// loop that would recurse infinitely. Just capture it and return a stable id.

let rafId = 0
vi.stubGlobal('requestAnimationFrame', vi.fn(() => ++rafId))
vi.stubGlobal('cancelAnimationFrame', vi.fn())

// ─── Three.js / CSS3DRenderer / OrbitControls mocks ──────────────────────────

// Mock the Three.js core classes used by scene.ts
vi.mock('three', () => {
	const Vec3 = class {
		x = 0; y = 0; z = 0
		set() { return this }
		copy() { return this }
		normalize() { return this }
		cross() { return this }
		dot() { return 0 }
		clone() { return new Vec3() }
	}
	const Mat4 = class {
		elements = new Array(16).fill(0)
		set()      { return this }
		makeBasis() { return this }
		decompose() {}
		compose()  { return this }
	}
	return {
		Scene: class {
			add      = vi.fn()
			remove   = vi.fn()
			clear    = vi.fn()
			children = []
		},
		PerspectiveCamera: class {
			position = { set: vi.fn(), z: 700 }
			aspect   = 1
			lookAt   = vi.fn()
			updateProjectionMatrix = vi.fn()
		},
		Matrix4:  Mat4,
		Vector3:  Vec3,
		Euler:    class { set() { return this } },
		Quaternion: class { setFromRotationMatrix() { return this } },
	}
})

// Mock CSS3DRenderer and CSS3DObject from three/addons
vi.mock('three/addons/renderers/CSS3DRenderer.js', () => {
	const domElement = document.createElement('div')
	return {
		CSS3DRenderer: class {
			domElement = domElement
			setSize    = vi.fn()
			render     = vi.fn()
		},
		CSS3DObject: class {
			element:    HTMLElement
			position:   { set: ReturnType<typeof vi.fn> }
			quaternion: { setFromRotationMatrix: ReturnType<typeof vi.fn> }
			matrix:     { decompose: ReturnType<typeof vi.fn> }
			constructor(el: HTMLElement) {
				this.element    = el
				this.position   = { set: vi.fn() }
				this.quaternion = { setFromRotationMatrix: vi.fn() }
				this.matrix     = { decompose: vi.fn() }
			}
		},
	}
})

// Mock OrbitControls from three/addons
vi.mock('three/addons/controls/OrbitControls.js', () => ({
	OrbitControls: class {
		enableDamping = false
		dampingFactor = 0
		autoRotate    = false
		autoRotateSpeed = 0
		addEventListener = vi.fn()
		update           = vi.fn()
		dispose          = vi.fn()
	},
}))

// ─── Import under test (after mocks are registered) ──────────────────────────

import { useWrapType } from '../react/useWrapType'
import { WrapTypeScene } from '../react/WrapTypeScene'

// ─── Shared options ───────────────────────────────────────────────────────────

const BASE_OPTS = { text: 'Typography', shape: 'sphere' as const, fill: 'cover' as const }

// ─── useWrapType ──────────────────────────────────────────────────────────────

describe('useWrapType', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('mounts without throwing', () => {
		expect(() =>
			renderHook(() => useWrapType(BASE_OPTS))
		).not.toThrow()
	})

	it('returns a ref object', () => {
		const { result } = renderHook(() => useWrapType(BASE_OPTS))
		expect(result.current).toHaveProperty('ref')
		expect(result.current.ref).toBeDefined()
	})

	it('unmounts without throwing', () => {
		const { unmount } = renderHook(() => useWrapType(BASE_OPTS))
		expect(() => unmount()).not.toThrow()
	})

	it('re-renders without throwing when text option changes', () => {
		const { rerender } = renderHook(
			({ opts }) => useWrapType(opts),
			{ initialProps: { opts: BASE_OPTS } },
		)
		expect(() =>
			rerender({ opts: { ...BASE_OPTS, text: 'Changed' } })
		).not.toThrow()
	})

	it('re-renders without throwing when shape option changes', () => {
		const { rerender } = renderHook(
			({ opts }) => useWrapType(opts),
			{ initialProps: { opts: BASE_OPTS } },
		)
		expect(() =>
			rerender({ opts: { ...BASE_OPTS, shape: 'cylinder' } })
		).not.toThrow()
	})

	it('re-renders without throwing when autoRotate option changes', () => {
		const { rerender } = renderHook(
			({ opts }) => useWrapType(opts),
			{ initialProps: { opts: BASE_OPTS } },
		)
		expect(() =>
			rerender({ opts: { ...BASE_OPTS, autoRotate: true } })
		).not.toThrow()
	})
})

// ─── WrapTypeScene ────────────────────────────────────────────────────────────

describe('WrapTypeScene', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('mounts without throwing', () => {
		expect(() => render(<WrapTypeScene text="Typography" />)).not.toThrow()
	})

	it('unmounts without throwing', () => {
		const { unmount } = render(<WrapTypeScene text="Typography" />)
		expect(() => unmount()).not.toThrow()
	})

	it('renders a div container element', () => {
		const { container } = render(<WrapTypeScene text="Typography" />)
		const div = container.querySelector('div')
		expect(div).not.toBeNull()
	})

	it('forwards className to the container div', () => {
		const { container } = render(
			<WrapTypeScene text="Typography" className="my-scene" />,
		)
		const div = container.querySelector('div')
		expect(div?.className).toBe('my-scene')
	})

	it('keeps the container readable and forwards HTML attributes (the 3D layer is hidden instead)', () => {
		const { container } = render(<WrapTypeScene text="Typography" id="globe" aria-label="Spinning globe of text" />)
		const div = container.querySelector('div')
		expect(div?.getAttribute('aria-hidden')).toBeNull()
		expect(div?.id).toBe('globe')
		expect(div?.getAttribute('aria-label')).toBe('Spinning globe of text')
	})

	it('forwards style to the container div', () => {
		const { container } = render(
			<WrapTypeScene text="Typography" style={{ width: '640px', height: '480px' }} />,
		)
		const div = container.querySelector('div') as HTMLDivElement
		expect(div.style.width).toBe('640px')
		expect(div.style.height).toBe('480px')
	})

	it('re-renders without throwing when text prop changes', () => {
		const { rerender } = render(<WrapTypeScene text="Typography" />)
		expect(() =>
			rerender(<WrapTypeScene text="Changed text" />)
		).not.toThrow()
	})

	it('re-renders without throwing when shape prop changes', () => {
		const { rerender } = render(<WrapTypeScene text="Typography" shape="sphere" />)
		expect(() =>
			rerender(<WrapTypeScene text="Typography" shape="cylinder" />)
		).not.toThrow()
	})

	it('accepts pre-computed positions prop without throwing', () => {
		const positions = [{
			char: 'T',
			position: [300, 0, 0] as [number, number, number],
			normal:   [1, 0, 0]  as [number, number, number],
			right:    [0, 0, -1] as [number, number, number],
			up:       [0, 1, 0]  as [number, number, number],
		}]
		expect(() =>
			render(<WrapTypeScene text="T" positions={positions} />)
		).not.toThrow()
	})

	it('renders correctly with autoRotate enabled', () => {
		expect(() =>
			render(<WrapTypeScene text="Typography" autoRotate autoRotateSpeed={2} />)
		).not.toThrow()
	})

	it('renders correctly with camera="fixed"', () => {
		expect(() =>
			render(<WrapTypeScene text="Typography" camera="fixed" />)
		).not.toThrow()
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

describe('createWrapScene review fixes', () => {
	it('exposes the text once to screen readers and hides the 3D characters', async () => {
		const { createWrapScene } = await import('../core/scene')
		const c = document.createElement('div')
		document.body.appendChild(c)
		const h = createWrapScene(c, null, { text: 'Hello world', shape: 'plane', camera: 'fixed' })
		const hidden = c.querySelector('[aria-hidden="true"]')
		expect(hidden).not.toBeNull()
		const readable = Array.from(c.childNodes).filter((n) => n instanceof HTMLElement && !n.hasAttribute('aria-hidden'))
		expect(readable.map((n) => n.textContent)).toEqual(['Hello world'])
		h.destroy()
		expect(c.childNodes.length).toBe(0)
	})

	it("doesn't let a colour or font string add other styles", async () => {
		const { createWrapScene } = await import('../core/scene')
		const c = document.createElement('div')
		document.body.appendChild(c)
		const h = createWrapScene(c, null, { text: 'ab', shape: 'plane', camera: 'fixed', color: 'red;background:url(/beacon)', fontFamily: 'x;position:fixed' })
		c.querySelectorAll<HTMLElement>('[aria-hidden="true"] span').forEach((s) => {
			expect(s.style.background).toBe('')
			expect(s.style.position).not.toBe('fixed')
		})
		h.destroy()
	})
})
