/**
 * `cn` comes from the design system. This shim keeps `@/lib/utils` working
 * for app-local shadcn components (the CLI writes that import) without a
 * second tailwind-merge that does not know the type scale.
 */
export { cn } from "@aisocratic/stoa"
