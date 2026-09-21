"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useKeypress } from "@/hooks/use-keypress";
import { visibleNavGroups } from "@/components/app-shared";
import { useAppNav } from "@/components/app-nav-context";
import { brokerSyncConfigured } from "@/lib/brokerSyncClient";
import type { NavKey } from "@/shared/routing";
import { cn } from "cn";
import { PlusIcon, SearchIcon } from "lucide-react";

/* ⌘K over everywhere the app can go.
 *
 * app-shell-5 ships an `app-search.tsx`, but it is a presentational stub: a
 * search-shaped input that focuses on ⌘K and searches nothing. What the shell
 * actually lacked was a keyboard route to its thirteen destinations, which until
 * now were reachable only by expanding the rail and clicking.
 *
 * Built on `ui/dialog`, which was installed during the shadcn work and had no
 * consumer at all — Radix gives us the focus trap, the Escape handling and the
 * scroll lock, so none of that is hand-rolled here.
 *
 * Deliberately NOT shadcn's `command`: that pulls in `cmdk`, and the entire
 * behaviour we need is a filtered list plus four key handlers. */

type Entry =
	| { kind: "nav"; key: NavKey; title: string; section?: string; icon?: React.ReactNode }
	| { kind: "action"; id: "add-trade"; title: string; section: string; icon: React.ReactNode };

export function AppSearch({ onAddTrade }: { onAddTrade: () => void }) {
	const { active, navigate } = useAppNav();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [cursor, setCursor] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useKeypress({
		combo: ["meta+k", "ctrl+k"],
		callback: () => setOpen((o) => !o),
	});

	// Built from the same `visibleNavGroups` the sidebar renders, so a parked
	// backend hides the page here too — the palette can never offer a door the
	// rail deliberately withholds.
	const entries = useMemo<Entry[]>(() => {
		const groups = visibleNavGroups({ brokerSync: brokerSyncConfigured });
		const nav: Entry[] = groups.flatMap((g) =>
			g.items.map((i) => ({
				kind: "nav" as const,
				key: i.key,
				title: i.title,
				section: g.label,
				icon: i.icon,
			})),
		);
		return [
			{
				kind: "action",
				id: "add-trade",
				title: "Log a trade",
				section: "Actions",
				icon: <PlusIcon />,
			},
			...nav,
		];
	}, []);

	const results = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return entries;
		// Matches the section label as well as the title, so "review" surfaces the
		// three pages grouped under it even though none of them says "review".
		return entries.filter(
			(e) =>
				e.title.toLowerCase().includes(q) ||
				(e.section ?? "").toLowerCase().includes(q),
		);
	}, [entries, query]);

	// A stale cursor from a previous query would highlight the wrong row, or a row
	// that no longer exists.
	useEffect(() => {
		setCursor(0);
	}, [query]);

	// Opening fresh every time: a palette that reopens holding last time's search
	// makes the shortcut unreliable — you can't tell what you're about to run.
	//
	// Focus is moved here rather than with `autoFocus`, which jsx-a11y rejects
	// outright and which would fire on mount instead of on open. A palette that
	// needs a click before it accepts typing defeats the shortcut entirely, so the
	// focus itself is not optional — only the mechanism. Radix hands focus back to
	// the trigger on close.
	useEffect(() => {
		if (open) {
			setQuery("");
			setCursor(0);
			// After Radix has mounted and positioned the content, or the focus lands
			// on an element that is about to move.
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [open]);

	// Keeps the highlighted row in view when arrowing past the visible window.
	useEffect(() => {
		listRef.current
			?.querySelector('[data-active="true"]')
			?.scrollIntoView({ block: "nearest" });
	}, [cursor]);

	function run(entry: Entry) {
		setOpen(false);
		if (entry.kind === "action") onAddTrade();
		else navigate(entry.key);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (results.length === 0) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setCursor((c) => (c + 1) % results.length);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setCursor((c) => (c - 1 + results.length) % results.length);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const entry = results[cursor];
			if (entry) run(entry);
		}
	}

	return (
		<>
			{/* The trigger is a search-shaped button rather than a real input: the
			    typing happens in the dialog, and a focusable input here that hands
			    focus straight to another input is a keyboard trap. Hidden below `md`,
			    where there is no keyboard to shortcut with and the header is tight. */}
			<button
				className={cn(
					"hidden h-7 items-center gap-2 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2",
					"text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground md:flex",
					"focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
				)}
				onClick={() => setOpen(true)}
				type="button"
			>
				<SearchIcon className="size-3.5" />
				<span className="pr-6">Search…</span>
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
			</button>

			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent
					className="top-[12%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 p-0 sm:max-w-lg"
					showCloseButton={false}
				>
					{/* Radix requires a title for the dialog to be announced; the visual
					    design has no room for one, so it's screen-reader only. */}
					<DialogTitle className="sr-only">Search the app</DialogTitle>
					<DialogDescription className="sr-only">
						Type to filter pages, then press Enter to go there.
					</DialogDescription>

					<div className="flex items-center gap-2 border-b px-3">
						<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
						<input
							className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							ref={inputRef}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Go to a page, or log a trade…"
							type="text"
							value={query}
						/>
					</div>

					<div className="max-h-80 overflow-y-auto p-1.5" ref={listRef}>
						{results.length === 0 ? (
							<p className="px-2.5 py-6 text-center text-muted-foreground text-sm">
								Nothing matches “{query}”.
							</p>
						) : (
							results.map((entry, i) => {
								const id = entry.kind === "action" ? entry.id : entry.key;
								const isHere = entry.kind === "nav" && entry.key === active;
								return (
									<button
										className={cn(
											"flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
											"[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
											i === cursor
												? "bg-muted text-foreground"
												: "text-foreground/80",
										)}
										data-active={i === cursor}
										key={id}
										// Pointer and keyboard drive the same single cursor, so the
										// highlight can never be in two places at once.
										onClick={() => run(entry)}
										onMouseMove={() => setCursor(i)}
										type="button"
									>
										{entry.icon}
										<span className="flex-1 truncate">{entry.title}</span>
										{isHere && (
											<span className="text-muted-foreground text-xs">
												Current
											</span>
										)}
										{entry.section && !isHere && (
											<span className="text-muted-foreground text-xs">
												{entry.section}
											</span>
										)}
									</button>
								);
							})
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
