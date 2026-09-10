import { cn } from "@/lib/utils";

/* The EagleCapital wordmark, served from /public.
 *
 * The supplied PNG is a 2172x724 canvas whose ink occupies only the middle
 * ~36% of the height (y 230-492), so sizing it by the element's height renders
 * the wordmark far smaller than the number suggests. Measured bounds:
 *   full lockup ink : x 148-2031, y 230-492
 *   mark only       : x 148-726  (578 x 262, roughly 2.2:1)
 * The constants below come from those measurements. */

const CANVAS_W = 2172;
const MARK_X = 148;
const MARK_Y = 230;
const MARK_W = 578;
const MARK_H = 262;

/** Full lockup. Height is ~2.7x the visible ink height because of the canvas padding. */
export function Logo({ className }: { className?: string }) {
	return (
		<img
			alt="EagleCapital"
			className={cn("h-10 w-auto max-w-none object-contain object-left dark:invert", className)}
			src="/eagle_logo.png"
		/>
	);
}

/**
 * Mark only, for the collapsed sidebar rail — the lockup is far too wide to
 * shrink into an icon slot. Cropped with a scaled background rather than a
 * second asset, so there's only ever one logo file to keep in sync.
 */
export function LogoIcon({
	className,
	width = 22,
}: {
	className?: string;
	width?: number;
}) {
	const scale = width / MARK_W;
	return (
		<span
			aria-hidden="true"
			className={cn("block shrink-0 bg-no-repeat dark:invert", className)}
			style={{
				width,
				height: MARK_H * scale,
				backgroundImage: "url(/eagle_logo.png)",
				backgroundSize: `${CANVAS_W * scale}px auto`,
				backgroundPosition: `${-MARK_X * scale}px ${-MARK_Y * scale}px`,
			}}
		/>
	);
}
