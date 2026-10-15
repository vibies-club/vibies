import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./frontend", import.meta.url));
export default defineConfig({
  root,
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), cloudflare({ configPath: fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)), viteEnvironment: { name: "server" } })],
  environments: {
    client: { build: { outDir: fileURLToPath(new URL("./dist/client", import.meta.url)), emptyOutDir: true } },
    server: { build: { outDir: fileURLToPath(new URL("./dist/server", import.meta.url)), emptyOutDir: true } },
  },
  build: { sourcemap: false },
});
