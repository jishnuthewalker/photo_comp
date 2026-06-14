import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Root vite.config — kept for tooling compatibility.
// Actual builds run from packages/desktop and packages/web.
export default defineConfig({
  plugins: [react()],
});
