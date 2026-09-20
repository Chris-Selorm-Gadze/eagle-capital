"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	readChoice,
	resolveTheme,
	setThemeChoice,
	subscribeTheme,
	type ThemeChoice,
} from "@/lib/theme";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

/* app-shell-5 ships this as a single icon button that flips between light and
 * dark. Three states instead, because the two-state version has no way to say
 * "follow the OS" — it looks identical on first load and then silently stops
 * tracking the system setting the moment you touch it.
 *
 * The trigger shows the RESOLVED theme (what you're looking at); the menu shows
 * the CHOICE (what you asked for). Those differ precisely in the "System" case,
 * which is the case worth being able to see. */

const OPTIONS: { choice: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
	{ choice: "light", label: "Light", icon: SunIcon },
	{ choice: "dark", label: "Dark", icon: MoonIcon },
	{ choice: "system", label: "System", icon: MonitorIcon },
];

export function ThemeSwitcher() {
	const [choice, setChoice] = useState<ThemeChoice>(() => readChoice());
	const [resolved, setResolved] = useState(() => resolveTheme(readChoice()));

	// One subscription covers both an explicit change made here and the OS
	// setting moving underneath a "system" choice.
	useEffect(
		() =>
			subscribeTheme(() => {
				const next = readChoice();
				setChoice(next);
				setResolved(resolveTheme(next));
			}),
		[],
	);

	const TriggerIcon = resolved === "dark" ? MoonIcon : SunIcon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					aria-label={`Theme: ${choice}`}
					className="text-muted-foreground"
					size="icon-sm"
					variant="ghost"
				>
					<TriggerIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-36">
				{OPTIONS.map(({ choice: value, label, icon: Icon }) => (
					<DropdownMenuItem key={value} onClick={() => setThemeChoice(value)}>
						<Icon />
						<span className="flex-1">{label}</span>
						{/* Marks the choice, not the resolved theme — so "System" stays
						    ticked on a dark OS rather than the tick jumping to "Dark". */}
						{choice === value && <CheckIcon className="size-3.5 opacity-60" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
