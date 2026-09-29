import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/* is proxied to FastAPI so the browser talks to one origin (SSE included).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
