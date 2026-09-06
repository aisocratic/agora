import { JetBrains_Mono, Newsreader, Space_Grotesk } from "next/font/google"

// All three faces are OFL and self-hosted at build time by next/font/google:
// no font files in this repo, no runtime request to gstatic. next/font must be
// called in app source, so this file fills the design system's three slots.
export const body = Space_Grotesk({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--aisocratic-font-body",
})

// Extra-light headings and regular card titles share the same serif family.
export const display = Newsreader({
  weight: ["200", "400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--aisocratic-font-display",
})

export const code = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--aisocratic-font-code",
})

export const fontClassName = `${body.variable} ${display.variable} ${code.variable}`
