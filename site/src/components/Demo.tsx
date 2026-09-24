"use client"

// wrapType demo — DOM (CSS3DRenderer) and SDF (WebGL/troika) renderer tabs
import { useState, useDeferredValue, useCallback, useRef, Suspense, lazy, Component, useMemo } from "react"
import type { ReactNode } from "react"
import { WrapTypeScene, getCharPositionsFromMesh } from "@overpunch/wraptype"
import type { WrapTypeShape, WrapTypeFill, CharPosition } from "@overpunch/wraptype"
import { Mesh, Group } from "three"
import type { Object3D } from "three"

// ─── Lazy-load SDF Canvas (avoids SSR errors) ──────────────────────────────

const SDFCanvas = lazy(() => import("./SDFCanvas"))

// ─── Error boundary for the SDF WebGL canvas ─────────────────────────────────

interface SdfErrorBoundaryProps { children: ReactNode; rendererKey: string }
interface SdfErrorBoundaryState { hasError: boolean; rendererKey: string }

/** Error boundary that resets automatically when the renderer tab is switched. */
class SdfErrorBoundary extends Component<SdfErrorBoundaryProps, SdfErrorBoundaryState> {
	constructor(props: SdfErrorBoundaryProps) {
		super(props)
		this.state = { hasError: false, rendererKey: props.rendererKey }
	}
	static getDerivedStateFromError(_: Error, prevState: SdfErrorBoundaryState): SdfErrorBoundaryState {
		return { ...prevState, hasError: true }
	}
	/** Reset the boundary when the renderer tab changes. */
	static getDerivedStateFromProps(
		props: SdfErrorBoundaryProps,
		state: SdfErrorBoundaryState,
	): SdfErrorBoundaryState | null {
		if (props.rendererKey !== state.rendererKey) {
			return { hasError: false, rendererKey: props.rendererKey }
		}
		return null
	}
	reset() { this.setState({ hasError: false, rendererKey: this.props.rendererKey }) }
	render() {
		if (this.state.hasError) {
			return (
				<div className="w-full h-full flex flex-col items-center justify-center gap-3">
					<p className="text-xs text-subtle tracking-[0.18em] uppercase">WebGL error</p>
					<button
						onClick={() => this.reset()}
						title="Restart the WebGL canvas after an error"
						className="text-xs px-4 py-2 rounded-full border border-foreground/20 hover:border-foreground/40 transition-colors"
					>
						Reload canvas
					</button>
				</div>
			)
		}
		return this.props.children
	}
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RendererMode = "dom" | "sdf"
type SizeUnit     = "px" | "pt" | "em" | "rem" | "vw" | "vh"

interface UnitConfig {
	min: number
	max: number
	step: number
	decimals: number
}

const UNIT_CFG: Record<SizeUnit, UnitConfig> = {
	px:  { min: 12,  max: 400, step: 2,   decimals: 0 },
	pt:  { min: 8,   max: 300, step: 1,   decimals: 0 },
	em:  { min: 0.5, max: 25,  step: 0.1, decimals: 1 },
	rem: { min: 0.5, max: 25,  step: 0.1, decimals: 1 },
	vw:  { min: 1,   max: 35,  step: 0.5, decimals: 1 },
	vh:  { min: 1,   max: 50,  step: 0.5, decimals: 1 },
}

const SIZE_UNITS: SizeUnit[] = ["px", "pt", "em", "rem", "vw", "vh"]

/** Maximum accepted mesh file size (20 MB). */
const MAX_MESH_BYTES = 20 * 1024 * 1024

/** Accepted MIME types for mesh files. */

/** Convert a value in any supported unit to CSS pixels. Safe to call server-side. */
function toPx(value: number, unit: SizeUnit): number {
	if (unit === "px")  return value
	if (unit === "pt")  return value * (96 / 72)
	if (unit === "em" || unit === "rem") {
		const rootPx = typeof document !== "undefined"
			? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
			: 16
		return value * rootPx
	}
	if (unit === "vw") return value * (typeof window !== "undefined" ? window.innerWidth  : 1200) / 100
	if (unit === "vh") return value * (typeof window !== "undefined" ? window.innerHeight : 800) / 100
	return value
}

/** Convert from px back to a target unit to preserve visual size on unit switch. */
function fromPx(px: number, unit: SizeUnit): number {
	if (unit === "px")  return px
	if (unit === "pt")  return px * (72 / 96)
	if (unit === "em" || unit === "rem") {
		const rootPx = typeof document !== "undefined"
			? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
			: 16
		return px / rootPx
	}
	if (unit === "vw") return px / ((typeof window !== "undefined" ? window.innerWidth  : 1200) / 100)
	if (unit === "vh") return px / ((typeof window !== "undefined" ? window.innerHeight : 800) / 100)
	return px
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TEXT  = "TYPE"
const DEFAULT_SHAPE = "sphere" as WrapTypeShape
const DEFAULT_FILL  = "cover" as WrapTypeFill
/** Font family reference via the next/font CSS variable set in layout.tsx. */
const FONT_FAMILY   = "var(--font-inter), sans-serif"
const FONT_WEIGHT   = 900

const DOM_SHAPES: { value: WrapTypeShape; label: string; title: string }[] = [
	{ value: "flag",     label: "Flag",     title: "Animate text across a waving flag surface" },
	{ value: "stool",    label: "Stool",    title: "Wrap text around a stool-shaped mesh" },
	{ value: "sphere",   label: "Sphere",   title: "Wrap text evenly around a sphere" },
	{ value: "cylinder", label: "Cylinder", title: "Wrap text around the curved side of a cylinder" },
	{ value: "torus",    label: "Torus",    title: "Wrap text around the inner and outer surface of a torus (donut)" },
	{ value: "plane",    label: "Plane",    title: "Lay text flat across a plane surface" },
]

const SDF_SHAPES: { value: WrapTypeShape; label: string; title: string }[] = [
	{ value: "sphere",   label: "Sphere",   title: "Wrap GPU-rendered text around a sphere" },
	{ value: "cylinder", label: "Cylinder", title: "Wrap GPU-rendered text around the curved side of a cylinder" },
	{ value: "torus",    label: "Torus",    title: "Wrap GPU-rendered text around the surface of a torus (donut)" },
	{ value: "plane",    label: "Plane",    title: "Render GPU text flat across a plane surface" },
]

const FILLS: { value: WrapTypeFill; label: string; title: string }[] = [
	{ value: "cover",       label: "Cover",       title: "Scale text to cover the full surface area of the mesh" },
	{ value: "flow",        label: "Flow",        title: "Let text flow naturally across the surface at its current size" },
	{ value: "full-width",  label: "Full Width",  title: "Stretch text to fill the full width of the mesh" },
	{ value: "full-height", label: "Full Height", title: "Stretch text to fill the full height of the mesh" },
	{ value: "pattern",     label: "Pattern",     title: "Tile text as a repeating grid across the surface" },
]

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
	return (
		<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
			<polyline points="17 8 12 3 7 8"/>
			<line x1="12" y1="3" x2="12" y2="15"/>
		</svg>
	)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Demo() {
	const [renderer, setRenderer] = useState<RendererMode>("dom")

	// ── DOM tab state ──────────────────────────────────────────────────────
	const [text,    setText]    = useState(DEFAULT_TEXT)
	const [shape,   setShape]   = useState<WrapTypeShape>(DEFAULT_SHAPE)
	const [fill,    setFill]    = useState<WrapTypeFill>(DEFAULT_FILL)
	const [autoRot, setAutoRot] = useState(true)
	const [repeat,  setRepeat]  = useState(true)
	const [curve,   setCurve]   = useState(0)

	// Size in selected unit
	const [sizeValue, setSizeValue] = useState(8)
	const [sizeUnit,  setSizeUnit]  = useState<SizeUnit>("vw")

	// 3D mesh drop state
	const [meshPositions, setMeshPositions] = useState<CharPosition[] | null>(null)
	const [meshName,      setMeshName]      = useState<string | null>(null)
	const [meshError,     setMeshError]     = useState<string | null>(null)
	const [meshLoading,   setMeshLoading]   = useState(false)
	const [isDragging,    setIsDragging]    = useState(false)

	const fileInputRef = useRef<HTMLInputElement>(null)
	const dText = useDeferredValue(text)

	// ── SDF tab state ──────────────────────────────────────────────────────
	const [sdfShape,             setSdfShape]             = useState<WrapTypeShape>("sphere")
	const [sdfAutoRot,           setSdfAutoRot]           = useState(true)
	const [sdfCurvatureTracking, setSdfCurvatureTracking] = useState(true)
	const [sdfColor,             setSdfColor]             = useState("#ffffff")
	// fontSize in Three.js units (1 = 1 world unit); radius is fixed at 2
	const [sdfFontSize,      setSdfFontSize]      = useState(0.15)
	const [sdfLetterSpacing, setSdfLetterSpacing] = useState(0)

	// ── Derived values — memoised to avoid redundant DOM reads ────────────

	/** Font size in CSS pixels, derived from current unit value. */
	const fontSizePx = useMemo(() => toPx(sizeValue, sizeUnit), [sizeValue, sizeUnit])

	/** Unit config for the currently selected size unit. */
	const cfg = useMemo(() => UNIT_CFG[sizeUnit], [sizeUnit])

	/** Human-readable size label shown above the range slider. */
	const sizeLabel = useMemo(() => {
		const displayValue = sizeValue.toFixed(cfg.decimals)
		const pxHint = sizeUnit !== "px" ? ` ≈ ${Math.round(fontSizePx)}px` : ""
		return `${displayValue} ${sizeUnit}${pxHint}`
	}, [sizeValue, sizeUnit, cfg.decimals, fontSizePx])

	/** Shape used for the DOM scene — falls back to sphere when a custom mesh is loaded. */
	const domSceneShape = useMemo(
		() => meshPositions ? "sphere" : shape,
		[meshPositions, shape],
	)

	// ── Unit switching — preserve visual size ──────────────────────────────

	const changeUnit = useCallback((newUnit: SizeUnit) => {
		const currentPx = toPx(sizeValue, sizeUnit)
		const unitCfg   = UNIT_CFG[newUnit]
		const converted = fromPx(currentPx, newUnit)
		const stepped   = Math.round(converted / unitCfg.step) * unitCfg.step
		const clamped   = Math.min(unitCfg.max, Math.max(unitCfg.min, stepped))
		setSizeValue(Number(clamped.toFixed(unitCfg.decimals + 2)))
		setSizeUnit(newUnit)
	}, [sizeValue, sizeUnit])

	// ── 3D file loading ────────────────────────────────────────────────────

	const loadFile = useCallback(async (file: File) => {
		const ext = file.name.split(".").pop()?.toLowerCase()
		if (!["glb", "gltf", "obj"].includes(ext ?? "")) {
			setMeshError("Only .glb, .gltf, and .obj files are supported.")
			return
		}
		// Validate file size
		if (file.size > MAX_MESH_BYTES) {
			setMeshError("File exceeds the 20 MB limit. Reduce polygon count and re-export.")
			return
		}
		setMeshError(null)
		setMeshLoading(true)
		const url = URL.createObjectURL(file)
		try {
			let firstMesh: Mesh | null = null
			if (ext === "glb" || ext === "gltf") {
				const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js")
				const loader = new GLTFLoader()
				const gltf = await loader.loadAsync(url)
				gltf.scene.traverse((child: Object3D) => {
					if (!firstMesh && child instanceof Mesh) firstMesh = child
				})
			} else {
				const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js")
				const loader = new OBJLoader()
				const obj = await new Promise<Group>(
					(res, rej) => loader.load(url, res, undefined, rej),
				)
				obj.traverse((child: Object3D) => {
					if (!firstMesh && child instanceof Mesh) firstMesh = child
				})
			}
			if (!firstMesh) { setMeshError("No mesh found. Merge all objects into one before exporting."); return }
			const positions = getCharPositionsFromMesh(firstMesh, dText || "TYPE", { radius: 300 }, 250)
			setMeshPositions(positions)
			setMeshName(file.name)
			// Revoke after positions are computed — GLTFLoader may issue secondary fetches
			URL.revokeObjectURL(url)
		} catch {
			URL.revokeObjectURL(url)
			setMeshError("Failed to load the file. Check the format and try again.")
		} finally {
			setMeshLoading(false)
		}
	}, [dText])

	// ── Drag-and-drop ──────────────────────────────────────────────────────

	const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])

