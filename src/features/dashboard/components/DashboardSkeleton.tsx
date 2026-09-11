import { Skeleton } from '@/components/ui/skeleton'

/* Shown while the first Supabase fetch is in flight.
 *
 * Before this existed, `useSupabaseData`'s `loading` flag was computed and then
 * never read, so every page load rendered a fully-zeroed dashboard — $0, 0.0%,
 * empty charts — before snapping to real numbers. That reads as "you have no
 * data", which is a different and much worse message than "loading". */

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your desk…</span>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="flex flex-col gap-3 bg-card p-4" key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4" key={i}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-56 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
