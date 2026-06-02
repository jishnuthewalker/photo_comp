import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: { port: 1421 },
  build: {
    target: ["es2021", "chrome100"],
    outDir: "dist",
  },
  resolve: {
    alias: {
      "@framecut/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
