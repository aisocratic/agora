import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@aisocratic/design/components/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import { fontClassName } from "./fonts"

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
    <html lang="en" className={fontClassName} suppressHydrationWarning>
      <body className="antialiased">
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
