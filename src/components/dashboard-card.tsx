import { cn } from "@/lib/utils";
import * as React from "react";
import { Card } from "@/components/ui/card";

/* The dashboard's card shell: square corners and no shadow or ring, because
 * these sit in a hairline grid where the 1px gaps between cells do the
 * separating. A radius and a shadow on each cell would fight that.
 *
 * forwardRef for the same React 18 reason as Card itself — the calendar
 * snapshots its own card to a PNG, and a ref that stops here is a ref that
 * never arrives. */
export const DashboardCard = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof Card>
>(function DashboardCard({ className, ...props }, ref) {
	return (
		<Card
			ref={ref}
			className={cn("rounded-none bg-background shadow-none ring-0", className)}
			{...props}
		/>
	);
});
