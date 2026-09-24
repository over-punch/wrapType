"use client"

// SDFCanvas.tsx — R3F Canvas wrapper for the SDF demo tab (lazy-loaded)
// Kept in its own file so it is only bundled when the SDF tab is activated.

import { Canvas } from "@react-three/fiber"
import { WrapTypeMesh } from "@overpunch/wraptype/r3f"
import type { WrapTypeShape } from "@overpunch/wraptype"

/** Props forwarded from the Demo SDF tab */
interface SDFCanvasProps {
	text: string
	shape: WrapTypeShape
	autoRotate: boolean
	curvatureTracking: boolean
	color: string
	fontSize: number
	letterSpacing: number
}

/**
 * Minimal R3F Canvas for the wrapType SDF demo.
 * Mounts a WrapTypeMesh on a fixed radius=2 sphere/cylinder/torus/plane
 * with ambient + directional lighting and a perspective camera at z=6.
 */
export default function SDFCanvas({
	text,
	shape,
	autoRotate,
	curvatureTracking,
	color,
	fontSize,
	letterSpacing,
}: SDFCanvasProps) {
	return (
		<Canvas
			camera={{ position: [0, 0, 6], fov: 50 }}
			style={{ width: "100%", height: "100%" }}
		>
			<ambientLight intensity={0.6} />
			<directionalLight position={[5, 5, 5]} intensity={1} />
			<WrapTypeMesh
				shape={shape}
				radius={2}
				text={text}
				fontSize={fontSize}
				letterSpacing={letterSpacing}
				color={color}
				curvatureTracking={curvatureTracking}
				autoRotate={autoRotate}
				autoRotateSpeed={0.3}
			/>
		</Canvas>
	)
}
