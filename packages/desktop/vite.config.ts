import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@framecut/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
