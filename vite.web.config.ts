import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Version web autonome (un seul fichier HTML) pour tester sans installeur.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: "es2022", outDir: "dist-web", assetsInlineLimit: 100_000_000 },
});
