import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'

import { fieldVariants } from '@/lib/ui/control-variants'
import { cn } from '@/lib/utils'

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<'textarea'> & {
  variant?: VariantProps<typeof fieldVariants>['variant']
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldVariants({ variant }),
        'h-auto min-h-16 px-3 py-2 field-sizing-content',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
