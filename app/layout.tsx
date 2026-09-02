import type React from "react"
import type { Metadata } from "next"
import { Space_Grotesk, JetBrains_Mono, Newsreader } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

// All three faces are OFL-licensed and self-hosted at build time by
// next/font/google — no font files in this repo, and no runtime request to
// gstatic (so no third-party font fetch to disclose).
const spaceGrotesk = Space_Grotesk({
  weight: ["400", "500"],
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
})

// Newsreader is variable 200–800 with a true italic. Only the 200 is loaded:
// headings on a board are chrome, and the extra-light serif is what gives the
// dense card grid a horizon line without adding visual weight.
const newsreader = Newsreader({
  weight: ["200"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Agora",
  description: "A kanban board built for humans and coding agents.",
  // A board is somebody's private working state, wherever it is deployed.
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${newsreader.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
