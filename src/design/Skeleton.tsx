import { cn } from '../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-3.5 rounded-pill', className)} />
}

export function SkeletonLines({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5 py-1', className)} role="status" aria-label="Thinking">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === lines - 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  )
}
