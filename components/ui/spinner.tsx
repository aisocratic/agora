import type { ComponentProps } from "react"

import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl"

/**
 * One spelling per spinner size. Before this component the codebase had 20+
 * ways to write the same circle — `w-4 h-4 animate-spin`, `h-4 w-4 animate-spin`
 * and `size-4 animate-spin` were all in use for the identical 16px spinner.
 */
const spinnerSizes: Record<SpinnerSize, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-6",
  "2xl": "size-8",
}

export type SpinnerProps = Omit<ComponentProps<typeof Loader2>, "size"> & {
  size?: SpinnerSize
}

/**
 * The single loading-spinner primitive. Use it instead of importing `Loader2`
 * and hand-writing `animate-spin` plus a size pair.
 *
 * ```tsx
 * <Spinner />                          // 16px, inherits color
 * <Spinner size="lg" className="text-muted-foreground" />
 * ```
 *
 * Inside a `<Button>` prefer the button's own `loading` prop — it renders this
 * component and disables the button in one step.
 */
export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("animate-spin shrink-0", spinnerSizes[size], className)}
      {...props}
    />
  )
}
