# wrapType

[![npm](https://img.shields.io/npm/v/%40liiift-studio%2Fwraptype.svg)](https://www.npmjs.com/package/@overpunch/wraptype) [![npm downloads](https://img.shields.io/npm/dm/%40liiift-studio%2Fwraptype.svg)](https://www.npmjs.com/package/@overpunch/wraptype) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![part of liiift type-tools](https://img.shields.io/badge/liiift-type--tools-blueviolet)](https://github.com/Liiift-Studio/type-tools)

Real DOM text on any 3D surface — sphere, cylinder, torus, plane, waving flag, stool, or a custom mesh.

wrapType uses Three.js's CSS3DRenderer to distribute HTML text elements across the geometry of a 3D surface. Each character is a real DOM element oriented along the surface normal, which means variable fonts, CSS animations, hover states, and every other Liiift tool compose naturally — no canvas, no textures.

<p align="center">
  <img src="https://raw.githubusercontent.com/Liiift-Studio/wrapType/main/assets/hero.gif?v=1" alt="The word TYPOGRAPHY rendered as real HTML spans wrapped around a slowly rotating 3D sphere" width="640">
</p>

> Try it live and drop in your own `.glb` / `.gltf` / `.obj` mesh at **[wraptype.com](https://wraptype.com)**.

## Install

```bash
npm install @overpunch/wraptype three
```

Only **`three`** is required. The remaining peers are **optional** — install the ones you use:

| Peer dependency | Needed for |
|---|---|
| `three` (required) | Core geometry + CSS3DRenderer |
| `react`, `react-dom` | The `WrapTypeScene` component / `useWrapType` hook |
| `@react-three/fiber`, `troika-three-text` | The GPU/SDF renderer at `@overpunch/wraptype/r3f` |

```bash
# React + DOM renderer (most common):
npm install @overpunch/wraptype three react react-dom

# R3F / WebGL renderer:
npm install @overpunch/wraptype three @react-three/fiber troika-three-text
```

Vanilla JS users need only `three`.

## React

### Component

```tsx
'use client' // Next.js App Router: WrapTypeScene renders in the browser only.

import { WrapTypeScene } from '@overpunch/wraptype'

<WrapTypeScene
  text="Typography is the art and technique of arranging type"
  shape="sphere"
  fill="cover"
  fontSize={13}
  color="rgba(220,210,255,0.85)"
  autoRotate
  style={{ width: '100%', height: '500px' }}
/>
```

<p align="center">
  <img src="https://raw.githubusercontent.com/Liiift-Studio/wrapType/main/assets/shape-sphere.png?v=1" alt="The word TYPOGRAPHY wrapped around a sphere in latitude bands" width="380">
  <img src="https://raw.githubusercontent.com/Liiift-Studio/wrapType/main/assets/shape-cylinder.png?v=1" alt="The word WRAPTYPE arced around the curved side of a cylinder" width="380">
</p>

<p align="center"><em>Every glyph above is a live <code>&lt;span&gt;</code> placed in 3D by CSS3DRenderer — selectable, styleable, animatable.</em></p>

### Hook

```tsx
import { useWrapType } from '@overpunch/wraptype'

const { ref } = useWrapType({
  text: 'Typography is the art and technique of arranging type',
  shape: 'cylinder',
  fill: 'flow',
})

<div ref={ref} style={{ width: '100%', height: '500px' }} />
```

## Vanilla JS

```ts
import { getCharPositions, createWrapScene } from '@overpunch/wraptype'

const container = document.getElementById('scene')

const positions = getCharPositions({
  text: 'Typography is the art and technique of arranging type',
  shape: 'torus',
  fill: 'cover',
})

const scene = createWrapScene(container, positions, {
  autoRotate: true,
  autoRotateSpeed: 0.6,
})

// Later, to clean up:
scene.destroy()

// Rebuild after changing options:
const newPositions = getCharPositions({ text: 'New text', shape: 'sphere' })
scene.rebuild(newPositions)
```

## GPU / WebGL renderer (`/r3f`)

The default renderer places real HTML in 3D (CSS3DRenderer). For text that needs to live **inside** a WebGL scene — receiving lights, shaders, and post-processing — import the SDF renderer from the `@overpunch/wraptype/r3f` entry point. It uses [`troika-three-text`](https://github.com/protectwise/troika) for GPU-antialiased glyphs curved onto the surface via troika's native `curveRadius`.

Requires `@react-three/fiber` and `troika-three-text` as peers.

### React Three Fiber component

```tsx
import { Canvas } from '@react-three/fiber'
import { WrapTypeMesh } from '@overpunch/wraptype/r3f'

<Canvas>
  <WrapTypeMesh
    shape="sphere"
    radius={1}
    text="Typography on any surface"
    color="#ffffff"
    fontSize={0.1}
    autoRotate
  />
</Canvas>
```

`WrapTypeMesh` accepts `shape` (`'sphere' | 'cylinder' | 'torus' | 'plane'`), `radius`, `text`, `font`, `fontSize`, `letterSpacing`, `maxWidth`, `textAlign`, `color`, `curvatureTracking`, `curvatureTrackingFactor`, plus standard transform props (`position`, `rotation`, `scale`, `autoRotate`, `autoRotateSpeed`).

### Imperative (no React)

```ts
import { createSDFText, updateSDFText } from '@overpunch/wraptype/r3f'

const { group, dispose } = createSDFText('cylinder', {
  text: 'Typography on any surface',
  fontSize: 0.1,
  color: '#ffffff',
}, /* radius */ 1)

scene.add(group)

// Rebuild in place — keeps the same group reference:
updateSDFText(group, 'torus', { text: 'New text', color: '#ffccaa' }, 1)

// Free GPU resources when done:
dispose()
```

| When to use | Renderer | Import |
|---|---|---|
| Variable fonts, CSS animation, selectable text, compose with other Liiift tools | **DOM (CSS3DRenderer)** | `@overpunch/wraptype` |
| Text inside a WebGL scene — lighting, shaders, post-processing, large glyph counts | **SDF (WebGL)** | `@overpunch/wraptype/r3f` |

## API

### `WrapTypeScene` props / `WrapTypeOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | — | Text to distribute across the surface. Repeats to fill. |
| `shape` | `'sphere' \| 'cylinder' \| 'torus' \| 'plane' \| 'stool' \| 'flag'` | `'sphere'` | Built-in 3D geometry to wrap text onto. |
| `mode` | `'surface' \| 'silhouette'` | `'surface'` | Surface mode places characters on the geometry; silhouette places them along the outline contour. |
| `fill` | `'cover' \| 'flow' \| 'full-width' \| 'full-height' \| 'pattern'` | `'cover'` | How to distribute characters across the surface. |
| `fontSize` | `number` | `14` | Character font size in px. |
| `fontFamily` | `string` | `undefined` | CSS font-family override applied to each character span. |
| `fontWeight` | `string \| number` | `'normal'` | CSS font-weight applied to each character span. |
| `color` | `string` | `'white'` | CSS color applied to every character element. |
| `radius` | `number` | `300` | Surface radius in scene units. |
| `height` | `number` | `radius * 2` | Cylinder or plane height in scene units. |
| `autoRotate` | `boolean` | `false` | Continuously rotate the scene. |
| `autoRotateSpeed` | `number` | `1.0` | Rotation speed multiplier. |
| `camera` | `'orbit' \| 'fixed'` | `'orbit'` | `'orbit'` — drag to rotate, scroll to zoom. `'fixed'` — static camera. |
| `cameraPosition` | `[number, number, number]` | `[0, 0, 700]` | Initial camera position in scene units. |
| `charAdvanceRatio` | `number` | `0.62` | Fraction of fontSize used as character advance width. |
| `lineHeightRatio` | `number` | `1.4` | Line height multiplier relative to fontSize. |
| `repeat` | `boolean` | `true` | When false, text is placed exactly once without tiling. |
| `characterCurve` | `number` | `0` | Bend characters to follow surface curvature. `0` = flat, `1` = full bend. |
| `style` | `CSSProperties` | — | Applied to the container div. (React only) |

### Fill modes

- **`cover`** — tiles the full surface, latitude bands scaled by circumference
- **`flow`** — a single band around the equator / circumference, text repeats
- **`full-width`** — one horizontal pass at the widest point of the shape
- **`full-height`** — one vertical pass from pole to pole
- **`pattern`** — repeating tiled pattern with configurable gap

### `SceneHandle`

Returned by `createWrapScene()`:

| Method | Description |
|---|---|
| `destroy()` | Removes the renderer and all event listeners. |
| `rebuild(positions)` | Replaces all character elements without rebuilding the renderer. |

### `getCharPositions(opts)`

Returns `CharPosition[]` — one entry per character instance placed on the surface.

```ts
interface CharPosition {
  char: string
  position: [number, number, number]  // world position
  normal:   [number, number, number]  // outward surface normal
  right:    [number, number, number]  // tangent along text direction
  up:       [number, number, number]  // tangent perpendicular to right
}
```

### `getCharPositionsAt(opts, t)`

Like `getCharPositions`, but evaluates positions at a specific time parameter `t` — useful for animating the geometry.

### `isAnimatedShape(shape)`

Returns `true` if the given shape name requires time-stepped updates (e.g. `'flag'`).

## How it works

Three.js's CSS3DRenderer maps HTML elements into 3D space using CSS `perspective` and `matrix3d` transforms. wrapType computes character positions analytically from the shape's surface equations — no UV unwrapping or texture atlases.

Each character element is oriented so its visible face points along the outward surface normal using a rotation matrix built from the surface's local right/up/normal frame.

OrbitControls are wired to a transparent overlay `<div>` so that pointer events reach the controls without selecting text.

## Shapes

| Shape | Notes |
|---|---|
| Sphere | Latitude bands from φ = 0.12π to 0.88π. Band character count scales with `sin(φ)`. |
| Cylinder | Characters arc around the circumference, stacked in rows. |
| Torus | Characters follow the outer ring parameterised by major and minor angle. |
| Plane | Grid of characters on a flat surface facing the camera. |
| Stool | Cylinder with disc caps — top, side, and bottom surfaces sampled separately. |
| Flag | Animated surface — characters follow a sinusoidal wave that propagates along the flag. |

## Custom meshes

Drop any `.glb`, `.gltf`, or `.obj` file onto the demo. wrapType samples the surface with `MeshSurfaceSampler`, orients each character along the local normal, and auto-scales to fit the scene radius.

In code, load any Three.js `Mesh` and feed it to `getCharPositionsFromMesh`, then render the result through the same scene API (or pass `positions` to `<WrapTypeScene>` in React):

```ts
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh } from 'three'
import { getCharPositionsFromMesh, createWrapScene } from '@overpunch/wraptype'

new GLTFLoader().load('/model.glb', (gltf) => {
  let mesh = null
  gltf.scene.traverse((c) => { if (!mesh && c instanceof Mesh) mesh = c })
  if (!mesh) return

  const positions = getCharPositionsFromMesh(
    mesh,
    'Typography on any surface',
    { radius: 300 },
    250, // sample count
  )
  createWrapScene(document.getElementById('scene'), positions, { autoRotate: true })
})
```

## Requirements

| | |
|---|---|
| **Runtime** | Modern evergreen browsers (CSS3DRenderer needs `transform-style: preserve-3d` + `matrix3d`). |
| **Peer deps** | `three >= 0.160`. Optional: `react`/`react-dom >= 17`, `@react-three/fiber >= 8`, `troika-three-text >= 0.47`. |
| **Module formats** | ESM + CJS, with bundled TypeScript declarations. |
| **SSR** | Browser-only. In Next.js App Router, mark the consuming component `'use client'`. |

## Performance notes

The DOM renderer creates **one HTML element per character instance**, so cost scales with the number of placed glyphs (which `fill`, `repeat`, and surface area all affect). It is built for striking display typography — wrap a headline, a logo, a hero — not for paragraphs of thousands of characters. For very high glyph counts, or to embed text inside a lit/shaded WebGL scene, use the [SDF renderer](#gpu--webgl-renderer-r3f) instead.

## How it compares

- **drei `<Text3D>` / extruded geometry** — renders solid 3D letterforms in WebGL. wrapType's DOM mode instead keeps glyphs as flat, real HTML on the surface, so they stay selectable, accessible, and styleable with CSS.
- **Plain `troika-three-text`** — gives you GPU SDF text but not surface distribution. wrapType's `/r3f` renderer wraps troika with shape geometry and curvature; its DOM renderer needs no WebGL text at all.
- **CSS-only 3D transforms** — can fake perspective on a block of text, but cannot distribute individual characters analytically across a curved surface with correct per-glyph normals. That is wrapType's core.

## Contributing

```bash
git clone https://github.com/Liiift-Studio/wrapType.git
cd wrapType
npm install

npm test        # vitest unit tests (happy-dom)
npm run typecheck
npm run build   # vite library build → dist/ (ESM + CJS + types)
```

The package source lives in `src/` (`core/` is framework-agnostic; `react/` holds the hook + component; `r3f/` is the SDF renderer). The landing page and interactive demo are a separate Next.js app in `site/`. README visuals are regenerated reproducibly with `npm run capture` (drives the running demo with Playwright; see `scripts/capture.mjs`).

## License

MIT © [Liiift Studio](https://liiift.studio)

Part of [type-tools](https://github.com/Liiift-Studio/type-tools) — a suite of typographic tools for techniques that are impossible or impractical in CSS alone.
