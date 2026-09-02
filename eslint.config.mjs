import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescript from "eslint-config-next/typescript"

// eslint-config-next 16 ships native flat config, so there is no FlatCompat
// shim here — running these through @eslint/eslintrc throws on a circular
// plugin reference.
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "bin/**",
      "playwright-report/**",
      "test-results/**",
      // The GitHub Pages landing site is hand-written static HTML/CSS/JS with
      // no build step and no module system — it is not part of the app.
      "site/**",
      ".github/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
]

export default config
