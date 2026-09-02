import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

/** Shared geometry + typography baseline for every interactive control. */
export const controlBase =
  "text-body font-medium rounded-lg transition-all duration-200 ease-out " +
  "outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed"

/** Height scale. `default` (h-8) is the canonical rung used everywhere. */
export const controlSize = {
  default: "h-8 px-3",
  sm: "h-7 px-2.5 text-micro",
  lg: "h-10 px-5",
  icon: "size-8",
} as const

/** Surface/color variants shared by buttons, chips, row-actions, badges. */
export const controlColor = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-border bg-transparent hover:bg-secondary",
  ghost: "hover:bg-secondary",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
} as const

/** Field surface for text inputs / textareas / select triggers. */
const fieldSurface =
  "w-full bg-input border border-input text-foreground placeholder:text-muted-foreground " +
  "focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30"

/**
 * Field variant for the public `variant` prop on form controls.
 * Empty / undefined resolves to the canonical field style; set only to deviate.
 */
export const fieldVariants = cva(cn(controlBase, fieldSurface), {
  variants: {
    variant: {
      default: "",
      ghost: "border-transparent bg-transparent shadow-none hover:bg-secondary",
    },
  },
  defaultVariants: { variant: "default" },
})
