import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    base: './', // Relative paths for GitHub Pages
    define: {
        'import.meta.env.VITE_STATIC_MODE': JSON.stringify('true')
    },
    build: {
        outDir: '../docs',
        emptyOutDir: false, // Don't delete data.json and images
        sourcemap: false,
        minify: 'esbuild'
    }
})
