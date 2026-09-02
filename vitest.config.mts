import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // Tailwind's PostCSS plugin has nothing to do during a test run, and loading
  // it costs a second per worker.
  css: { postcss: false },
  test: {
    globals: true,
    // Node by default: most of Agora's tests are SQL and pure functions. A test
    // that needs a DOM opts in with `// @vitest-environment jsdom` at the top.
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "lib/**/*.test.ts"],
  },
})
