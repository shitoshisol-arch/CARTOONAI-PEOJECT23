import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/. Set VITE_BASE at build
  // time; local development and root-domain deploys keep "/".
  base: process.env.VITE_BASE || "/",
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  define: {
    global: "globalThis",
  },
  server: {
    port: 5173,
  },
  build: {
    target: "es2020",
    sourcemap: false,
  },
});
