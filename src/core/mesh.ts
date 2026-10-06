// wrapType/src/core/mesh.ts — sample CharPositions from an arbitrary Three.js Mesh

import { Matrix3, Vector3 } from 'three'
import { splitGraphemes } from './geometry'
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'
import type { Mesh } from 'three'
import type { WrapTypeOptions, CharPosition } from './types'

// ─── Tangent frame ────────────────────────────────────────────────────────────

/**
 * Compute a right-handed tangent frame {right, up} for a given outward normal.
 * Uses a reference vector that is never parallel to the normal.
 */
function makeFrame(n: Vector3): {
	// right × up = n (the frame createWrapScene and getCharPositions use)
	right: [number, number, number]
	up:    [number, number, number]
} {
	// Pick a reference vector not collinear with n
	const ref  = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
	const right = new Vector3().crossVectors(ref, n).normalize()
	// Guard against degenerate cross product (extremely unlikely with the ref switch above)
	if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
	const up = new Vector3().crossVectors(n, right).normalize()
	return {
		right: [right.x, right.y, right.z],
		up:    [up.x,    up.y,    up.z],
	}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sample `count` character positions uniformly distributed across the surface
 * of an arbitrary Three.js Mesh.
 *
 * The mesh's world transform (position, rotation, scale) is applied, then the result is centred and
 * scaled so its longest dimension fits inside a sphere of the given radius. Normals are taken from the
 * mesh's geometry attributes (vertex normals are computed on demand if absent). Text is cycled by
 * grapheme, so emoji and accented letters stay whole. An empty geometry returns no positions.
 *
 * @param mesh   A Three.js `Mesh` with a valid `BufferGeometry`
 * @param text   The string to cycle through (repeats to fill `count` slots)
 * @param opts   Optional radius (world units, default 300)
 * @param count  Number of character positions to generate (default 250)
 */
export function getCharPositionsFromMesh(
	mesh:  Mesh,
	text:  string,
	opts?: Pick<WrapTypeOptions, 'radius'>,
	count  = 250,
): CharPosition[] {
	const chars = splitGraphemes(text || 'Type')
	const radius = Number.isFinite(opts?.radius) && opts!.radius! > 0 ? Math.min(opts!.radius!, 10000) : 300
	const n = Number.isFinite(count) && count > 0 ? Math.min(Math.floor(count), 20000) : 250

	const geom = mesh?.geometry
	const posAttr = geom?.attributes?.position
	if (!posAttr || posAttr.count === 0) {
		console.warn('[wrapType] getCharPositionsFromMesh: the mesh has no vertices; no positions returned')
		return []
	}
	if (!geom.attributes.normal) geom.computeVertexNormals()

	// World transform: positions by matrixWorld, normals by its normal matrix.
	mesh.updateMatrixWorld?.(true)
	const world = mesh.matrixWorld
	const normalMatrix = new Matrix3().getNormalMatrix(world)

	const sampler = new MeshSurfaceSampler(mesh).build()
	const pos  = new Vector3()
	const nrm  = new Vector3()
	const samples: { p: Vector3; n: Vector3 }[] = []
	const min = new Vector3(Infinity, Infinity, Infinity)
	const max = new Vector3(-Infinity, -Infinity, -Infinity)
	for (let i = 0; i < n; i++) {
		sampler.sample(pos, nrm)
		const p = pos.clone().applyMatrix4(world)
		const nn = nrm.clone().applyMatrix3(normalMatrix).normalize()
		samples.push({ p, n: nn })
		min.min(p)
		max.max(p)
	}

	// Centre and scale so the longest side spans the full diameter (radius × 2).
	const center = min.clone().add(max).multiplyScalar(0.5)
	const size = max.clone().sub(min)
	const scale = (radius * 2) / (Math.max(size.x, size.y, size.z) || 1)

	const positions: CharPosition[] = samples.map(({ p, n: nn }, i) => {
		const { right, up } = makeFrame(nn)
		return {
			char:     chars[i % chars.length],
			position: [(p.x - center.x) * scale, (p.y - center.y) * scale, (p.z - center.z) * scale],
			normal:   [nn.x, nn.y, nn.z],
			right,
			up,
		}
	})
	return positions
}
