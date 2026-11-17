import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pocketbase = {
  "/api": {
    target: "http://127.0.0.1:8090",
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: pocketbase,
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: pocketbase,
    headers: {
      "Cache-Control": "no-store",
    },
  },
});
