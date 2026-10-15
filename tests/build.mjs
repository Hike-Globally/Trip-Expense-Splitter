// Bundles the app so the driver can import it into a jsdom window.
// Runs in its own process: Vite's build sets NODE_ENV=production, which would
// otherwise swap React for its production build (no `act`) in the test process.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  root,
  configFile: false,
  logLevel: "error",
  plugins: [react()],
  build: {
    ssr: path.join(root, "tests/entry.tsx"),
    outDir: path.join(root, "tests/.tmp"),
    emptyOutDir: true,
    minify: false,
  },
});
