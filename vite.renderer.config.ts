import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['react', 'react-dom'],
    },
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                radiantNewtab: path.resolve(__dirname, 'radiant-newtab.html'),
                radiantSettings: path.resolve(__dirname, 'radiant-settings.html'),
                radiantHistory: path.resolve(__dirname, 'radiant-history.html'),
            },
        },
    },
})