	/** Ignore drag-leave events that fire when the pointer moves over a child element. */
	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		const related = e.relatedTarget as Node | null
		if (related && e.currentTarget.contains(related)) return
		setIsDragging(false)
	}, [])

	const handleDrop = useCallback(async (e: React.DragEvent) => {
		e.preventDefault(); setIsDragging(false)
		const file = e.dataTransfer.files[0]; if (file) await loadFile(file)
	}, [loadFile])

	const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]; if (file) await loadFile(file); e.target.value = ""
	}, [loadFile])

	const clearMesh = useCallback(() => { setMeshPositions(null); setMeshName(null); setMeshError(null) }, [])

	return (
		<div className="w-full flex flex-col gap-6">

			{/* Renderer tab bar */}
			<div
				role="tablist"
				aria-label="Renderer mode"
				className="flex w-full rounded-lg overflow-hidden text-xs"
				style={{ border: "1px solid color-mix(in oklch, var(--foreground) 12%, transparent)" }}
			>
				<button
					role="tab"
					aria-selected={renderer === "dom"}
					aria-controls="renderer-panel"
					id="tab-dom"
					onClick={() => setRenderer("dom")}
					title="Switch to the DOM renderer — text wraps as real HTML spans using CSS3DRenderer"
					className="flex-1 flex flex-col items-center gap-1 px-4 py-3 transition-colors text-center"
					style={{
						background: renderer === "dom" ? "color-mix(in oklch, var(--foreground) 8%, transparent)" : "transparent",
						borderRight: "1px solid color-mix(in oklch, var(--foreground) 12%, transparent)",
					}}
				>
					<span className={`uppercase tracking-[0.18em] font-medium transition-colors ${renderer === "dom" ? "text-foreground" : "text-subtle"}`}>
						DOM — CSS3D
					</span>
					<span className={`text-[10px] transition-colors ${renderer === "dom" ? "text-subtle" : "text-faint"}`}>
						Real HTML spans · variable fonts · composable
					</span>
				</button>
				<button
					role="tab"
					aria-selected={renderer === "sdf"}
					aria-controls="renderer-panel"
					id="tab-sdf"
					onClick={() => setRenderer("sdf")}
					title="Switch to the SDF renderer — text is GPU-rendered inside a WebGL canvas using troika-three-text"
					className="flex-1 flex flex-col items-center gap-1 px-4 py-3 transition-colors text-center"
					style={{
						background: renderer === "sdf" ? "color-mix(in oklch, var(--foreground) 8%, transparent)" : "transparent",
					}}
				>
					<span className={`uppercase tracking-[0.18em] font-medium transition-colors ${renderer === "sdf" ? "text-foreground" : "text-subtle"}`}>
						SDF — WebGL
					</span>
					<span className={`text-[10px] transition-colors ${renderer === "sdf" ? "text-subtle" : "text-faint"}`}>
						GPU text · troika · native surface curvature
					</span>
				</button>
			</div>

			{/* ── DOM TAB ─────────────────────────────────────────────────── */}
			{renderer === "dom" && (
				<div role="tabpanel" id="renderer-panel" aria-labelledby="tab-dom">
					{/* Scene — drag-drop target */}
					<div
						className={`rounded-xl overflow-hidden relative transition-all ${isDragging ? "ring-2 ring-foreground/40" : ""}`}
						style={{ height: "500px", background: "var(--panel)" }}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
					>
						<div
							aria-label="3D typography visualisation — drag to orbit, scroll to zoom"
							role="img"
							className="w-full h-full"
						>
							<WrapTypeScene
								text={dText}
								shape={domSceneShape}
								fill={fill}
								fontSize={fontSizePx}
								fontFamily={FONT_FAMILY}
								fontWeight={FONT_WEIGHT}
								radius={300}
								color="rgba(220,210,255,0.9)"
								autoRotate={autoRot}
								autoRotateSpeed={0.5}
								repeat={repeat}
								characterCurve={curve}
								positions={meshPositions ?? undefined}
								style={{ width: "100%", height: "100%" }}
							/>
						</div>

						{/* Touch hint — shown only on small screens */}
						<div className="absolute bottom-4 left-4 sm:hidden pointer-events-none">
							<p className="text-[10px] text-subtle tracking-wide">Touch to orbit · pinch to zoom</p>
						</div>

						{isDragging && (
							<div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: "var(--panel)" }}>
								<p className="text-foreground/80 text-sm tracking-widest uppercase">Drop to wrap</p>
							</div>
						)}
						{meshLoading && (
							<div
								className="absolute inset-0 flex items-center justify-center pointer-events-none"
								style={{ background: "var(--panel)" }}
								role="status"
								aria-live="polite"
							>
								<p className="text-foreground/60 text-xs tracking-widest uppercase">Loading mesh…</p>
							</div>
						)}
						{meshName && !isDragging && (
							<div className="absolute top-3 left-3 flex items-center gap-2">
								<span className="text-xs text-subtle font-mono">{meshName}</span>
								<button onClick={clearMesh} className="text-xs text-faint hover:text-muted transition-colors leading-none" aria-label="Clear custom mesh" title="Remove the custom 3D mesh and return to the built-in shape selector">✕</button>
							</div>
						)}
						{!meshPositions && !isDragging && !meshLoading && (
							<>
								{/*
									Use a <label> wrapping the hidden <input> — the only pattern that
									reliably opens the file picker on iOS Safari without a programmatic .click().
								*/}
								<label
									htmlFor="mesh-file-input"
									title="Load a custom 3D mesh (.glb, .gltf, or .obj) — text will wrap around its surface"
									className="absolute bottom-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-subtle hover:text-muted transition-colors cursor-pointer"
									style={{ border: "1.5px dashed currentColor", borderRadius: "6px" }}
								>
									<UploadIcon />
									Drop or click — .glb / .gltf / .obj
									<input
										id="mesh-file-input"
										ref={fileInputRef}
										type="file"
										accept=".glb,.gltf,.obj"
										className="sr-only"
										aria-label="Load 3D file"
										onChange={handleFileInput}
									/>
								</label>
							</>
						)}
					</div>

					{/* Mesh error — announced to screen readers */}
					{meshError && (
						<p role="alert" className="text-xs opacity-70 mt-3" style={{ color: "rgba(255,120,120,0.9)" }}>{meshError}</p>
					)}

					{/* DOM Controls */}
					<div
						className={`grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs transition-opacity mt-4 ${meshPositions ? "opacity-30 pointer-events-none select-none" : ""}`}
						aria-disabled={meshPositions ? "true" : undefined}
					>
						{meshPositions && (
							<p className="sm:col-span-2 text-xs text-muted italic">Controls are disabled while a custom mesh is loaded. Clear the mesh above to re-enable.</p>
						)}

						{/* Shape */}
						<div className="flex flex-col gap-2">
							<span id="dom-shape-label" className="uppercase tracking-[0.18em] font-medium text-muted">Shape</span>
							<div role="group" aria-labelledby="dom-shape-label" className="flex gap-2 flex-wrap">
								{DOM_SHAPES.map(s => (
									<button key={s.value} onClick={() => setShape(s.value)}
										aria-pressed={shape === s.value}
										title={s.title}
										className={`px-3 py-1.5 rounded-full border transition-colors ${shape === s.value ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
										{s.label}
									</button>
								))}
							</div>
						</div>

						{/* Fill */}
						<div className="flex flex-col gap-2">
							<span id="dom-fill-label" className="uppercase tracking-[0.18em] font-medium text-muted">Fill</span>
							<div role="group" aria-labelledby="dom-fill-label" className="flex gap-2 flex-wrap">
								{FILLS.map(f => (
									<button key={f.value} onClick={() => setFill(f.value)}
										aria-pressed={fill === f.value}
										title={f.title}
										className={`px-3 py-1.5 rounded-full border transition-colors ${fill === f.value ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
										{f.label}
									</button>
								))}
							</div>
						</div>

						{/* Size — value slider + unit picker */}
						<div className="flex flex-col gap-2 sm:col-span-2">
							<div className="flex items-baseline justify-between">
								<span id="dom-size-label" className="uppercase tracking-[0.18em] font-medium text-muted">Size — {sizeLabel}</span>
								<div role="group" aria-label="Font size unit" className="flex gap-1">
									{SIZE_UNITS.map(u => (
										<button
											key={u}
											onClick={() => changeUnit(u)}
											aria-pressed={sizeUnit === u}
											title={`Set font size unit to ${u}`}
											className={`px-2 py-0.5 rounded text-xs transition-colors font-mono ${
												sizeUnit === u ? "bg-foreground/15 text-foreground" : "text-subtle hover:text-muted"
											}`}
										>
											{u}
										</button>
									))}
								</div>
							</div>
							<input
								type="range"
								min={cfg.min}
								max={cfg.max}
								step={cfg.step}
								value={sizeValue}
								onChange={e => setSizeValue(Number(e.target.value))}
								aria-label={`Font size in ${sizeUnit}`}
								aria-labelledby="dom-size-label"
								title={`Adjust the font size of the wrapped text (currently ${sizeLabel})`}
								className="w-full accent-white/60"
							/>
						</div>

						{/* Auto-rotate */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Rotation</span>
							<button onClick={() => setAutoRot(r => !r)}
								aria-pressed={autoRot}
								title={autoRot ? "Pause automatic rotation of the 3D mesh" : "Resume automatic rotation of the 3D mesh"}
								className={`w-fit px-3 py-1.5 rounded-full border transition-colors ${autoRot ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
								{autoRot ? "Auto-rotating" : "Paused"}
							</button>
						</div>

						{/* Repeat */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Repeat</span>
							<button onClick={() => setRepeat(r => !r)}
								aria-pressed={repeat}
								title={repeat ? "Stop tiling — show the text string only once around the mesh" : "Tile the text string repeatedly to fill the entire surface"}
								className={`w-fit px-3 py-1.5 rounded-full border transition-colors ${repeat ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
								{repeat ? "Tiling" : "Once"}
							</button>
						</div>

						{/* Character curve */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Character curve — {Math.round(curve * 100)}%</span>
							<input
								type="range" min={0} max={100} step={1} value={Math.round(curve * 100)}
								onChange={e => setCurve(Number(e.target.value) / 100)}
								aria-label="Character curve amount"
								title="Rotate each character to follow the curvature of the mesh surface"
								className="w-full accent-white/60"
							/>
						</div>

						{/* Text */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Text</span>
							<textarea
								value={text}
								onChange={e => setText(e.target.value || DEFAULT_TEXT)}
								rows={1}
								aria-label="Text to wrap on the surface"
								title="The text string to wrap around the 3D mesh surface"
								placeholder={DEFAULT_TEXT}
								className="w-full bg-foreground/5 rounded px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
							/>
						</div>

					</div>

					<p className="text-xs text-muted italic mt-2" style={{ lineHeight: "1.8" }}>
						Drag to orbit. Scroll to zoom. Characters are measured with canvas
						measureText and justified to fill each row exactly — no fixed tracking.
						The flag animates each frame with no DOM writes.
					</p>
				</div>
			)}

			{/* ── SDF TAB ─────────────────────────────────────────────────── */}
			{renderer === "sdf" && (
				<div role="tabpanel" id="renderer-panel" aria-labelledby="tab-sdf">
					{/* Canvas */}
					<div
						className="rounded-xl overflow-hidden"
						style={{ height: "500px", background: "var(--panel)" }}
					>
						<SdfErrorBoundary rendererKey={renderer}>
						<Suspense fallback={
							<div
								className="w-full h-full flex items-center justify-center"
								role="status"
								aria-live="polite"
							>
								<span className="text-xs text-subtle tracking-[0.18em] uppercase">Loading WebGL…</span>
							</div>
						}>
							<SDFCanvas
								text={dText}
								shape={sdfShape}
								autoRotate={sdfAutoRot}
								curvatureTracking={sdfCurvatureTracking}
								color={sdfColor}
								fontSize={sdfFontSize}
								letterSpacing={sdfLetterSpacing}
							/>
						</Suspense>
						</SdfErrorBoundary>
					</div>

					{/* SDF Controls */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mt-4">

						{/* Shape */}
						<div className="flex flex-col gap-2">
							<span id="sdf-shape-label" className="uppercase tracking-[0.18em] font-medium text-muted">Shape</span>
							<div role="group" aria-labelledby="sdf-shape-label" className="flex gap-2 flex-wrap">
								{SDF_SHAPES.map(s => (
									<button key={s.value} onClick={() => setSdfShape(s.value)}
										aria-pressed={sdfShape === s.value}
										title={s.title}
										className={`px-3 py-1.5 rounded-full border transition-colors ${sdfShape === s.value ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
										{s.label}
									</button>
								))}
							</div>
						</div>

						{/* Auto-rotate */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Rotation</span>
							<button onClick={() => setSdfAutoRot(r => !r)}
								aria-pressed={sdfAutoRot}
								title={sdfAutoRot ? "Pause automatic rotation of the 3D mesh" : "Resume automatic rotation of the 3D mesh"}
								className={`w-fit px-3 py-1.5 rounded-full border transition-colors ${sdfAutoRot ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
								{sdfAutoRot ? "Auto-rotating" : "Paused"}
							</button>
						</div>

						{/* Curvature tracking */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Curvature tracking</span>
							<button onClick={() => setSdfCurvatureTracking(v => !v)}
								aria-pressed={sdfCurvatureTracking}
								title={sdfCurvatureTracking ? "Disable curvature tracking — text will lay flat rather than conforming to the surface normal" : "Enable curvature tracking — text bends to follow the exact curvature of the mesh surface"}
								className={`w-fit px-3 py-1.5 rounded-full border transition-colors ${sdfCurvatureTracking ? "border-foreground/60 bg-foreground/10" : "border-foreground/20 hover:border-foreground/40"}`}>
								{sdfCurvatureTracking ? "On" : "Off"}
							</button>
						</div>

						{/* Scale */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Scale — {sdfFontSize.toFixed(3)} u</span>
							<input
								type="range" min={0.04} max={0.4} step={0.01} value={sdfFontSize}
								onChange={e => setSdfFontSize(Number(e.target.value))}
								aria-label="SDF font size in Three.js units"
								title="Adjust the size of the GPU-rendered text in Three.js world units (mesh radius is 2 units)"
								className="w-full accent-white/60"
							/>
						</div>

						{/* Letter spacing */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Tracking — {sdfLetterSpacing.toFixed(3)} u</span>
							<input
								type="range" min={-0.05} max={0.2} step={0.005} value={sdfLetterSpacing}
								onChange={e => setSdfLetterSpacing(Number(e.target.value))}
								aria-label="SDF letter spacing in Three.js units"
								title="Adjust the spacing between characters in Three.js world units — negative values tighten, positive values open up the tracking"
								className="w-full accent-white/60"
							/>
						</div>

						{/* Color */}
						<div className="flex flex-col gap-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Color</span>
							<div className="flex items-center gap-3">
								{/* Wrapper brings tap target to ≥44px and provides a visible label */}
								<label className="flex items-center gap-2 cursor-pointer">
									<span className="text-xs text-muted">Pick</span>
									<input
										type="color" value={sdfColor}
										onChange={e => setSdfColor(e.target.value)}
										aria-label="SDF text color"
										title="Choose the fill color for the GPU-rendered text"
										className="w-11 h-11 rounded cursor-pointer bg-transparent border border-foreground/20 p-0.5"
									/>
								</label>
								<span className="font-mono text-muted">{sdfColor}</span>
							</div>
						</div>

						{/* Text */}
						<div className="flex flex-col gap-2 sm:col-span-2">
							<span className="uppercase tracking-[0.18em] font-medium text-muted">Text</span>
							<textarea
								value={text}
								onChange={e => setText(e.target.value || DEFAULT_TEXT)}
								rows={1}
								aria-label="Text to wrap on the surface"
								title="The text string to wrap around the 3D mesh surface"
								placeholder={DEFAULT_TEXT}
								className="w-full bg-foreground/5 rounded px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
							/>
						</div>

					</div>

					<p className="text-xs text-muted italic mt-2" style={{ lineHeight: "1.8" }}>
						SDF mode uses troika-three-text for GPU-rendered anti-aliased text
						inside a WebGL canvas. Each word is a separate mesh curved to the
						surface via troika&rsquo;s native <code className="font-mono">curveRadius</code> property.
						Unlike DOM mode, SDF text can receive lighting, shadows, and post-processing.
					</p>
				</div>
			)}
		</div>
	)
}
