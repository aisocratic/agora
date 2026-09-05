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
      // Site content and generated assets; the shared board is linted in components/.
      "site/**",
      ".github/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
]

export default config
