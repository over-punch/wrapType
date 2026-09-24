import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import SiteHeader from "../components/SiteHeader"

const inter = Inter({
	subsets: ["latin"],
	weight: ["300", "900"],
	variable: "--font-inter",
	display: "swap",
})

export const metadata: Metadata = {
	title: "wrapType — Real DOM text on any 3D surface | Type Tools",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description: "Wrap real HTML text across a sphere, cylinder, torus, plane, flag, stool, or custom mesh using Three.js CSS3DRenderer. Variable fonts, CSS animations, and hover states all compose naturally — no canvas, no textures.",
	keywords: ["typography", "3d", "three.js", "mesh", "surface", "css3d", "text-wrap", "webgl", "TypeScript", "npm", "react", "variable font", "css3drenderer", "orbit camera", "wraptype", "liiift"],
	openGraph: {
		title: "wrapType — Real DOM text on any 3D surface | Type Tools",
		description: "Wrap real HTML text across a sphere, cylinder, torus, plane, flag, stool, or custom mesh. Variable fonts, CSS animations, and hover states all compose naturally — no canvas, no textures.",
		url: "https://wraptype.com",
		siteName: "wrapType",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "wrapType — Real DOM text on any 3D surface | Type Tools",
		description: "Wrap real HTML text across a sphere, cylinder, torus, plane, flag, stool, or custom mesh. Variable fonts, CSS animations, and hover states all compose naturally — no canvas, no textures.",
	},
	metadataBase: new URL("https://wraptype.com"),
	alternates: { canonical: "https://wraptype.com" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full antialiased ${inter.variable}`}>
			<body className="min-h-full flex flex-col">
				<SiteHeader current="wrapType" githubUrl="https://github.com/over-punch/wrapType" />{children}</body>
		</html>
	)
}
