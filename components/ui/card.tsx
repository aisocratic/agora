import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * The one card surface: background + border + radius.
 *
 * Exported as a raw class string for the cases that can't render a `<div>` —
 * a `<section>`, a `<Link>`, a `<button>`, or a component like `Collapsible`
 * that owns its own element. Everything else should use `<Card>`.
 *
 * The radius is deliberately fixed. Before this existed the same shell was
 * spelled out inline ~90 times, split between `rounded-lg` and `rounded-xl`
 * with no rule for which — so adjacent panels on the same admin page could
 * disagree about how round a card is.
 */
export const cardSurface = "bg-card border border-border rounded-xl"

/**
 * A plain card surface. Pass padding/spacing through `className` — this owns
 * only the background, border and radius so it can wrap anything.
 */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={cn(cardSurface, className)} {...props} />
}
