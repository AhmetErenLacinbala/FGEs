import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
    build: {
        lib: {
            entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
            formats: ["es"],
            fileName: () => "fges.js",
        },
        rollupOptions: {
            external: ["@gltf-transform/core", "gl-matrix"],
        },
        sourcemap: true,
    },
});
