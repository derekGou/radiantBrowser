// vite.main.config.ts
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        rollupOptions: {
            external: ["better-sqlite3"]
        }
    },
    optimizeDeps: {
        exclude: ["better-sqlite3"]
    }
});
