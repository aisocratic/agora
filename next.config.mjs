/** @type {import('next').NextConfig} */

// Baseline hardening for a self-hosted app that is never meant to be embedded.
// HSTS is deliberately left to the reverse proxy: Agora is often run over plain
// HTTP on localhost or a private network, and a stray HSTS header there would
// pin browsers to an HTTPS origin that does not exist.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
]

const nextConfig = {
  // `standalone` keeps the Docker image to the server plus only the node_modules
  // it actually reaches, which matters because the published image is how most
  // people will run Agora.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "@aisocratic/design",
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
