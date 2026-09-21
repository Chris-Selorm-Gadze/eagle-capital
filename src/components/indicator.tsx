import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

/* @efferd/indicator, with one change: the block hardcodes Tailwind palette
 * classes (`text-emerald-500`, `text-rose-500`, `text-amber-500`,
 * `text-sky-500`), which are four colours this product doesn't otherwise use and
 * which don't move when the theme does. The variants are named for what they
 * MEAN here and resolve to the same semantic tokens the rest of the app reads,
 * so a live dot and a green P&L figure are the same green.
 *
 * The ping is the outer ring; the dot is the solid centre. `pulse={false}` for a
 * state that is simply true — connected, idle — rather than one actively
 * happening, since a ring pulsing forever stops meaning anything. */
const statusIndicatorVariants = cva(
	[
		"relative flex size-2 shrink-0 items-center justify-center rounded-full",
		"*:rounded-full *:bg-current",
		"[&_[data-slot=indicator-dot]]:size-[75%]",
		"[&_[data-slot=indicator-ping]]:absolute [&_[data-slot=indicator-ping]]:size-full",
	],
	{
		variants: {
			tone: {
				good: "text-(--good)",
				critical: "text-(--critical)",
				warning: "text-(--warning)",
				info: "text-(--data-accent)",
				muted: "text-muted-foreground",
			},
			pulse: {
				true: "[&_[data-slot=indicator-ping]]:animate-ping",
				false: "[&_[data-slot=indicator-ping]]:hidden",
			},
		},
		defaultVariants: {
			tone: "good",
			pulse: true,
		},
	},
);

export type StatusIndicatorProps = ComponentProps<"span"> &
	VariantProps<typeof statusIndicatorVariants>;

export function StatusIndicator({
	className,
	tone,
	pulse,
	...props
}: StatusIndicatorProps) {
	return (
		<span
			className={cn(statusIndicatorVariants({ tone, pulse }), className)}
			{...props}
		>
			<span aria-hidden data-slot="indicator-ping" />
			<span aria-hidden data-slot="indicator-dot" />
		</span>
	);
}
