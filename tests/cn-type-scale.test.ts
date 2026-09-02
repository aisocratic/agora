import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

/**
 * The regression this file exists for: tailwind-merge does not know that
 * `text-body` and friends are FONT SIZES, so by default it sorts them into the
 * text-COLOUR group and a later size class silently deletes an earlier colour.
 * Upstream that shipped a white-on-white button. `lib/utils.ts` teaches the
 * merger the scale; these assertions are what keep that list in step with the
 * `--text-*` tokens in app/globals.css.
 */
const TYPE_SCALE = [
  "micro",
  "body",
  "lead",
  "title",
  "section",
  "page",
  "display",
  "hero",
  "mega",
] as const

describe("cn", () => {
  it.each(TYPE_SCALE)("keeps a text colour when merging text-%s over it", (step) => {
    const result = cn("bg-primary text-primary-foreground", `text-${step}`)
    expect(result).toContain("text-primary-foreground")
    expect(result).toContain(`text-${step}`)
  })

  it("still lets a later text colour win over an earlier one", () => {
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground")
  })

  it("still collapses two sizes from the scale to the last one", () => {
    expect(cn("text-body", "text-lead")).toBe("text-lead")
  })

  it("does not confuse a scale step with Tailwind's own sizes", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body")
  })

  it("merges ordinary conflicting utilities as usual", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })
})
