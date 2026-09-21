import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { InfoIcon } from 'lucide-react'

/* The bordered tile every KPI row is built from — shared by the playbook stats
 * and the Prop Firm Manager summary.
 *
 * Converted onto shadcn Card, Badge and Tooltip. The old `info` affordance was
 * theme.css's `.info-icon`: a 13px circle drawn in CSS with its tooltip in a
 * `data-tooltip` attribute rendered through `::after`. That existed only because
 * the legacy pages had no tooltip primitive — it could not be dismissed with
 * Escape, never flipped when it would run off the viewport edge, and on a touch
 * screen there was no way to see it at all. Radix's tooltip handles all three.
 */
export function TileShell({
  label,
  info,
  badge,
  children,
}: {
  label: string
  info?: string
  badge?: string | number
  children: ReactNode
}) {
  return (
    <Card className="min-w-[130px] gap-0 py-3.5" size="sm">
      <div className="flex shrink-0 items-center justify-between gap-2 px-(--card-spacing)">
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          {label}
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* A button, so it's reachable by keyboard and announced as
                    something interactive. aria-label carries the text, which
                    would otherwise be read as the single letter "i". */}
                <Button
                  aria-label={info}
                  className="size-4 text-muted-foreground"
                  size="icon-xs"
                  variant="ghost"
                >
                  <InfoIcon className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-60">{info}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {badge !== undefined && (
          <Badge className="px-1.5 py-0 text-[0.7rem]" variant="secondary">{badge}</Badge>
        )}
      </div>
      {/* Centres each tile's own content within whatever height the surrounding
          grid stretches it to — without this, a tile holding a bare number sits
          top-aligned beside one holding a chart, with dead air below it. */}
      <div className="flex flex-1 flex-col justify-center px-(--card-spacing)">{children}</div>
    </Card>
  )
}
