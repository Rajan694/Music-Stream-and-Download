import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 3000,
    strictPort: true,
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
  build: { outDir: "dist", sourcemap: true },
});
