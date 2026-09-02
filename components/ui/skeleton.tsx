import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-muted/70 dark:bg-muted/50 animate-skeleton-pulse rounded-md', className)}
      {...props}
    />
  )
}

// Text line skeleton - for single lines of text
function SkeletonText({
  className,
  width = 'full',
  ...props
}: React.ComponentProps<'div'> & { width?: 'full' | '3/4' | '1/2' | '1/4' | '1/3' }) {
  const widthClasses = {
    'full': 'w-full',
    '3/4': 'w-3/4',
    '1/2': 'w-1/2',
    '1/4': 'w-1/4',
    '1/3': 'w-1/3',
  }

  return (
    <Skeleton
      className={cn('h-4', widthClasses[width], className)}
      {...props}
    />
  )
}

// Avatar skeleton - circular placeholder for profile images
function SkeletonAvatar({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<'div'> & { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizeClasses = {
    'sm': 'w-8 h-8',
    'md': 'w-10 h-10',
    'lg': 'w-16 h-16',
    'xl': 'w-24 h-24',
  }

  return (
    <Skeleton
      className={cn('rounded-full', sizeClasses[size], className)}
      {...props}
    />
  )
}

// Image skeleton - for cover images and thumbnails
function SkeletonImage({
  className,
  aspectRatio = 'video',
  ...props
}: React.ComponentProps<'div'> & { aspectRatio?: 'video' | 'square' | 'wide' }) {
  const aspectClasses = {
    'video': 'aspect-video',
    'square': 'aspect-square',
    'wide': 'aspect-[3/1]',
  }

  return (
    <Skeleton
      className={cn('w-full', aspectClasses[aspectRatio], className)}
      {...props}
    />
  )
}

// Card skeleton - for blog posts, updates, etc.
function SkeletonCard({
  className,
  hasImage = true,
  lines = 3,
  ...props
}: React.ComponentProps<'div'> & { hasImage?: boolean; lines?: number }) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn(
        'border border-border rounded-xl overflow-hidden bg-card',
        className
      )}
      {...props}
    >
      {hasImage && <SkeletonImage aspectRatio="video" className="rounded-none" />}
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-2/3" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === lines - 1 ? 'w-1/2' : 'w-full')}
          />
        ))}
        <div className="flex items-center gap-2 pt-2">
          <SkeletonAvatar size="sm" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  )
}

// Table skeleton - for leaderboard-style tables
function SkeletonTable({
  className,
  rows = 5,
  columns = 4,
  ...props
}: React.ComponentProps<'div'> & { rows?: number; columns?: number }) {
  return (
    <div
      data-slot="skeleton-table"
      className={cn(
        'border border-border rounded-xl overflow-hidden bg-card',
        className
      )}
      {...props}
    >
      <div className="p-4 border-b border-border">
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                className={cn(
                  'h-4',
                  colIndex === 0 ? 'w-8' : colIndex === 1 ? 'flex-1' : 'w-16'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTable,
}
