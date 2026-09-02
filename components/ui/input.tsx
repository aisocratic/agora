import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'

import { controlSize, fieldVariants } from '@/lib/ui/control-variants'
import { cn } from '@/lib/utils'

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<'input'> & {
  variant?: VariantProps<typeof fieldVariants>['variant']
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldVariants({ variant }),
        controlSize.default,
        'selection:bg-primary selection:text-primary-foreground file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
