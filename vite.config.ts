import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "client",
  envDir: path.resolve(__dirname),
  publicDir: "../public",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
