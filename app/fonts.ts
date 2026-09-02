import { JetBrains_Mono, Newsreader, Space_Grotesk } from "next/font/google"

// All three faces are OFL and self-hosted at build time by next/font/google:
// no font files in this repo, no runtime request to gstatic. next/font must be
// called in app source, so this file fills the design system's three slots.
export const body = Space_Grotesk({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--stoa-font-body",
})

// Newsreader is variable 200–800 with a true italic. Only the 200 is loaded:
// headings on a board are chrome, and the extra-light serif is what gives the
// dense card grid a horizon line without adding visual weight.
export const display = Newsreader({
  weight: ["200"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--stoa-font-display",
})

export const code = JetBrains_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--stoa-font-code",
})

export const fontClassName = `${body.variable} ${display.variable} ${code.variable}`
