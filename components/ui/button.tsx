import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { controlBase, controlColor, controlSize } from "@/lib/ui/control-variants"
import { Spinner } from "@/components/ui/spinner"

const buttonVariants = cva(
  cn(
    controlBase,
    "inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        default: controlColor.default,
        cta: cn(controlColor.default, "font-semibold shadow-lg shadow-primary/25"),
        // Prominent primary action shaped as a pill — sits flush in pill-style
        // toolbars (e.g. the /admin/todo "New task" button beside the view tabs).
        highlight: cn(controlColor.default, "rounded-full"),
        secondary: controlColor.secondary,
        outline: controlColor.outline,
        ghost: controlColor.ghost,
        destructive: controlColor.destructive,
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: controlSize.default,
        sm: controlSize.sm,
        xs: "h-8 px-3 text-xs",
        lg: controlSize.lg,
        icon: controlSize.icon,
        "icon-xs": "size-7",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * `loading` renders a `Spinner` before the button's children and disables the
 * button — the pattern ~30 call sites used to hand-roll as `disabled={saving}`
 * plus `{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}`. The
 * button's own `gap-2` owns the spacing, so no margin class is needed.
 *
 * Ignored when `asChild` is set: Slot requires exactly one child, so there is
 * nowhere to inject the spinner.
 */
function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }) {
  const Comp = asChild ? Slot : "button"
  const showSpinner = loading && !asChild

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? disabled : disabled || loading}
      aria-busy={showSpinner || undefined}
      {...props}
    >
      {showSpinner ? (
        <>
          <Spinner />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  )
}

export { Button, buttonVariants }
