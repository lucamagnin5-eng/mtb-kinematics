import { defineConfig } from "vite";

// Réglages recommandés par Tauri : port fixe, pas d'effacement de la console.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist" },
});
