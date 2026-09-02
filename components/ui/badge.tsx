import type { ComponentProps } from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { controlColor } from "@/lib/ui/control-variants"
import { cn } from "@/lib/utils"

export type BadgeTone =
  | "success"
  | "warning"
  | "caution"
  | "danger"
  | "info"
  | "highlight"
  | "accent"
  | "neutral"

/**
 * Backwards-compatible alias for the badge tone union. Prefer `BadgeTone`.
 */

type BadgeSize = "compact" | "default"
type BadgeShape = "rounded" | "pill"

const toneClasses: Record<BadgeTone, string> = {
  success: "bg-green-500/10 text-green-500",
  warning: "bg-yellow-500/10 text-yellow-500",
  caution: "bg-orange-500/10 text-orange-500",
  danger: "bg-red-500/10 text-red-500",
  info: "bg-blue-500/10 text-blue-500",
  highlight: "bg-cyan-500/10 text-cyan-500",
  accent: "bg-purple-500/10 text-purple-500",
  neutral: "bg-muted text-muted-foreground",
}

const interactiveToneClasses: Record<BadgeTone, string> = {
  success: "hover:bg-green-500/20",
  warning: "hover:bg-yellow-500/20",
  caution: "hover:bg-orange-500/20",
  danger: "hover:bg-red-500/20",
  info: "hover:bg-blue-500/20",
  highlight: "hover:bg-cyan-500/20",
  accent: "hover:bg-purple-500/20",
  neutral: "hover:bg-muted/80",
}

/**
 * Tone classes for elements that can't render a `Badge` (e.g. a shadcn
 * `Button` that needs a status tint). Keeps status colors in one place —
 * never inline `bg-*-500/10`.
 */
export const statusBadgeToneClasses: Readonly<Record<BadgeTone, string>> = toneClasses

const sizeClasses: Record<BadgeSize, string> = {
  compact: "px-2 py-0.5",
  default: "px-2 py-1",
}

const shapeClasses: Record<BadgeShape, string> = {
  rounded: "rounded",
  pill: "rounded-full",
}

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: cn("border-transparent", controlColor.default),
        secondary: cn("border-transparent", controlColor.secondary),
        destructive: cn(
          "border-transparent",
          controlColor.destructive,
          "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        ),
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

type BadgeBaseProps = ComponentProps<"span"> & { asChild?: boolean }

/**
 * Themed-mode props: the shadcn-style bordered badge selected by `variant`
 * (default/secondary/destructive/outline). `tone` is absent in this mode.
 */
type BadgeThemedProps = BadgeBaseProps &
  VariantProps<typeof badgeVariants> & {
    tone?: never
    size?: never
    shape?: never
    interactive?: never
  }

/**
 * Status-mode props: the borderless, mono-font pill tinted by a semantic
 * `tone`. Selecting any `tone` switches the component into status mode.
 */
type BadgeStatusProps = BadgeBaseProps & {
  tone: BadgeTone
  size?: BadgeSize
  shape?: BadgeShape
  interactive?: boolean
  variant?: never
}

export type BadgeProps = BadgeThemedProps | BadgeStatusProps

/**
 * `Badge` is the single, unified badge primitive. It renders in one of two
 * modes:
 *
 * - **Themed mode** (default): shadcn-style bordered badge selected by
 *   `variant` (default/secondary/destructive/outline), `font-medium`,
 *   `rounded-md`, focus rings, svg sizing.
 * - **Status mode**: pass a semantic `tone` to get the borderless, mono-font
 *   pill used for status/role/approval indicators (with optional `size`,
 *   `shape`, `interactive`).
 *
 * The presence of a `tone` prop is the discriminant: `<Badge tone="success" />`
 * is a status badge, `<Badge variant="secondary" />` (or `<Badge />`) is a
 * themed badge.
 */
export function Badge(props: BadgeProps) {
  if (props.tone !== undefined) {
    const {
      tone,
      size = "compact",
      shape = "rounded",
      interactive = false,
      asChild = false,
      className,
      ...rest
    } = props
    const Comp = asChild ? Slot : "span"

    return (
      <Comp
        data-slot="badge"
        className={cn(
          "inline-flex items-center gap-1 font-mono text-xs",
          toneClasses[tone],
          sizeClasses[size],
          shapeClasses[shape],
          interactive && "transition-colors",
          interactive && interactiveToneClasses[tone],
          className,
        )}
        {...rest}
      />
    )
  }

  const { className, variant, asChild = false, ...rest } = props
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...rest}
    />
  )
}
