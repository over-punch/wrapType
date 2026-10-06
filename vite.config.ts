// vite.config.ts — library-mode build for ESM + CJS + types, dual entry (css3d + r3f)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

export default defineConfig({
	plugins: [
		react(),
		dts({ include: ['src'], exclude: ['src/__tests__/**'], rollupTypes: true }),
	],
	build: {
		lib: {
			entry: {
				index: 'src/index.ts',
				core:  'src/core.ts',
				sdf:   'src/sdf.ts',
				r3f:   'src/r3f.ts',
			},
			formats: ['es', 'cjs'],
			fileName: (format, entryName) =>
				`${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
		},
		rollupOptions: {
			external: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'three',
				/^three\//,
				'@react-three/fiber',
				'troika-three-text',
			],
			output: {
				globals: {
					react:                  'React',
					'react-dom':            'ReactDOM',
					three:                  'THREE',
					'@react-three/fiber':   'ReactThreeFiber',
					'troika-three-text':    'TroikaThreeText',
				},
			},
		},
	},
})
