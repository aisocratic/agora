/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` keeps the Docker image to the server plus only the node_modules
  // it actually reaches, which matters because the published image is how most
  // people will run Agora.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
    ],
  },
}

export default nextConfig
