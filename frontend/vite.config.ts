import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 3000,
    strictPort: false,
    watch: {
      // Five watchers run side by side in `npm run dev`. Every watched
      // directory costs an inotify instance, and the per-user cap is low
      // enough that build output and dependencies push it over.
      ignored: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        "**/*.tsbuildinfo",
      ],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // zod ships prose comments that mention `@__PURE__` while explaining
        // the real annotation on the next line. Rollup reads the prose as a
        // misplaced annotation and warns. It is upstream and harmless, so
        // drop it for dependencies while keeping every warning about our own
        // source.
        if (
          warning.code === "INVALID_ANNOTATION" &&
          warning.id?.includes("node_modules")
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
});
